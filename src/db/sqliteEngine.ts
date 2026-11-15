import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { AutoBackupRecord } from '../types';
import { nowTimestamp, sha256 } from '../utils/format';

const IDB_NAME = 'aata_chakki_pro_idb';
const IDB_VERSION = 1;
const STORE_SQLITE = 'sqlite';
const STORE_BACKUPS = 'auto_backups';
const MAIN_DB_KEY = 'main_database';

let sqlModule: SqlJsStatic | null = null;
let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE_SQLITE)) {
        idb.createObjectStore(STORE_SQLITE);
      }
      if (!idb.objectStoreNames.contains(STORE_BACKUPS)) {
        idb.createObjectStore(STORE_BACKUPS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetBytes(key: string): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_SQLITE, 'readonly');
    const store = tx.objectStore(STORE_SQLITE);
    const req = store.get(key);
    req.onsuccess = () => {
      const val = req.result;
      if (val instanceof Uint8Array) resolve(val);
      else if (val instanceof ArrayBuffer) resolve(new Uint8Array(val));
      else resolve(null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbSetBytes(key: string, bytes: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_SQLITE, 'readwrite');
    tx.objectStore(STORE_SQLITE).put(bytes, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('wheat','flour','bran')),
  qty_kg REAL NOT NULL DEFAULT 0,
  default_rate_kg REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  opening_balance REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  opening_balance REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grinding_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('customer','mill')),
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  wheat_kg REAL NOT NULL,
  flour_kg REAL NOT NULL,
  bran_kg REAL NOT NULL,
  flour_stock_id TEXT NOT NULL DEFAULT 'flour_chakki',
  keep_bran_for_mill INTEGER NOT NULL DEFAULT 0,
  grinding_rate REAL NOT NULL DEFAULT 0,
  rate_unit TEXT NOT NULL DEFAULT 'mann',
  grinding_fee REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'delivered',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wheat_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  supplier_id INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  rate REAL NOT NULL,
  rate_unit TEXT NOT NULL DEFAULT 'mann',
  total_amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  sale_type TEXT NOT NULL CHECK(sale_type IN ('flour','bran')),
  stock_id TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  rate REAL NOT NULL,
  rate_unit TEXT NOT NULL DEFAULT 'kg',
  gross_amount REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  party_type TEXT NOT NULL CHECK(party_type IN ('customer','supplier')),
  party_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no TEXT UNIQUE NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_book (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  ref_no TEXT DEFAULT '',
  description TEXT NOT NULL,
  cash_in REAL NOT NULL DEFAULT 0,
  cash_out REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  ref_no TEXT DEFAULT '',
  description TEXT NOT NULL,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  supplier_id INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  ref_no TEXT DEFAULT '',
  description TEXT NOT NULL,
  credit REAL NOT NULL DEFAULT 0,
  debit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  summary TEXT NOT NULL,
  details_json TEXT DEFAULT ''
);
`;

async function seedDefaults(db: Database): Promise<void> {
  const now = nowTimestamp();
  const defaultPinHash = await sha256('1234');

  const settingsDefaults: Array<[string, string]> = [
    ['mill_name_en', 'Al-Madina Aata Chakki'],
    ['mill_name_ur', 'المدینہ آٹا چکی'],
    ['mill_phone', '0300-0000000'],
    ['mill_address', 'Main Mandi Road, Pakistan'],
    ['language', 'ur'],
    ['default_grinding_rate_mann', '240'],
    ['default_flour_rate_kg', '135'],
    ['default_bran_rate_kg', '75'],
    ['pin_hash', defaultPinHash],
    ['last_auto_backup_at', now],
  ];

  for (const [k, v] of settingsDefaults) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }

  const stockDefaults: Array<[string, string, string, string, number, number]> = [
    ['wheat', 'Wheat Grain', 'گندم اسٹاک', 'wheat', 0, 98],
    ['flour_chakki', 'Chakki Desi Aata', 'چکی دیسی آٹا', 'flour', 0, 135],
    ['flour_fine', 'Fine Aata', 'فائن آٹا', 'flour', 0, 145],
    ['flour_whole', 'Whole Wheat Aata', 'خالص گندم آٹا', 'flour', 0, 130],
    ['bran', 'Bran (Chokar)', 'چوکر / بھوسی', 'bran', 0, 75],
  ];

  for (const [id, nameEn, nameUr, cat, qty, rate] of stockDefaults) {
    db.run(
      'INSERT OR IGNORE INTO stock_items (id, name_en, name_ur, category, qty_kg, default_rate_kg, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, nameEn, nameUr, cat, qty, rate, now]
    );
  }
}

async function ensureSqlModule(): Promise<SqlJsStatic> {
  if (!sqlModule) {
    sqlModule = await initSqlJs({
      locateFile: (file: string) =>
        file.endsWith('.wasm') ? '/sql-wasm-browser.wasm' : `/${file}`,
    });
  }
  return sqlModule;
}

export async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await ensureSqlModule();

    const savedBytes = await idbGetBytes(MAIN_DB_KEY);
    const db = savedBytes ? new SQL.Database(savedBytes) : new SQL.Database();
    db.run(SCHEMA_SQL);
    await seedDefaults(db);
    dbInstance = db;
    await persistDatabase(false);
    return db;
  })();

  return initPromise;
}

export async function persistDatabase(checkAutoBackup = true): Promise<void> {
  if (!dbInstance) return;
  const bytes = dbInstance.export();
  await idbSetBytes(MAIN_DB_KEY, bytes);

  if (checkAutoBackup) {
    try {
      const res = dbInstance.exec("SELECT value FROM settings WHERE key = 'last_auto_backup_at'");
      const lastStr = res[0]?.values?.[0]?.[0] as string | undefined;
      const lastTime = lastStr ? new Date(lastStr).getTime() : 0;
      // Auto-backup every 6 hours on activity
      if (Date.now() - lastTime > 6 * 60 * 60 * 1000) {
        await createAutoBackupSnapshot('Automatic Scheduled Backup');
      }
    } catch {
      // Ignore auto-backup scheduling errors
    }
  }
}

export async function createAutoBackupSnapshot(reason: string): Promise<AutoBackupRecord | null> {
  if (!dbInstance) return null;
  const now = nowTimestamp();
  dbInstance.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_auto_backup_at', ?)", [now]);
  const bytes = dbInstance.export();
  await idbSetBytes(MAIN_DB_KEY, bytes);

  const record: AutoBackupRecord = {
    id: `bk_${Date.now()}`,
    createdAt: now,
    reason,
    sizeBytes: bytes.byteLength,
    dataBase64: uint8ToBase64(bytes),
  };

  const idb = await openIDB();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_BACKUPS, 'readwrite');
    const store = tx.objectStore(STORE_BACKUPS);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Prune to keep latest 10 backups
  const all = await listAutoBackups();
  if (all.length > 10) {
    const toDelete = all.slice(10);
    const idbDel = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = idbDel.transaction(STORE_BACKUPS, 'readwrite');
      const store = tx.objectStore(STORE_BACKUPS);
      for (const item of toDelete) {
        store.delete(item.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return record;
}

export async function listAutoBackups(): Promise<AutoBackupRecord[]> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_BACKUPS, 'readonly');
    const req = tx.objectStore(STORE_BACKUPS).getAll();
    req.onsuccess = () => {
      const list = (req.result as AutoBackupRecord[]) || [];
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function restoreDatabaseFromBytes(bytes: Uint8Array): Promise<void> {
  const SQL = await ensureSqlModule();
  const testDb = new SQL.Database(bytes);
  // Validate expected schema table exists
  const check = testDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_items'");
  if (!check.length || !check[0].values.length) {
    testDb.close();
    throw new Error('Invalid SQLite database file: missing AATA CHAKKI PRO tables.');
  }
  testDb.run(SCHEMA_SQL);
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = testDb;
  await persistDatabase(false);
}

export async function exportDatabaseBytes(): Promise<Uint8Array> {
  const db = await getDatabase();
  return db.export();
}

export async function resetFreshDatabase(): Promise<void> {
  const SQL = await ensureSqlModule();
  if (dbInstance) {
    dbInstance.close();
  }
  const fresh = new SQL.Database();
  fresh.run(SCHEMA_SQL);
  await seedDefaults(fresh);
  dbInstance = fresh;
  await persistDatabase(false);
}
