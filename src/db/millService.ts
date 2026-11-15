import { Database, SqlValue } from 'sql.js';
import {
  AuditLogEntry,
  CashBookEntry,
  Customer,
  DashboardMetrics,
  ExpenseCategory,
  ExpenseRecord,
  GrindingMode,
  GrindingOrder,
  GrindingStatus,
  Language,
  LedgerEntry,
  MillSettings,
  PaymentMode,
  PeriodSummary,
  RateUnit,
  SaleRecord,
  StockItem,
  Supplier,
  WheatPurchase,
  PartyPayment,
} from '../types';
import {
  MANN_KG,
  nowTimestamp,
  round2,
  sha256,
  todayISO,
} from '../utils/format';
import {
  base64ToUint8,
  createAutoBackupSnapshot,
  exportDatabaseBytes,
  getDatabase,
  persistDatabase,
  resetFreshDatabase,
  restoreDatabaseFromBytes,
  uint8ToBase64,
} from './sqliteEngine';

// Prevent accidental double-tap duplicate submissions within 6 seconds
const recentMutations = new Map<string, number>();

function checkDuplicate(key: string): void {
  const now = Date.now();
  const prev = recentMutations.get(key);
  if (prev && now - prev < 6000) {
    throw new Error('DUPLICATE_SUBMISSION');
  }
  recentMutations.set(key, now);
  if (recentMutations.size > 50) {
    for (const [k, ts] of recentMutations.entries()) {
      if (now - ts > 15000) recentMutations.delete(k);
    }
  }
}

function queryAll<T = Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T = Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows[0] ?? null;
}

function getLastInsertId(db: Database): number {
  const res = queryOne<{ id: number }>(db, 'SELECT last_insert_rowid() AS id');
  return Number(res?.id ?? 0);
}

function nextVoucherNumber(db: Database, prefix: string, table: string, col: string, date: string): string {
  const compact = date.replace(/-/g, '');
  const likePattern = `${prefix}-${compact}-%`;
  const row = queryOne<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM ${table} WHERE ${col} LIKE ?`,
    [likePattern]
  );
  let seq = Number(row?.c ?? 0) + 1;
  while (true) {
    const candidate = `${prefix}-${compact}-${String(seq).padStart(3, '0')}`;
    const exists = queryOne<{ id: number }>(
      db,
      `SELECT id FROM ${table} WHERE ${col} = ?`,
      [candidate]
    );
    if (!exists) return candidate;
    seq++;
  }
}

function logAudit(
  db: Database,
  action: AuditLogEntry['action'],
  entityType: string,
  entityId: string | number,
  summary: string,
  details: unknown = {}
): void {
  db.run(
    'INSERT INTO audit_logs (timestamp, action, entity_type, entity_id, summary, details_json) VALUES (?, ?, ?, ?, ?, ?)',
    [nowTimestamp(), action, entityType, String(entityId), summary, JSON.stringify(details)]
  );
}

async function runAtomic<T>(fn: (db: Database) => T): Promise<T> {
  const db = await getDatabase();
  db.run('BEGIN TRANSACTION');
  try {
    const result = fn(db);
    db.run('COMMIT');
    await persistDatabase(true);
    return result;
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

// ================== SETTINGS & SECURITY ==================

export async function getSettings(): Promise<MillSettings> {
  const db = await getDatabase();
  const rows = queryAll<{ key: string; value: string }>(db, 'SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    millNameEn: map.get('mill_name_en') || 'Al-Madina Aata Chakki',
    millNameUr: map.get('mill_name_ur') || 'المدینہ آٹا چکی',
    phone: map.get('mill_phone') || '',
    address: map.get('mill_address') || '',
    language: (map.get('language') as Language) || 'ur',
    defaultGrindingRateMann: Number(map.get('default_grinding_rate_mann') || 240),
    defaultFlourRateKg: Number(map.get('default_flour_rate_kg') || 135),
    defaultBranRateKg: Number(map.get('default_bran_rate_kg') || 75),
    pinHash: map.get('pin_hash') || '',
    lastAutoBackupAt: map.get('last_auto_backup_at') || '',
  };
}

export async function updateSettings(partial: Partial<Omit<MillSettings, 'pinHash'>>): Promise<void> {
  await runAtomic((db) => {
    const entries: Array<[string, string | undefined]> = [
      ['mill_name_en', partial.millNameEn],
      ['mill_name_ur', partial.millNameUr],
      ['mill_phone', partial.phone],
      ['mill_address', partial.address],
      ['language', partial.language],
      ['default_grinding_rate_mann', partial.defaultGrindingRateMann !== undefined ? String(partial.defaultGrindingRateMann) : undefined],
      ['default_flour_rate_kg', partial.defaultFlourRateKg !== undefined ? String(partial.defaultFlourRateKg) : undefined],
      ['default_bran_rate_kg', partial.defaultBranRateKg !== undefined ? String(partial.defaultBranRateKg) : undefined],
    ];
    for (const [k, v] of entries) {
      if (v !== undefined) {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, v]);
      }
    }
  });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const settings = await getSettings();
  const hash = await sha256(pin);
  return hash === settings.pinHash;
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  if (!/^\d{4}$/.test(newPin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }
  const ok = await verifyPin(currentPin);
  if (!ok) {
    throw new Error('Current PIN is incorrect.');
  }
  const newHash = await sha256(newPin);
  await runAtomic((db) => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_hash', ?)", [newHash]);
    logAudit(db, 'UPDATE', 'security', 'pin', 'Security PIN updated');
  });
}

// ================== STOCK ==================

export async function getStockItems(): Promise<StockItem[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(
    db,
    'SELECT id, name_en, name_ur, category, qty_kg, default_rate_kg, updated_at FROM stock_items ORDER BY CASE id WHEN "wheat" THEN 1 WHEN "flour_chakki" THEN 2 WHEN "flour_fine" THEN 3 WHEN "flour_whole" THEN 4 ELSE 5 END'
  );
  return rows.map((r) => ({
    id: String(r.id),
    nameEn: String(r.name_en),
    nameUr: String(r.name_ur),
    category: r.category as StockItem['category'],
    qtyKg: round2(Number(r.qty_kg)),
    defaultRateKg: round2(Number(r.default_rate_kg)),
    updatedAt: String(r.updated_at),
  }));
}

export async function adjustStockItem(stockId: string, newQtyKg: number, defaultRateKg?: number): Promise<void> {
  if (newQtyKg < 0) throw new Error('Stock cannot be negative.');
  await runAtomic((db) => {
    const old = queryOne<{ qty_kg: number; name_en: string }>(db, 'SELECT qty_kg, name_en FROM stock_items WHERE id = ?', [stockId]);
    if (!old) throw new Error('Stock item not found.');
    const now = nowTimestamp();
    if (defaultRateKg !== undefined) {
      db.run('UPDATE stock_items SET qty_kg = ?, default_rate_kg = ?, updated_at = ? WHERE id = ?', [
        round2(newQtyKg),
        round2(defaultRateKg),
        now,
        stockId,
      ]);
    } else {
      db.run('UPDATE stock_items SET qty_kg = ?, updated_at = ? WHERE id = ?', [round2(newQtyKg), now, stockId]);
    }
    logAudit(db, 'UPDATE', 'stock', stockId, `Adjusted ${old.name_en}: ${old.qty_kg} KG -> ${round2(newQtyKg)} KG`, {
      beforeKg: old.qty_kg,
      afterKg: round2(newQtyKg),
    });
  });
}

// ================== CUSTOMERS & SUPPLIERS ==================

export async function getCustomers(): Promise<Customer[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(db, 'SELECT * FROM customers ORDER BY name ASC');
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    phone: String(r.phone || ''),
    address: String(r.address || ''),
    openingBalance: round2(Number(r.opening_balance)),
    balance: round2(Number(r.balance)),
    createdAt: String(r.created_at),
  }));
}

export async function saveCustomer(input: {
  id?: number;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
}): Promise<number> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error('Customer name is required.');
  if (input.openingBalance < 0) throw new Error('Opening balance cannot be negative.');

  return runAtomic((db) => {
    if (phone) {
      const dup = queryOne<{ id: number }>(
        db,
        'SELECT id FROM customers WHERE phone = ? AND id != ?',
        [phone, input.id ?? -1]
      );
      if (dup) throw new Error('A customer with this mobile number already exists.');
    }

    if (input.id) {
      const existing = queryOne<{ opening_balance: number; balance: number }>(
        db,
        'SELECT opening_balance, balance FROM customers WHERE id = ?',
        [input.id]
      );
      if (!existing) throw new Error('Customer not found.');
      const deltaOpening = round2(input.openingBalance - Number(existing.opening_balance));
      const newBalance = round2(Number(existing.balance) + deltaOpening);
      db.run(
        'UPDATE customers SET name = ?, phone = ?, address = ?, opening_balance = ?, balance = ? WHERE id = ?',
        [name, phone, input.address.trim(), round2(input.openingBalance), newBalance, input.id]
      );
      logAudit(db, 'UPDATE', 'customer', input.id, `Updated customer ${name}`, input);
      return input.id;
    } else {
      checkDuplicate(`customer:${name}:${phone}`);
      const now = nowTimestamp();
      const ob = round2(input.openingBalance);
      db.run(
        'INSERT INTO customers (name, phone, address, opening_balance, balance, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [name, phone, input.address.trim(), ob, ob, now]
      );
      const id = getLastInsertId(db);
      logAudit(db, 'CREATE', 'customer', id, `Created customer ${name}`, input);
      return id;
    }
  });
}

export async function deleteCustomer(id: number): Promise<void> {
  await runAtomic((db) => {
    const cust = queryOne<{ name: string; balance: number }>(db, 'SELECT name, balance FROM customers WHERE id = ?', [id]);
    if (!cust) throw new Error('Customer not found.');
    const hasHistory = queryOne<{ c: number }>(
      db,
      'SELECT (SELECT COUNT(*) FROM sales WHERE customer_id = ?) + (SELECT COUNT(*) FROM grinding_orders WHERE customer_id = ?) + (SELECT COUNT(*) FROM party_payments WHERE party_type="customer" AND party_id = ?) AS c',
      [id, id, id]
    );
    if (Number(hasHistory?.c ?? 0) > 0) {
      throw new Error('Cannot delete customer with existing transactions. Delete their transactions first.');
    }
    db.run('DELETE FROM customers WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'customer', id, `Deleted customer ${cust.name}`, cust);
  });
}

export async function getSuppliers(): Promise<Supplier[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(db, 'SELECT * FROM suppliers ORDER BY name ASC');
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    phone: String(r.phone || ''),
    address: String(r.address || ''),
    openingBalance: round2(Number(r.opening_balance)),
    balance: round2(Number(r.balance)),
    createdAt: String(r.created_at),
  }));
}

export async function saveSupplier(input: {
  id?: number;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
}): Promise<number> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error('Supplier name is required.');
  if (input.openingBalance < 0) throw new Error('Opening balance cannot be negative.');

  return runAtomic((db) => {
    if (phone) {
      const dup = queryOne<{ id: number }>(
        db,
        'SELECT id FROM suppliers WHERE phone = ? AND id != ?',
        [phone, input.id ?? -1]
      );
      if (dup) throw new Error('A supplier with this mobile number already exists.');
    }

    if (input.id) {
      const existing = queryOne<{ opening_balance: number; balance: number }>(
        db,
        'SELECT opening_balance, balance FROM suppliers WHERE id = ?',
        [input.id]
      );
      if (!existing) throw new Error('Supplier not found.');
      const deltaOpening = round2(input.openingBalance - Number(existing.opening_balance));
      const newBalance = round2(Number(existing.balance) + deltaOpening);
      db.run(
        'UPDATE suppliers SET name = ?, phone = ?, address = ?, opening_balance = ?, balance = ? WHERE id = ?',
        [name, phone, input.address.trim(), round2(input.openingBalance), newBalance, input.id]
      );
      logAudit(db, 'UPDATE', 'supplier', input.id, `Updated supplier ${name}`, input);
      return input.id;
    } else {
      checkDuplicate(`supplier:${name}:${phone}`);
      const now = nowTimestamp();
      const ob = round2(input.openingBalance);
      db.run(
        'INSERT INTO suppliers (name, phone, address, opening_balance, balance, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [name, phone, input.address.trim(), ob, ob, now]
      );
      const id = getLastInsertId(db);
      logAudit(db, 'CREATE', 'supplier', id, `Created supplier ${name}`, input);
      return id;
    }
  });
}

export async function deleteSupplier(id: number): Promise<void> {
  await runAtomic((db) => {
    const sup = queryOne<{ name: string }>(db, 'SELECT name FROM suppliers WHERE id = ?', [id]);
    if (!sup) throw new Error('Supplier not found.');
    const hasHistory = queryOne<{ c: number }>(
      db,
      'SELECT (SELECT COUNT(*) FROM wheat_purchases WHERE supplier_id = ?) + (SELECT COUNT(*) FROM party_payments WHERE party_type="supplier" AND party_id = ?) AS c',
      [id, id]
    );
    if (Number(hasHistory?.c ?? 0) > 0) {
      throw new Error('Cannot delete supplier with existing purchases or payments.');
    }
    db.run('DELETE FROM suppliers WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'supplier', id, `Deleted supplier ${sup.name}`, sup);
  });
}

// ================== WHEAT GRINDING ==================

export interface GrindingInput {
  date: string;
  mode: GrindingMode;
  customerId: number | null;
  customerName: string;
  wheatKg: number;
  flourKg: number;
  branKg: number;
  flourStockId: string;
  keepBranForMill: boolean;
  grindingRate: number;
  rateUnit: RateUnit;
  grindingFee: number;
  paidAmount: number;
  paymentMode: PaymentMode;
  status: GrindingStatus;
  notes: string;
}

function applyGrindingEffects(db: Database, id: number, receiptNo: string, input: GrindingInput): void {
  const now = nowTimestamp();
  if (input.mode === 'mill') {
    const wheatStock = queryOne<{ qty_kg: number }>(db, "SELECT qty_kg FROM stock_items WHERE id = 'wheat'");
    const avail = round2(Number(wheatStock?.qty_kg ?? 0));
    if (avail < input.wheatKg) {
      throw new Error(`Insufficient wheat stock (${avail} KG available, need ${input.wheatKg} KG).`);
    }
    db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg - ?, 2), updated_at = ? WHERE id = 'wheat'", [
      input.wheatKg,
      now,
    ]);
    db.run('UPDATE stock_items SET qty_kg = ROUND(qty_kg + ?, 2), updated_at = ? WHERE id = ?', [
      input.flourKg,
      now,
      input.flourStockId || 'flour_chakki',
    ]);
    if (input.branKg > 0) {
      db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg + ?, 2), updated_at = ? WHERE id = 'bran'", [
        input.branKg,
        now,
      ]);
    }
  } else {
    // Customer grinding
    if (input.keepBranForMill && input.branKg > 0) {
      db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg + ?, 2), updated_at = ? WHERE id = 'bran'", [
        input.branKg,
        now,
      ]);
    }
    if (input.paidAmount > 0) {
      db.run(
        'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        [
          input.date,
          'grinding',
          id,
          receiptNo,
          `Grinding Fee - ${input.customerName} (${input.wheatKg} KG)`,
          round2(input.paidAmount),
          now,
        ]
      );
    }
    const due = round2(input.grindingFee - input.paidAmount);
    if (due > 0 && input.customerId) {
      db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [due, input.customerId]);
      db.run(
        'INSERT INTO customer_ledger (date, customer_id, ref_type, ref_id, ref_no, description, debit, credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
        [
          input.date,
          input.customerId,
          'grinding',
          id,
          receiptNo,
          `Wheat Grinding (${input.wheatKg} KG) · Fee ${input.grindingFee}, Paid ${input.paidAmount}`,
          due,
          now,
        ]
      );
    }
  }
}

function reverseGrindingEffects(db: Database, old: Record<string, SqlValue>): void {
  const now = nowTimestamp();
  const id = Number(old.id);
  const mode = String(old.mode) as GrindingMode;
  const wheatKg = Number(old.wheat_kg);
  const flourKg = Number(old.flour_kg);
  const branKg = Number(old.bran_kg);
  const flourStockId = String(old.flour_stock_id || 'flour_chakki');
  const keepBran = Number(old.keep_bran_for_mill) === 1;
  const fee = Number(old.grinding_fee);
  const paid = Number(old.paid_amount);
  const customerId = old.customer_id ? Number(old.customer_id) : null;

  if (mode === 'mill') {
    const flStock = queryOne<{ qty_kg: number }>(db, 'SELECT qty_kg FROM stock_items WHERE id = ?', [flourStockId]);
    if (Number(flStock?.qty_kg ?? 0) < flourKg) {
      throw new Error('Cannot edit/delete this mill production: produced flour has already been sold.');
    }
    if (branKg > 0) {
      const brStock = queryOne<{ qty_kg: number }>(db, "SELECT qty_kg FROM stock_items WHERE id = 'bran'");
      if (Number(brStock?.qty_kg ?? 0) < branKg) {
        throw new Error('Cannot edit/delete this mill production: produced bran has already been sold.');
      }
      db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg - ?, 2), updated_at = ? WHERE id = 'bran'", [branKg, now]);
    }
    db.run('UPDATE stock_items SET qty_kg = ROUND(qty_kg - ?, 2), updated_at = ? WHERE id = ?', [
      flourKg,
      now,
      flourStockId,
    ]);
    db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg + ?, 2), updated_at = ? WHERE id = 'wheat'", [
      wheatKg,
      now,
    ]);
  } else {
    if (keepBran && branKg > 0) {
      const brStock = queryOne<{ qty_kg: number }>(db, "SELECT qty_kg FROM stock_items WHERE id = 'bran'");
      if (Number(brStock?.qty_kg ?? 0) < branKg) {
        throw new Error('Cannot reverse bran stock: bran has already been sold.');
      }
      db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg - ?, 2), updated_at = ? WHERE id = 'bran'", [branKg, now]);
    }
    const due = round2(fee - paid);
    if (due > 0 && customerId) {
      db.run('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [due, customerId]);
    }
    db.run("DELETE FROM cash_book WHERE ref_type = 'grinding' AND ref_id = ?", [id]);
    db.run("DELETE FROM customer_ledger WHERE ref_type = 'grinding' AND ref_id = ?", [id]);
  }
}

export async function getGrindingOrders(): Promise<GrindingOrder[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(
    db,
    'SELECT * FROM grinding_orders ORDER BY date DESC, id DESC'
  );
  return rows.map((r) => ({
    id: Number(r.id),
    receiptNo: String(r.receipt_no),
    date: String(r.date),
    mode: String(r.mode) as GrindingMode,
    customerId: r.customer_id ? Number(r.customer_id) : null,
    customerName: String(r.customer_name),
    wheatKg: round2(Number(r.wheat_kg)),
    flourKg: round2(Number(r.flour_kg)),
    branKg: round2(Number(r.bran_kg)),
    flourStockId: String(r.flour_stock_id),
    keepBranForMill: Number(r.keep_bran_for_mill) === 1,
    grindingRate: round2(Number(r.grinding_rate)),
    rateUnit: String(r.rate_unit) as RateUnit,
    grindingFee: round2(Number(r.grinding_fee)),
    paidAmount: round2(Number(r.paid_amount)),
    paymentMode: String(r.payment_mode) as PaymentMode,
    status: String(r.status) as GrindingStatus,
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export async function saveGrindingOrder(input: GrindingInput, editId?: number): Promise<number> {
  if (input.wheatKg <= 0) throw new Error('Wheat weight must be greater than zero.');
  if (input.flourKg < 0 || input.branKg < 0) throw new Error('Outputs cannot be negative.');
  if (input.flourKg + input.branKg > input.wheatKg * 1.05) {
    throw new Error('Total flour + bran output cannot exceed wheat weight.');
  }
  if (input.mode === 'customer' && input.paymentMode !== 'cash' && !input.customerId) {
    throw new Error('Select a registered customer for credit grinding.');
  }
  if (input.paidAmount > input.grindingFee) {
    throw new Error('Paid amount cannot exceed grinding charges.');
  }

  return runAtomic((db) => {
    const now = nowTimestamp();
    if (editId) {
      const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM grinding_orders WHERE id = ?', [editId]);
      if (!old) throw new Error('Grinding record not found.');
      reverseGrindingEffects(db, old);

      db.run(
        `UPDATE grinding_orders SET date=?, mode=?, customer_id=?, customer_name=?, wheat_kg=?, flour_kg=?, bran_kg=?, flour_stock_id=?, keep_bran_for_mill=?, grinding_rate=?, rate_unit=?, grinding_fee=?, paid_amount=?, payment_mode=?, status=?, notes=? WHERE id=?`,
        [
          input.date,
          input.mode,
          input.customerId,
          input.customerName,
          round2(input.wheatKg),
          round2(input.flourKg),
          round2(input.branKg),
          input.flourStockId || 'flour_chakki',
          input.keepBranForMill ? 1 : 0,
          round2(input.grindingRate),
          input.rateUnit,
          round2(input.grindingFee),
          round2(input.paidAmount),
          input.paymentMode,
          input.status,
          input.notes.trim(),
          editId,
        ]
      );
      applyGrindingEffects(db, editId, String(old.receipt_no), input);
      logAudit(db, 'UPDATE', 'grinding', editId, `Updated grinding ${old.receipt_no}`, { before: old, after: input });
      return editId;
    } else {
      checkDuplicate(`grinding:${input.date}:${input.mode}:${input.customerId}:${input.wheatKg}:${input.grindingFee}`);
      const receiptNo = nextVoucherNumber(db, 'GR', 'grinding_orders', 'receipt_no', input.date);
      db.run(
        `INSERT INTO grinding_orders (receipt_no, date, mode, customer_id, customer_name, wheat_kg, flour_kg, bran_kg, flour_stock_id, keep_bran_for_mill, grinding_rate, rate_unit, grinding_fee, paid_amount, payment_mode, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptNo,
          input.date,
          input.mode,
          input.customerId,
          input.customerName,
          round2(input.wheatKg),
          round2(input.flourKg),
          round2(input.branKg),
          input.flourStockId || 'flour_chakki',
          input.keepBranForMill ? 1 : 0,
          round2(input.grindingRate),
          input.rateUnit,
          round2(input.grindingFee),
          round2(input.paidAmount),
          input.paymentMode,
          input.status,
          input.notes.trim(),
          now,
        ]
      );
      const id = getLastInsertId(db);
      applyGrindingEffects(db, id, receiptNo, input);
      logAudit(db, 'CREATE', 'grinding', id, `Created grinding ${receiptNo} (${input.wheatKg} KG)`, input);
      return id;
    }
  });
}

export async function updateGrindingStatus(id: number, status: GrindingStatus): Promise<void> {
  await runAtomic((db) => {
    db.run('UPDATE grinding_orders SET status = ? WHERE id = ?', [status, id]);
    logAudit(db, 'UPDATE', 'grinding', id, `Changed grinding status to ${status}`);
  });
}

export async function deleteGrindingOrder(id: number): Promise<void> {
  await runAtomic((db) => {
    const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM grinding_orders WHERE id = ?', [id]);
    if (!old) throw new Error('Grinding record not found.');
    reverseGrindingEffects(db, old);
    db.run('DELETE FROM grinding_orders WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'grinding', id, `Deleted grinding ${old.receipt_no}`, old);
  });
}

// ================== WHEAT PURCHASE ==================

export interface WheatPurchaseInput {
  date: string;
  supplierId: number;
  weightKg: number;
  rate: number;
  rateUnit: RateUnit;
  totalAmount: number;
  paidAmount: number;
  paymentMode: PaymentMode;
  notes: string;
}

function applyPurchaseEffects(
  db: Database,
  id: number,
  invoiceNo: string,
  supplierName: string,
  input: WheatPurchaseInput
): void {
  const now = nowTimestamp();
  db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg + ?, 2), updated_at = ? WHERE id = 'wheat'", [
    round2(input.weightKg),
    now,
  ]);
  if (input.paidAmount > 0) {
    db.run(
      'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      [
        input.date,
        'purchase',
        id,
        invoiceNo,
        `Wheat Purchase - ${supplierName} (${input.weightKg} KG)`,
        round2(input.paidAmount),
        now,
      ]
    );
  }
  const due = round2(input.totalAmount - input.paidAmount);
  if (due > 0) {
    db.run('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [due, input.supplierId]);
    db.run(
      'INSERT INTO supplier_ledger (date, supplier_id, ref_type, ref_id, ref_no, description, credit, debit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
      [
        input.date,
        input.supplierId,
        'purchase',
        id,
        invoiceNo,
        `Wheat Purchase (${input.weightKg} KG) · Total ${input.totalAmount}, Paid ${input.paidAmount}`,
        due,
        now,
      ]
    );
  }
}

function reversePurchaseEffects(db: Database, old: Record<string, SqlValue>): void {
  const now = nowTimestamp();
  const id = Number(old.id);
  const weightKg = Number(old.weight_kg);
  const wheatStock = queryOne<{ qty_kg: number }>(db, "SELECT qty_kg FROM stock_items WHERE id = 'wheat'");
  if (Number(wheatStock?.qty_kg ?? 0) < weightKg) {
    throw new Error('Cannot edit/delete this purchase: part of the wheat stock has already been ground.');
  }
  db.run("UPDATE stock_items SET qty_kg = ROUND(qty_kg - ?, 2), updated_at = ? WHERE id = 'wheat'", [weightKg, now]);
  const due = round2(Number(old.total_amount) - Number(old.paid_amount));
  if (due > 0) {
    db.run('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [due, Number(old.supplier_id)]);
  }
  db.run("DELETE FROM cash_book WHERE ref_type = 'purchase' AND ref_id = ?", [id]);
  db.run("DELETE FROM supplier_ledger WHERE ref_type = 'purchase' AND ref_id = ?", [id]);
}

export async function getWheatPurchases(): Promise<WheatPurchase[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(
    db,
    'SELECT p.*, s.name AS supplier_name FROM wheat_purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.date DESC, p.id DESC'
  );
  return rows.map((r) => ({
    id: Number(r.id),
    invoiceNo: String(r.invoice_no),
    date: String(r.date),
    supplierId: Number(r.supplier_id),
    supplierName: String(r.supplier_name || ''),
    weightKg: round2(Number(r.weight_kg)),
    rate: round2(Number(r.rate)),
    rateUnit: String(r.rate_unit) as RateUnit,
    totalAmount: round2(Number(r.total_amount)),
    paidAmount: round2(Number(r.paid_amount)),
    paymentMode: String(r.payment_mode) as PaymentMode,
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export async function saveWheatPurchase(input: WheatPurchaseInput, editId?: number): Promise<number> {
  if (!input.supplierId) throw new Error('Please select a supplier.');
  if (input.weightKg <= 0 || input.totalAmount <= 0) {
    throw new Error('Weight and total amount must be greater than zero.');
  }
  if (input.paidAmount > input.totalAmount) {
    throw new Error('Paid amount cannot exceed total purchase amount.');
  }

  return runAtomic((db) => {
    const sup = queryOne<{ name: string }>(db, 'SELECT name FROM suppliers WHERE id = ?', [input.supplierId]);
    if (!sup) throw new Error('Supplier not found.');
    const now = nowTimestamp();

    if (editId) {
      const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM wheat_purchases WHERE id = ?', [editId]);
      if (!old) throw new Error('Purchase record not found.');
      reversePurchaseEffects(db, old);
      db.run(
        `UPDATE wheat_purchases SET date=?, supplier_id=?, weight_kg=?, rate=?, rate_unit=?, total_amount=?, paid_amount=?, payment_mode=?, notes=? WHERE id=?`,
        [
          input.date,
          input.supplierId,
          round2(input.weightKg),
          round2(input.rate),
          input.rateUnit,
          round2(input.totalAmount),
          round2(input.paidAmount),
          input.paymentMode,
          input.notes.trim(),
          editId,
        ]
      );
      applyPurchaseEffects(db, editId, String(old.invoice_no), sup.name, input);
      logAudit(db, 'UPDATE', 'purchase', editId, `Updated wheat purchase ${old.invoice_no}`, { before: old, after: input });
      return editId;
    } else {
      checkDuplicate(`purchase:${input.date}:${input.supplierId}:${input.weightKg}:${input.totalAmount}`);
      const invoiceNo = nextVoucherNumber(db, 'WP', 'wheat_purchases', 'invoice_no', input.date);
      db.run(
        `INSERT INTO wheat_purchases (invoice_no, date, supplier_id, weight_kg, rate, rate_unit, total_amount, paid_amount, payment_mode, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNo,
          input.date,
          input.supplierId,
          round2(input.weightKg),
          round2(input.rate),
          input.rateUnit,
          round2(input.totalAmount),
          round2(input.paidAmount),
          input.paymentMode,
          input.notes.trim(),
          now,
        ]
      );
      const id = getLastInsertId(db);
      applyPurchaseEffects(db, id, invoiceNo, sup.name, input);
      logAudit(db, 'CREATE', 'purchase', id, `Purchased ${input.weightKg} KG wheat (${invoiceNo})`, input);
      return id;
    }
  });
}

export async function deleteWheatPurchase(id: number): Promise<void> {
  await runAtomic((db) => {
    const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM wheat_purchases WHERE id = ?', [id]);
    if (!old) throw new Error('Purchase record not found.');
    reversePurchaseEffects(db, old);
    db.run('DELETE FROM wheat_purchases WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'purchase', id, `Deleted wheat purchase ${old.invoice_no}`, old);
  });
}

// ================== FLOUR & BRAN SALES ==================

export interface SaleInput {
  date: string;
  saleType: 'flour' | 'bran';
  stockId: string;
  customerId: number | null;
  customerName: string;
  weightKg: number;
  rate: number;
  rateUnit: RateUnit;
  grossAmount: number;
  discount: number;
  netAmount: number;
  paidAmount: number;
  paymentMode: PaymentMode;
  notes: string;
}

function applySaleEffects(db: Database, id: number, invoiceNo: string, input: SaleInput): void {
  const now = nowTimestamp();
  const stock = queryOne<{ qty_kg: number; name_en: string }>(
    db,
    'SELECT qty_kg, name_en FROM stock_items WHERE id = ?',
    [input.stockId]
  );
  if (!stock) throw new Error('Selected stock item does not exist.');
  const avail = round2(Number(stock.qty_kg));
  if (avail < input.weightKg) {
    throw new Error(`Insufficient stock for ${stock.name_en}: ${avail} KG available.`);
  }
  db.run('UPDATE stock_items SET qty_kg = ROUND(qty_kg - ?, 2), updated_at = ? WHERE id = ?', [
    round2(input.weightKg),
    now,
    input.stockId,
  ]);
  if (input.paidAmount > 0) {
    db.run(
      'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [
        input.date,
        'sale',
        id,
        invoiceNo,
        `${input.saleType === 'flour' ? 'Flour' : 'Bran'} Sale - ${input.customerName} (${input.weightKg} KG)`,
        round2(input.paidAmount),
        now,
      ]
    );
  }
  const due = round2(input.netAmount - input.paidAmount);
  if (due > 0 && input.customerId) {
    db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [due, input.customerId]);
    db.run(
      'INSERT INTO customer_ledger (date, customer_id, ref_type, ref_id, ref_no, description, debit, credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
      [
        input.date,
        input.customerId,
        'sale',
        id,
        invoiceNo,
        `${stock.name_en} (${input.weightKg} KG) · Net ${input.netAmount}, Paid ${input.paidAmount}`,
        due,
        now,
      ]
    );
  }
}

function reverseSaleEffects(db: Database, old: Record<string, SqlValue>): void {
  const now = nowTimestamp();
  const id = Number(old.id);
  db.run('UPDATE stock_items SET qty_kg = ROUND(qty_kg + ?, 2), updated_at = ? WHERE id = ?', [
    Number(old.weight_kg),
    now,
    String(old.stock_id),
  ]);
  const due = round2(Number(old.net_amount) - Number(old.paid_amount));
  if (due > 0 && old.customer_id) {
    db.run('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [due, Number(old.customer_id)]);
  }
  db.run("DELETE FROM cash_book WHERE ref_type = 'sale' AND ref_id = ?", [id]);
  db.run("DELETE FROM customer_ledger WHERE ref_type = 'sale' AND ref_id = ?", [id]);
}

export async function getSales(saleType?: 'flour' | 'bran'): Promise<SaleRecord[]> {
  const db = await getDatabase();
  const sql = saleType
    ? 'SELECT s.*, st.name_en AS stock_name_en, st.name_ur AS stock_name_ur FROM sales s LEFT JOIN stock_items st ON s.stock_id = st.id WHERE s.sale_type = ? ORDER BY s.date DESC, s.id DESC'
    : 'SELECT s.*, st.name_en AS stock_name_en, st.name_ur AS stock_name_ur FROM sales s LEFT JOIN stock_items st ON s.stock_id = st.id ORDER BY s.date DESC, s.id DESC';
  const rows = queryAll<Record<string, SqlValue>>(db, sql, saleType ? [saleType] : []);
  return rows.map((r) => ({
    id: Number(r.id),
    invoiceNo: String(r.invoice_no),
    date: String(r.date),
    saleType: String(r.sale_type) as 'flour' | 'bran',
    stockId: String(r.stock_id),
    stockNameEn: String(r.stock_name_en || ''),
    stockNameUr: String(r.stock_name_ur || ''),
    customerId: r.customer_id ? Number(r.customer_id) : null,
    customerName: String(r.customer_name),
    weightKg: round2(Number(r.weight_kg)),
    rate: round2(Number(r.rate)),
    rateUnit: String(r.rate_unit) as RateUnit,
    grossAmount: round2(Number(r.gross_amount)),
    discount: round2(Number(r.discount)),
    netAmount: round2(Number(r.net_amount)),
    paidAmount: round2(Number(r.paid_amount)),
    paymentMode: String(r.payment_mode) as PaymentMode,
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export async function saveSale(input: SaleInput, editId?: number): Promise<number> {
  if (input.weightKg <= 0 || input.netAmount < 0) {
    throw new Error('Weight must be positive and net amount cannot be negative.');
  }
  if (input.paymentMode !== 'cash' && !input.customerId) {
    throw new Error('Please select a customer for credit or partial payment.');
  }
  if (input.paidAmount > input.netAmount) {
    throw new Error('Paid amount cannot exceed net total.');
  }

  return runAtomic((db) => {
    const now = nowTimestamp();
    if (editId) {
      const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM sales WHERE id = ?', [editId]);
      if (!old) throw new Error('Sale record not found.');
      reverseSaleEffects(db, old);
      db.run(
        `UPDATE sales SET date=?, sale_type=?, stock_id=?, customer_id=?, customer_name=?, weight_kg=?, rate=?, rate_unit=?, gross_amount=?, discount=?, net_amount=?, paid_amount=?, payment_mode=?, notes=? WHERE id=?`,
        [
          input.date,
          input.saleType,
          input.stockId,
          input.customerId,
          input.customerName,
          round2(input.weightKg),
          round2(input.rate),
          input.rateUnit,
          round2(input.grossAmount),
          round2(input.discount),
          round2(input.netAmount),
          round2(input.paidAmount),
          input.paymentMode,
          input.notes.trim(),
          editId,
        ]
      );
      applySaleEffects(db, editId, String(old.invoice_no), input);
      logAudit(db, 'UPDATE', 'sale', editId, `Updated sale ${old.invoice_no}`, { before: old, after: input });
      return editId;
    } else {
      checkDuplicate(`sale:${input.date}:${input.stockId}:${input.customerId}:${input.weightKg}:${input.netAmount}`);
      const prefix = input.saleType === 'flour' ? 'FL' : 'BR';
      const invoiceNo = nextVoucherNumber(db, prefix, 'sales', 'invoice_no', input.date);
      db.run(
        `INSERT INTO sales (invoice_no, date, sale_type, stock_id, customer_id, customer_name, weight_kg, rate, rate_unit, gross_amount, discount, net_amount, paid_amount, payment_mode, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNo,
          input.date,
          input.saleType,
          input.stockId,
          input.customerId,
          input.customerName,
          round2(input.weightKg),
          round2(input.rate),
          input.rateUnit,
          round2(input.grossAmount),
          round2(input.discount),
          round2(input.netAmount),
          round2(input.paidAmount),
          input.paymentMode,
          input.notes.trim(),
          now,
        ]
      );
      const id = getLastInsertId(db);
      applySaleEffects(db, id, invoiceNo, input);
      logAudit(db, 'CREATE', 'sale', id, `Created ${input.saleType} sale ${invoiceNo} (${input.weightKg} KG)`, input);
      return id;
    }
  });
}

export async function deleteSale(id: number): Promise<void> {
  await runAtomic((db) => {
    const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM sales WHERE id = ?', [id]);
    if (!old) throw new Error('Sale record not found.');
    reverseSaleEffects(db, old);
    db.run('DELETE FROM sales WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'sale', id, `Deleted sale ${old.invoice_no}`, old);
  });
}

// ================== PARTY PAYMENTS (CUSTOMER RECEIPTS & SUPPLIER PAYMENTS) ==================

export interface PaymentInput {
  date: string;
  partyType: 'customer' | 'supplier';
  partyId: number;
  amount: number;
  notes: string;
}

export async function recordPartyPayment(input: PaymentInput): Promise<number> {
  if (!input.partyId || input.amount <= 0) {
    throw new Error('Select a party and enter a positive amount.');
  }
  return runAtomic((db) => {
    checkDuplicate(`payment:${input.date}:${input.partyType}:${input.partyId}:${input.amount}`);
    const now = nowTimestamp();
    const direction = input.partyType === 'customer' ? 'in' : 'out';
    const receiptNo = nextVoucherNumber(db, 'PM', 'party_payments', 'receipt_no', input.date);
    const amt = round2(input.amount);

    if (input.partyType === 'customer') {
      const cust = queryOne<{ name: string }>(db, 'SELECT name FROM customers WHERE id = ?', [input.partyId]);
      if (!cust) throw new Error('Customer not found.');
      db.run(
        'INSERT INTO party_payments (receipt_no, date, party_type, party_id, amount, direction, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [receiptNo, input.date, 'customer', input.partyId, amt, 'in', input.notes.trim(), now]
      );
      const id = getLastInsertId(db);
      db.run('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [amt, input.partyId]);
      db.run(
        'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        [input.date, 'payment_in', id, receiptNo, `Cash Received from ${cust.name}`, amt, now]
      );
      db.run(
        'INSERT INTO customer_ledger (date, customer_id, ref_type, ref_id, ref_no, description, debit, credit, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
        [input.date, input.partyId, 'payment_in', id, receiptNo, input.notes.trim() || 'Cash Payment Received', amt, now]
      );
      logAudit(db, 'CREATE', 'payment', id, `Received Rs ${amt} from ${cust.name}`, input);
      return id;
    } else {
      const sup = queryOne<{ name: string }>(db, 'SELECT name FROM suppliers WHERE id = ?', [input.partyId]);
      if (!sup) throw new Error('Supplier not found.');
      db.run(
        'INSERT INTO party_payments (receipt_no, date, party_type, party_id, amount, direction, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [receiptNo, input.date, 'supplier', input.partyId, amt, direction, input.notes.trim(), now]
      );
      const id = getLastInsertId(db);
      db.run('UPDATE suppliers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [amt, input.partyId]);
      db.run(
        'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
        [input.date, 'payment_out', id, receiptNo, `Paid to Supplier ${sup.name}`, amt, now]
      );
      db.run(
        'INSERT INTO supplier_ledger (date, supplier_id, ref_type, ref_id, ref_no, description, credit, debit, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
        [input.date, input.partyId, 'payment_out', id, receiptNo, input.notes.trim() || 'Cash Paid to Supplier', amt, now]
      );
      logAudit(db, 'CREATE', 'payment', id, `Paid Rs ${amt} to ${sup.name}`, input);
      return id;
    }
  });
}

export async function deletePartyPayment(id: number): Promise<void> {
  await runAtomic((db) => {
    const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM party_payments WHERE id = ?', [id]);
    if (!old) throw new Error('Payment record not found.');
    const amt = Number(old.amount);
    const partyId = Number(old.party_id);
    if (old.party_type === 'customer') {
      db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [amt, partyId]);
      db.run("DELETE FROM cash_book WHERE ref_type = 'payment_in' AND ref_id = ?", [id]);
      db.run("DELETE FROM customer_ledger WHERE ref_type = 'payment_in' AND ref_id = ?", [id]);
    } else {
      db.run('UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [amt, partyId]);
      db.run("DELETE FROM cash_book WHERE ref_type = 'payment_out' AND ref_id = ?", [id]);
      db.run("DELETE FROM supplier_ledger WHERE ref_type = 'payment_out' AND ref_id = ?", [id]);
    }
    db.run('DELETE FROM party_payments WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'payment', id, `Deleted payment ${old.receipt_no}`, old);
  });
}

// ================== EXPENSES ==================

export interface ExpenseInput {
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
}

export async function getExpenses(): Promise<ExpenseRecord[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(db, 'SELECT * FROM expenses ORDER BY date DESC, id DESC');
  return rows.map((r) => ({
    id: Number(r.id),
    voucherNo: String(r.voucher_no),
    date: String(r.date),
    category: String(r.category) as ExpenseCategory,
    amount: round2(Number(r.amount)),
    description: String(r.description || ''),
    createdAt: String(r.created_at),
  }));
}

export async function saveExpense(input: ExpenseInput, editId?: number): Promise<number> {
  if (input.amount <= 0) throw new Error('Expense amount must be greater than zero.');
  return runAtomic((db) => {
    const now = nowTimestamp();
    const amt = round2(input.amount);
    if (editId) {
      const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM expenses WHERE id = ?', [editId]);
      if (!old) throw new Error('Expense record not found.');
      db.run('UPDATE expenses SET date=?, category=?, amount=?, description=? WHERE id=?', [
        input.date,
        input.category,
        amt,
        input.description.trim(),
        editId,
      ]);
      db.run("DELETE FROM cash_book WHERE ref_type = 'expense' AND ref_id = ?", [editId]);
      db.run(
        'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
        [
          input.date,
          'expense',
          editId,
          String(old.voucher_no),
          `Expense (${input.category}): ${input.description.trim() || input.category}`,
          amt,
          now,
        ]
      );
      logAudit(db, 'UPDATE', 'expense', editId, `Updated expense ${old.voucher_no}`, { before: old, after: input });
      return editId;
    } else {
      checkDuplicate(`expense:${input.date}:${input.category}:${amt}:${input.description}`);
      const voucherNo = nextVoucherNumber(db, 'EX', 'expenses', 'voucher_no', input.date);
      db.run(
        'INSERT INTO expenses (voucher_no, date, category, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [voucherNo, input.date, input.category, amt, input.description.trim(), now]
      );
      const id = getLastInsertId(db);
      db.run(
        'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
        [
          input.date,
          'expense',
          id,
          voucherNo,
          `Expense (${input.category}): ${input.description.trim() || input.category}`,
          amt,
          now,
        ]
      );
      logAudit(db, 'CREATE', 'expense', id, `Recorded expense ${voucherNo} (${amt})`, input);
      return id;
    }
  });
}

export async function deleteExpense(id: number): Promise<void> {
  await runAtomic((db) => {
    const old = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM expenses WHERE id = ?', [id]);
    if (!old) throw new Error('Expense record not found.');
    db.run("DELETE FROM cash_book WHERE ref_type = 'expense' AND ref_id = ?", [id]);
    db.run('DELETE FROM expenses WHERE id = ?', [id]);
    logAudit(db, 'DELETE', 'expense', id, `Deleted expense ${old.voucher_no}`, old);
  });
}

// ================== LEDGERS & CASH BOOK ==================

export async function addCashAdjustment(date: string, direction: 'in' | 'out', amount: number, description: string): Promise<void> {
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  await runAtomic((db) => {
    const now = nowTimestamp();
    const amt = round2(amount);
    db.run(
      'INSERT INTO cash_book (date, ref_type, ref_id, ref_no, description, cash_in, cash_out, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
      [
        date,
        'cash_adjust',
        'ADJ',
        description.trim() || (direction === 'in' ? 'Cash Deposit / Opening' : 'Cash Withdrawal'),
        direction === 'in' ? amt : 0,
        direction === 'out' ? amt : 0,
        now,
      ]
    );
    logAudit(db, 'CREATE', 'cash_book', 'ADJ', `Cash adjustment ${direction}: ${amt}`, { date, direction, amt, description });
  });
}

export async function getCashBook(): Promise<CashBookEntry[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(db, 'SELECT * FROM cash_book ORDER BY date ASC, id ASC');
  let running = 0;
  const entries: CashBookEntry[] = rows.map((r) => {
    const cin = round2(Number(r.cash_in));
    const cout = round2(Number(r.cash_out));
    running = round2(running + cin - cout);
    return {
      id: Number(r.id),
      date: String(r.date),
      refType: String(r.ref_type),
      refId: r.ref_id ? Number(r.ref_id) : null,
      refNo: String(r.ref_no || ''),
      description: String(r.description),
      cashIn: cin,
      cashOut: cout,
      runningBalance: running,
      createdAt: String(r.created_at),
    };
  });
  return entries.reverse(); // newest first for UI display
}

export async function getCustomerLedger(customerId: number): Promise<{ customer: Customer; entries: LedgerEntry[] }> {
  const db = await getDatabase();
  const custRow = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM customers WHERE id = ?', [customerId]);
  if (!custRow) throw new Error('Customer not found.');
  const customer: Customer = {
    id: Number(custRow.id),
    name: String(custRow.name),
    phone: String(custRow.phone || ''),
    address: String(custRow.address || ''),
    openingBalance: round2(Number(custRow.opening_balance)),
    balance: round2(Number(custRow.balance)),
    createdAt: String(custRow.created_at),
  };

  const rows = queryAll<Record<string, SqlValue>>(
    db,
    'SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC',
    [customerId]
  );
  let running = customer.openingBalance;
  const entries: LedgerEntry[] = rows.map((r) => {
    const debit = round2(Number(r.debit));
    const credit = round2(Number(r.credit));
    running = round2(running + debit - credit);
    return {
      id: Number(r.id),
      date: String(r.date),
      partyId: customerId,
      refType: String(r.ref_type),
      refId: r.ref_id ? Number(r.ref_id) : null,
      refNo: String(r.ref_no || ''),
      description: String(r.description),
      debit,
      credit,
      runningBalance: running,
      createdAt: String(r.created_at),
    };
  });
  return { customer, entries: entries.reverse() };
}

export async function getSupplierLedger(supplierId: number): Promise<{ supplier: Supplier; entries: LedgerEntry[] }> {
  const db = await getDatabase();
  const supRow = queryOne<Record<string, SqlValue>>(db, 'SELECT * FROM suppliers WHERE id = ?', [supplierId]);
  if (!supRow) throw new Error('Supplier not found.');
  const supplier: Supplier = {
    id: Number(supRow.id),
    name: String(supRow.name),
    phone: String(supRow.phone || ''),
    address: String(supRow.address || ''),
    openingBalance: round2(Number(supRow.opening_balance)),
    balance: round2(Number(supRow.balance)),
    createdAt: String(supRow.created_at),
  };

  const rows = queryAll<Record<string, SqlValue>>(
    db,
    'SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY date ASC, id ASC',
    [supplierId]
  );
  let running = supplier.openingBalance;
  const entries: LedgerEntry[] = rows.map((r) => {
    const credit = round2(Number(r.credit)); // payable increase
    const debit = round2(Number(r.debit));   // payment decrease
    running = round2(running + credit - debit);
    return {
      id: Number(r.id),
      date: String(r.date),
      partyId: supplierId,
      refType: String(r.ref_type),
      refId: r.ref_id ? Number(r.ref_id) : null,
      refNo: String(r.ref_no || ''),
      description: String(r.description),
      debit,
      credit,
      runningBalance: running,
      createdAt: String(r.created_at),
    };
  });
  return { supplier, entries: entries.reverse() };
}

export async function getAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
  const db = await getDatabase();
  const rows = queryAll<Record<string, SqlValue>>(
    db,
    'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?',
    [limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    timestamp: String(r.timestamp),
    action: String(r.action) as AuditLogEntry['action'],
    entityType: String(r.entity_type),
    entityId: String(r.entity_id || ''),
    summary: String(r.summary),
    detailsJson: String(r.details_json || ''),
  }));
}

// ================== DASHBOARD & REPORTS ==================

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const db = await getDatabase();
  const today = todayISO();

  const salesToday = queryOne<{ s: number; kg: number }>(
    db,
    'SELECT COALESCE(SUM(net_amount), 0) AS s, COALESCE(SUM(CASE WHEN sale_type="flour" THEN weight_kg ELSE 0 END), 0) AS kg FROM sales WHERE date = ?',
    [today]
  );
  const grindToday = queryOne<{ s: number; kg: number }>(
    db,
    'SELECT COALESCE(SUM(grinding_fee), 0) AS s, COALESCE(SUM(wheat_kg), 0) AS kg FROM grinding_orders WHERE date = ?',
    [today]
  );
  const expToday = queryOne<{ s: number }>(
    db,
    'SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE date = ?',
    [today]
  );
  const cashRow = queryOne<{ bal: number }>(
    db,
    'SELECT COALESCE(SUM(cash_in) - SUM(cash_out), 0) AS bal FROM cash_book'
  );
  const duesRow = queryOne<{ d: number }>(
    db,
    'SELECT COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS d FROM customers'
  );
  const payablesRow = queryOne<{ p: number }>(
    db,
    'SELECT COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS p FROM suppliers'
  );

  const tSales = round2(Number(salesToday?.s ?? 0));
  const tGrind = round2(Number(grindToday?.s ?? 0));
  const tExp = round2(Number(expToday?.s ?? 0));

  return {
    todaySales: tSales,
    todayGrindingIncome: tGrind,
    todayExpenses: tExp,
    todayProfit: round2(tSales + tGrind - tExp),
    cashBalance: round2(Number(cashRow?.bal ?? 0)),
    totalCustomerDues: round2(Number(duesRow?.d ?? 0)),
    totalSupplierPayables: round2(Number(payablesRow?.p ?? 0)),
    todayGrindingKg: round2(Number(grindToday?.kg ?? 0)),
    todayFlourSoldKg: round2(Number(salesToday?.kg ?? 0)),
  };
}

export async function getPeriodSummary(fromDate: string, toDate: string): Promise<PeriodSummary> {
  const db = await getDatabase();
  const grind = queryOne<{ inc: number; kg: number }>(
    db,
    'SELECT COALESCE(SUM(grinding_fee),0) AS inc, COALESCE(SUM(wheat_kg),0) AS kg FROM grinding_orders WHERE date >= ? AND date <= ?',
    [fromDate, toDate]
  );
  const flour = queryOne<{ tot: number; kg: number }>(
    db,
    'SELECT COALESCE(SUM(net_amount),0) AS tot, COALESCE(SUM(weight_kg),0) AS kg FROM sales WHERE sale_type="flour" AND date >= ? AND date <= ?',
    [fromDate, toDate]
  );
  const bran = queryOne<{ tot: number; kg: number }>(
    db,
    'SELECT COALESCE(SUM(net_amount),0) AS tot, COALESCE(SUM(weight_kg),0) AS kg FROM sales WHERE sale_type="bran" AND date >= ? AND date <= ?',
    [fromDate, toDate]
  );
  const purch = queryOne<{ tot: number; kg: number }>(
    db,
    'SELECT COALESCE(SUM(total_amount),0) AS tot, COALESCE(SUM(weight_kg),0) AS kg FROM wheat_purchases WHERE date >= ? AND date <= ?',
    [fromDate, toDate]
  );
  const expRows = queryAll<{ category: ExpenseCategory; tot: number }>(
    db,
    'SELECT category, COALESCE(SUM(amount),0) AS tot FROM expenses WHERE date >= ? AND date <= ? GROUP BY category',
    [fromDate, toDate]
  );
  const cashRow = queryOne<{ cin: number; cout: number }>(
    db,
    'SELECT COALESCE(SUM(cash_in),0) AS cin, COALESCE(SUM(cash_out),0) AS cout FROM cash_book WHERE date >= ? AND date <= ?',
    [fromDate, toDate]
  );

  const expensesByCategory: Record<ExpenseCategory, number> = {
    electricity: 0,
    salaries: 0,
    rent: 0,
    repairs: 0,
    transport: 0,
    misc: 0,
  };
  let expensesTotal = 0;
  for (const r of expRows) {
    expensesByCategory[r.category] = round2(Number(r.tot));
    expensesTotal = round2(expensesTotal + Number(r.tot));
  }

  const grindingIncome = round2(Number(grind?.inc ?? 0));
  const flourSalesTotal = round2(Number(flour?.tot ?? 0));
  const branSalesTotal = round2(Number(bran?.tot ?? 0));
  const wheatPurchasesTotal = round2(Number(purch?.tot ?? 0));
  const netOperatingProfit = round2(
    grindingIncome + flourSalesTotal + branSalesTotal - wheatPurchasesTotal - expensesTotal
  );

  return {
    fromDate,
    toDate,
    grindingIncome,
    grindingWheatKg: round2(Number(grind?.kg ?? 0)),
    flourSalesTotal,
    flourSoldKg: round2(Number(flour?.kg ?? 0)),
    branSalesTotal,
    branSoldKg: round2(Number(bran?.kg ?? 0)),
    wheatPurchasesTotal,
    wheatPurchasedKg: round2(Number(purch?.kg ?? 0)),
    expensesTotal,
    expensesByCategory,
    cashCollected: round2(Number(cashRow?.cin ?? 0)),
    cashPaidOut: round2(Number(cashRow?.cout ?? 0)),
    netOperatingProfit,
  };
}

// ================== BACKUP & DEMO DATA ==================

export async function exportJsonBackup(): Promise<string> {
  const bytes = await exportDatabaseBytes();
  const payload = {
    app: 'AATA CHAKKI PRO',
    version: 1,
    exportedAt: nowTimestamp(),
    sqliteBase64: uint8ToBase64(bytes),
  };
  const db = await getDatabase();
  logAudit(db, 'BACKUP', 'database', 'json', 'Exported JSON database backup');
  await persistDatabase(false);
  return JSON.stringify(payload, null, 2);
}

export async function exportSqliteBinary(): Promise<Uint8Array> {
  const db = await getDatabase();
  logAudit(db, 'BACKUP', 'database', 'sqlite', 'Exported SQLite .db binary');
  await persistDatabase(false);
  return exportDatabaseBytes();
}

export async function restoreFromBackupFile(file: File): Promise<void> {
  // Take automatic safety snapshot before restoring
  await createAutoBackupSnapshot('Pre-Restore Safety Snapshot');

  if (file.name.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text) as { sqliteBase64?: string };
    if (!parsed.sqliteBase64) {
      throw new Error('Invalid JSON backup format.');
    }
    const bytes = base64ToUint8(parsed.sqliteBase64);
    await restoreDatabaseFromBytes(bytes);
  } else {
    const buf = await file.arrayBuffer();
    await restoreDatabaseFromBytes(new Uint8Array(buf));
  }
  const db = await getDatabase();
  logAudit(db, 'RESTORE', 'database', file.name, `Restored database from ${file.name}`);
  await persistDatabase(false);
}

export async function restoreFromAutoSnapshot(base64: string, label: string): Promise<void> {
  await createAutoBackupSnapshot('Pre-Restore Safety Snapshot');
  await restoreDatabaseFromBytes(base64ToUint8(base64));
  const db = await getDatabase();
  logAudit(db, 'RESTORE', 'database', label, `Restored from snapshot: ${label}`);
  await persistDatabase(false);
}

export async function loadDemoMillData(): Promise<void> {
  await resetFreshDatabase();
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Opening Cash
  await addCashAdjustment(yesterday, 'in', 150000, 'Opening Mill Cash Register');

  // Suppliers
  const sup1 = await saveSupplier({
    name: 'Haji Muhammad Siddiq Traders',
    phone: '0300-4128890',
    address: 'Ghalla Mandi, Okara',
    openingBalance: 0,
  });
  const sup2 = await saveSupplier({
    name: 'Chaudhary Zafar Farms',
    phone: '0321-6541209',
    address: 'Chak 14/1-L, Sahiwal',
    openingBalance: 15000,
  });

  // Customers
  const cust1 = await saveCustomer({
    name: 'Malik Tariq Mahmood',
    phone: '0301-7782341',
    address: 'Mohalla Islam Pura',
    openingBalance: 4500,
  });
  const cust2 = await saveCustomer({
    name: 'Bismillah Tandoor & Bakery',
    phone: '0333-8891204',
    address: 'Main Bazaar',
    openingBalance: 0,
  });
  const cust3 = await saveCustomer({
    name: 'Master Abdul Razzaq',
    phone: '0345-5567123',
    address: 'Street 4, Model Town',
    openingBalance: 1200,
  });

  // Wheat Purchase (2000 KG = 50 Mann @ 3900/Mann)
  await saveWheatPurchase({
    date: yesterday,
    supplierId: sup1,
    weightKg: 2000,
    rate: 3900,
    rateUnit: 'mann',
    totalAmount: 195000,
    paidAmount: 100000,
    paymentMode: 'partial',
    notes: 'Grade-A Punjab Wheat (50 Mann)',
  });
  await saveWheatPurchase({
    date: today,
    supplierId: sup2,
    weightKg: 800,
    rate: 3950,
    rateUnit: 'mann',
    totalAmount: 79000,
    paidAmount: 0,
    paymentMode: 'credit',
    notes: '20 Mann Farm Wheat',
  });

  // Mill Production (Grinding 1000 KG wheat -> 890 KG Chakki Aata + 95 KG Bran)
  await saveGrindingOrder({
    date: yesterday,
    mode: 'mill',
    customerId: null,
    customerName: 'Mill Stock Production',
    wheatKg: 1000,
    flourKg: 890,
    branKg: 95,
    flourStockId: 'flour_chakki',
    keepBranForMill: true,
    grindingRate: 0,
    rateUnit: 'mann',
    grindingFee: 0,
    paidAmount: 0,
    paymentMode: 'cash',
    status: 'delivered',
    notes: 'Morning mill batch for Chakki Aata',
  });

  // Mill Production (400 KG -> 340 KG Fine Aata + 50 KG Bran)
  await saveGrindingOrder({
    date: today,
    mode: 'mill',
    customerId: null,
    customerName: 'Mill Stock Production',
    wheatKg: 400,
    flourKg: 340,
    branKg: 50,
    flourStockId: 'flour_fine',
    keepBranForMill: true,
    grindingRate: 0,
    rateUnit: 'mann',
    grindingFee: 0,
    paidAmount: 0,
    paymentMode: 'cash',
    status: 'delivered',
    notes: 'Fine sifted flour batch',
  });

  // Customer Grinding Orders
  await saveGrindingOrder({
    date: today,
    mode: 'customer',
    customerId: cust1,
    customerName: 'Malik Tariq Mahmood',
    wheatKg: 160, // 4 Mann
    flourKg: 144,
    branKg: 12,
    flourStockId: 'flour_chakki',
    keepBranForMill: false,
    grindingRate: 240,
    rateUnit: 'mann',
    grindingFee: 960,
    paidAmount: 960,
    paymentMode: 'cash',
    status: 'delivered',
    notes: '4 Mann home wheat grinding',
  });

  await saveGrindingOrder({
    date: today,
    mode: 'customer',
    customerId: cust3,
    customerName: 'Master Abdul Razzaq',
    wheatKg: 80, // 2 Mann
    flourKg: 72,
    branKg: 6,
    flourStockId: 'flour_chakki',
    keepBranForMill: true,
    grindingRate: 240,
    rateUnit: 'mann',
    grindingFee: 480,
    paidAmount: 0,
    paymentMode: 'credit',
    status: 'ready',
    notes: 'Ready for pickup',
  });

  // Flour Sales
  await saveSale({
    date: today,
    saleType: 'flour',
    stockId: 'flour_chakki',
    customerId: cust2,
    customerName: 'Bismillah Tandoor & Bakery',
    weightKg: 200, // 5 Mann
    rate: 135,
    rateUnit: 'kg',
    grossAmount: 27000,
    discount: 500,
    netAmount: 26500,
    paidAmount: 15000,
    paymentMode: 'partial',
    notes: '5 Mann Chakki Aata bags',
  });

  await saveSale({
    date: today,
    saleType: 'flour',
    stockId: 'flour_fine',
    customerId: null,
    customerName: 'Walk-in Cash Customer',
    weightKg: 40,
    rate: 145,
    rateUnit: 'kg',
    grossAmount: 5800,
    discount: 0,
    netAmount: 5800,
    paidAmount: 5800,
    paymentMode: 'cash',
    notes: '1 Mann Fine Aata',
  });

  // Bran Sale
  await saveSale({
    date: today,
    saleType: 'bran',
    stockId: 'bran',
    customerId: cust1,
    customerName: 'Malik Tariq Mahmood',
    weightKg: 80,
    rate: 3000,
    rateUnit: 'mann',
    grossAmount: 6000,
    discount: 0,
    netAmount: 6000,
    paidAmount: 6000,
    paymentMode: 'cash',
    notes: '2 Mann Chokar for dairy cattle',
  });

  // Expenses
  await saveExpense({
    date: today,
    category: 'electricity',
    amount: 4200,
    description: 'WAPDA Three-Phase Meter Daily Reserve',
  });
  await saveExpense({
    date: today,
    category: 'repairs',
    amount: 1500,
    description: 'Chakki Stone Dressing (Pathar Takai)',
  });

  // Customer Payment Received
  await recordPartyPayment({
    date: today,
    partyType: 'customer',
    partyId: cust1,
    amount: 2500,
    notes: 'Previous khata installment received',
  });

  await createAutoBackupSnapshot('Demo Mill Data Loaded');
}

export async function resetAllMillData(): Promise<void> {
  await createAutoBackupSnapshot('Pre-Reset Automatic Snapshot');
  await resetFreshDatabase();
}

export const WEIGHT_UNIT_KG = MANN_KG;
