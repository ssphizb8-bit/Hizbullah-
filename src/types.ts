export type Language = 'ur' | 'en';

export type RateUnit = 'kg' | 'mann';

export type PaymentMode = 'cash' | 'credit' | 'partial';

export type GrindingMode = 'customer' | 'mill';

export type GrindingStatus = 'in_mill' | 'ready' | 'delivered';

export type ExpenseCategory =
  | 'electricity'
  | 'salaries'
  | 'rent'
  | 'repairs'
  | 'transport'
  | 'misc';

export type NavTab =
  | 'dashboard'
  | 'grinding'
  | 'sales'
  | 'bran'
  | 'purchase'
  | 'customers'
  | 'expenses'
  | 'accounting'
  | 'reports'
  | 'settings';

export interface MillSettings {
  millNameEn: string;
  millNameUr: string;
  phone: string;
  address: string;
  language: Language;
  defaultGrindingRateMann: number;
  defaultFlourRateKg: number;
  defaultBranRateKg: number;
  pinHash: string;
  lastAutoBackupAt: string;
}

export interface StockItem {
  id: string;
  nameEn: string;
  nameUr: string;
  category: 'wheat' | 'flour' | 'bran';
  qtyKg: number;
  defaultRateKg: number;
  updatedAt: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  balance: number;
  createdAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  balance: number;
  createdAt: string;
}

export interface GrindingOrder {
  id: number;
  receiptNo: string;
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
  createdAt: string;
}

export interface WheatPurchase {
  id: number;
  invoiceNo: string;
  date: string;
  supplierId: number;
  supplierName?: string;
  weightKg: number;
  rate: number;
  rateUnit: RateUnit;
  totalAmount: number;
  paidAmount: number;
  paymentMode: PaymentMode;
  notes: string;
  createdAt: string;
}

export interface SaleRecord {
  id: number;
  invoiceNo: string;
  date: string;
  saleType: 'flour' | 'bran';
  stockId: string;
  stockNameEn?: string;
  stockNameUr?: string;
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
  createdAt: string;
}

export interface PartyPayment {
  id: number;
  receiptNo: string;
  date: string;
  partyType: 'customer' | 'supplier';
  partyId: number;
  partyName?: string;
  amount: number;
  direction: 'in' | 'out';
  notes: string;
  createdAt: string;
}

export interface ExpenseRecord {
  id: number;
  voucherNo: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  createdAt: string;
}

export interface CashBookEntry {
  id: number;
  date: string;
  refType: string;
  refId: number | null;
  refNo: string;
  description: string;
  cashIn: number;
  cashOut: number;
  runningBalance: number;
  createdAt: string;
}

export interface LedgerEntry {
  id: number;
  date: string;
  partyId: number;
  refType: string;
  refId: number | null;
  refNo: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BACKUP' | 'RESTORE';
  entityType: string;
  entityId: string;
  summary: string;
  detailsJson: string;
}

export interface AutoBackupRecord {
  id: string;
  createdAt: string;
  reason: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface DashboardMetrics {
  todaySales: number;
  todayGrindingIncome: number;
  todayExpenses: number;
  todayProfit: number;
  cashBalance: number;
  totalCustomerDues: number;
  totalSupplierPayables: number;
  todayGrindingKg: number;
  todayFlourSoldKg: number;
}

export interface PeriodSummary {
  fromDate: string;
  toDate: string;
  grindingIncome: number;
  grindingWheatKg: number;
  flourSalesTotal: number;
  flourSoldKg: number;
  branSalesTotal: number;
  branSoldKg: number;
  wheatPurchasesTotal: number;
  wheatPurchasedKg: number;
  expensesTotal: number;
  expensesByCategory: Record<ExpenseCategory, number>;
  cashCollected: number;
  cashPaidOut: number;
  netOperatingProfit: number;
}
