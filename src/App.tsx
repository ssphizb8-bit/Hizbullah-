import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Calculator,
  Globe,
  LayoutDashboard,
  Lock,
  Menu,
  Package,
  Receipt,
  Scale,
  Settings,
  ShoppingBag,
  Users,
  Wheat,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AuditLogEntry,
  CashBookEntry,
  Customer,
  DashboardMetrics,
  ExpenseRecord,
  GrindingOrder,
  Language,
  MillSettings,
  NavTab,
  PeriodSummary,
  SaleRecord,
  StockItem,
  Supplier,
  WheatPurchase,
} from './types';
import { t } from './i18n/translations';
import {
  getAuditLogs,
  getCashBook,
  getCustomers,
  getDashboardMetrics,
  getExpenses,
  getGrindingOrders,
  getPeriodSummary,
  getSales,
  getSettings,
  getStockItems,
  getSuppliers,
  getWheatPurchases,
  loadDemoMillData,
  recordPartyPayment,
  updateSettings,
} from './db/millService';
import { formatPKR, todayISO } from './utils/format';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PinLockScreen } from './components/PinLockScreen';
import { ConfirmModal } from './components/ConfirmModal';
import { InvoiceModal } from './components/InvoiceModal';
import { DashboardView } from './views/DashboardView';
import { GrindingView } from './views/GrindingView';
import { SalesView } from './views/SalesView';
import { PurchaseView } from './views/PurchaseView';
import { PartiesView } from './views/PartiesView';
import { ExpensesView } from './views/ExpensesView';
import { AccountingView } from './views/AccountingView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';

const EMPTY_METRICS: DashboardMetrics = {
  todaySales: 0,
  todayGrindingIncome: 0,
  todayExpenses: 0,
  todayProfit: 0,
  cashBalance: 0,
  totalCustomerDues: 0,
  totalSupplierPayables: 0,
  todayGrindingKg: 0,
  todayFlourSoldKg: 0,
};

const EMPTY_SUMMARY: PeriodSummary = {
  fromDate: '2000-01-01',
  toDate: '2099-12-31',
  grindingIncome: 0,
  grindingWheatKg: 0,
  flourSalesTotal: 0,
  flourSoldKg: 0,
  branSalesTotal: 0,
  branSoldKg: 0,
  wheatPurchasesTotal: 0,
  wheatPurchasedKg: 0,
  expensesTotal: 0,
  expensesByCategory: {
    electricity: 0,
    salaries: 0,
    rent: 0,
    repairs: 0,
    transport: 0,
    misc: 0,
  },
  cashCollected: 0,
  cashPaidOut: 0,
  netOperatingProfit: 0,
};

export default function App() {
  const isOnline = useOnlineStatus();
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [partiesInitialSubTab, setPartiesInitialSubTab] = useState<'customers' | 'suppliers'>('customers');
  const [moreOpen, setMoreOpen] = useState(false);

  // App Data State
  const [settings, setSettings] = useState<MillSettings | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [grinding, setGrinding] = useState<GrindingOrder[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<WheatPurchase[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [cashBook, setCashBook] = useState<CashBookEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [overallSummary, setOverallSummary] = useState<PeriodSummary>(EMPTY_SUMMARY);

  // Modals & Notifications
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    desc: string;
    danger: boolean;
    onYes: () => Promise<void>;
  } | null>(null);
  const [invoiceSale, setInvoiceSale] = useState<SaleRecord | null>(null);
  const [invoiceGrinding, setInvoiceGrinding] = useState<GrindingOrder | null>(null);

  // Quick Cash Receipt Modal
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [qpCustomerId, setQpCustomerId] = useState<number | ''>('');
  const [qpAmount, setQpAmount] = useState('');
  const [qpNotes, setQpNotes] = useState('');

  const showToast = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const refreshAll = useCallback(async () => {
    const [
      s,
      st,
      custs,
      sups,
      gr,
      sl,
      pr,
      ex,
      cb,
      logs,
      met,
      sum,
    ] = await Promise.all([
      getSettings(),
      getStockItems(),
      getCustomers(),
      getSuppliers(),
      getGrindingOrders(),
      getSales(),
      getWheatPurchases(),
      getExpenses(),
      getCashBook(),
      getAuditLogs(),
      getDashboardMetrics(),
      getPeriodSummary('2000-01-01', '2099-12-31'),
    ]);
    setSettings(s);
    setStock(st);
    setCustomers(custs);
    setSuppliers(sups);
    setGrinding(gr);
    setSales(sl);
    setPurchases(pr);
    setExpenses(ex);
    setCashBook(cb);
    setAuditLogs(logs);
    setMetrics(met);
    setOverallSummary(sum);
  }, []);

  useEffect(() => {
    refreshAll()
      .then(() => setReady(true))
      .catch((err) => {
        console.error('SQLite init failed:', err);
        setReady(true);
      });
  }, [refreshAll]);

  const lang: Language = settings?.language || 'ur';

  useEffect(() => {
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const handleToggleLang = async () => {
    const next: Language = lang === 'ur' ? 'en' : 'ur';
    await updateSettings({ language: next });
    await refreshAll();
  };

  const askConfirmDelete = (onYes: () => Promise<void>) => {
    setConfirmState({
      open: true,
      title: t(lang, 'confirmDeleteTitle'),
      desc: t(lang, 'confirmDeleteDesc'),
      danger: true,
      onYes,
    });
  };

  const askConfirmAction = (title: string, desc: string, onYes: () => Promise<void>) => {
    setConfirmState({
      open: true,
      title,
      desc,
      danger: false,
      onYes,
    });
  };

  const handleQuickPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qpCustomerId || Number(qpAmount) <= 0) {
      showToast(lang === 'ur' ? 'گاہک اور درست رقم منتخب کریں۔' : 'Select customer and valid amount.', true);
      return;
    }
    try {
      await recordPartyPayment({
        date: todayISO(),
        partyType: 'customer',
        partyId: Number(qpCustomerId),
        amount: Number(qpAmount),
        notes: qpNotes,
      });
      await refreshAll();
      setQuickPayOpen(false);
      setQpCustomerId('');
      setQpAmount('');
      setQpNotes('');
      showToast(lang === 'ur' ? 'نقد وصولی محفوظ ہو گئی۔' : 'Cash receipt recorded.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error recording payment', true);
    }
  };

  if (!ready || !settings) {
    return (
      <div className="min-h-screen bg-[#F4F7F4] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center animate-pulse mb-3">
          <Wheat className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-emerald-900">AATA CHAKKI PRO</p>
        <p className="text-xs text-slate-500 mt-1">Initializing SQLite Local Database...</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <PinLockScreen
        lang={lang}
        millNameEn={settings.millNameEn}
        millNameUr={settings.millNameUr}
        onToggleLang={handleToggleLang}
        onUnlock={() => setUnlocked(true)}
      />
    );
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: t(lang, 'navDashboard'), icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'grinding', label: t(lang, 'navGrinding'), icon: <Wheat className="w-5 h-5" /> },
    { id: 'sales', label: t(lang, 'navSales'), icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'bran', label: t(lang, 'navBran'), icon: <Package className="w-5 h-5" /> },
    { id: 'purchase', label: t(lang, 'navPurchase'), icon: <Scale className="w-5 h-5" /> },
    { id: 'customers', label: t(lang, 'navCustomers'), icon: <Users className="w-5 h-5" /> },
    { id: 'expenses', label: t(lang, 'navExpenses'), icon: <Receipt className="w-5 h-5" /> },
    { id: 'accounting', label: t(lang, 'navAccounting'), icon: <Calculator className="w-5 h-5" /> },
    { id: 'reports', label: t(lang, 'navReports'), icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'settings', label: t(lang, 'navSettings'), icon: <Settings className="w-5 h-5" /> },
  ];

  const currentTitle = navItems.find((n) => n.id === activeTab)?.label || t(lang, 'appName');

  const navigate = (tab: NavTab) => {
    setActiveTab(tab);
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#F4F7F4] text-slate-900 flex flex-col lg:flex-row"
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-e border-emerald-100 z-30 no-print">
        <div className="p-5 border-b border-emerald-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <Wheat className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold text-emerald-950 truncate">
              {lang === 'ur' ? settings.millNameUr : settings.millNameEn}
            </h1>
            <p className="text-[11px] text-slate-500 truncate">{t(lang, 'appName')}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-900'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-emerald-100 space-y-2">
          <PWAInstallButton lang={lang} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleToggleLang}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 hover:bg-slate-100"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'English' : 'اردو'}</span>
            </button>
            <button
              type="button"
              onClick={() => setUnlocked(false)}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 hover:bg-slate-100"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{t(lang, 'lockApp')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:ps-64 flex flex-col min-h-screen pb-20 lg:pb-6">
        {/* Compact Top Header (<=56px on mobile) */}
        <header className="sticky top-0 z-20 h-14 bg-emerald-800 lg:bg-white/95 lg:backdrop-blur-md text-white lg:text-slate-900 border-b border-emerald-700 lg:border-emerald-100 px-4 lg:px-6 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <Wheat className="w-5 h-5 text-emerald-200 lg:hidden shrink-0" />
            <h2 className="text-base font-extrabold truncate">{currentTitle}</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <span className="flex items-center gap-1 text-[11px] font-bold bg-amber-500 text-white px-2 py-1 rounded-lg">
                <WifiOff className="w-3.5 h-3.5" />
                <span>{t(lang, 'offlineBadge')}</span>
              </span>
            )}
            <div className="lg:hidden">
              <PWAInstallButton lang={lang} compact />
            </div>
            <button
              type="button"
              onClick={handleToggleLang}
              className="lg:hidden min-h-[38px] px-2.5 rounded-lg bg-emerald-700/80 text-white text-xs font-bold flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'EN' : 'اردو'}</span>
            </button>
            <button
              type="button"
              onClick={() => setUnlocked(false)}
              aria-label={t(lang, 'lockApp')}
              className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-emerald-700/80 text-white"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              lang={lang}
              metrics={metrics}
              stock={stock}
              recentCash={cashBook}
              onNavigate={navigate}
              onQuickPayment={() => setQuickPayOpen(true)}
              onLoadDemo={() =>
                askConfirmAction(
                  t(lang, 'loadDemoData'),
                  lang === 'ur'
                    ? 'آزمائش کے لیے پاکستانی آٹا چکی کا نمونہ ڈیٹا لوڈ کریں؟'
                    : 'Load sample Pakistani flour mill data to explore all features?',
                  async () => {
                    await loadDemoMillData();
                    await refreshAll();
                    showToast(lang === 'ur' ? 'نمونہ ڈیٹا لوڈ ہو گیا۔' : 'Sample data loaded.');
                  }
                )
              }
            />
          )}

          {activeTab === 'grinding' && (
            <GrindingView
              lang={lang}
              settings={settings}
              customers={customers}
              stock={stock}
              orders={grinding}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmDelete={askConfirmDelete}
              onOpenReceipt={(o) => setInvoiceGrinding(o)}
            />
          )}

          {activeTab === 'sales' && (
            <SalesView
              saleType="flour"
              lang={lang}
              settings={settings}
              customers={customers}
              stock={stock}
              sales={sales}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmDelete={askConfirmDelete}
              onOpenInvoice={(s) => setInvoiceSale(s)}
            />
          )}

          {activeTab === 'bran' && (
            <SalesView
              saleType="bran"
              lang={lang}
              settings={settings}
              customers={customers}
              stock={stock}
              sales={sales}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmDelete={askConfirmDelete}
              onOpenInvoice={(s) => setInvoiceSale(s)}
            />
          )}

          {activeTab === 'purchase' && (
            <PurchaseView
              lang={lang}
              suppliers={suppliers}
              stock={stock}
              purchases={purchases}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmDelete={askConfirmDelete}
              onNavigateToSuppliers={() => {
                setPartiesInitialSubTab('suppliers');
                navigate('customers');
              }}
            />
          )}

          {activeTab === 'customers' && (
            <PartiesView
              lang={lang}
              settings={settings}
              customers={customers}
              suppliers={suppliers}
              initialSubTab={partiesInitialSubTab}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmDelete={askConfirmDelete}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesView
              lang={lang}
              expenses={expenses}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmDelete={askConfirmDelete}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingView
              lang={lang}
              cashBook={cashBook}
              metrics={metrics}
              overallSummary={overallSummary}
              auditLogs={auditLogs}
              onRefresh={refreshAll}
              onToast={showToast}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              lang={lang}
              settings={settings}
              stock={stock}
              grinding={grinding}
              sales={sales}
              purchases={purchases}
              expenses={expenses}
              customers={customers}
              onToast={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              lang={lang}
              settings={settings}
              stock={stock}
              onRefresh={refreshAll}
              onToast={showToast}
              onConfirmAction={askConfirmAction}
              onLockNow={() => setUnlocked(false)}
            />
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar (5 Thumb Targets) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-emerald-100 pb-safe no-print">
        <div className="grid grid-cols-5 h-16">
          {[
            { id: 'dashboard' as NavTab, label: t(lang, 'navDashboard'), icon: <LayoutDashboard className="w-5 h-5" /> },
            { id: 'grinding' as NavTab, label: t(lang, 'navGrinding'), icon: <Wheat className="w-5 h-5" /> },
            { id: 'sales' as NavTab, label: t(lang, 'navSales'), icon: <ShoppingBag className="w-5 h-5" /> },
            { id: 'customers' as NavTab, label: t(lang, 'navCustomers'), icon: <BookOpen className="w-5 h-5" /> },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
                  active ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {tab.icon}
                <span className="truncate max-w-[68px]">{tab.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
              ['bran', 'purchase', 'expenses', 'accounting', 'reports', 'settings'].includes(activeTab)
                ? 'text-emerald-700'
                : 'text-slate-500'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span>{t(lang, 'navMore')}</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More Modules" Bottom Sheet */}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 pb-8 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">{t(lang, 'appName')}</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {navItems
                .filter((n) => ['bran', 'purchase', 'expenses', 'accounting', 'reports', 'settings'].includes(n.id))
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={`min-h-[54px] px-3.5 rounded-2xl border flex items-center gap-2.5 text-sm font-bold text-start ${
                      activeTab === item.id
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-emerald-50/40 border-emerald-100 text-slate-800 hover:bg-emerald-50'
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
            </div>

            <PWAInstallButton lang={lang} />
          </div>
        </div>
      )}

      {/* Quick Cash Receipt Modal */}
      {quickPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleQuickPaySubmit}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">{t(lang, 'receivePayment')}</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'selectCustomer')} <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={qpCustomerId}
                onChange={(e) => setQpCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">{t(lang, 'selectCustomer')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({formatPKR(c.balance, lang)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'amount')} (PKR) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={qpAmount}
                onChange={(e) => setQpAmount(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
              <input
                type="text"
                value={qpNotes}
                onChange={(e) => setQpNotes(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickPayOpen(false)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800"
              >
                {t(lang, 'save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmState && (
        <ConfirmModal
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.desc}
          lang={lang}
          danger={confirmState.danger}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            const fn = confirmState.onYes;
            setConfirmState(null);
            try {
              await fn();
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Operation failed', true);
            }
          }}
        />
      )}

      {/* Printable / PDF Invoice & Receipt Modal */}
      <InvoiceModal
        lang={lang}
        settings={settings}
        sale={invoiceSale}
        grinding={invoiceGrinding}
        onClose={() => {
          setInvoiceSale(null);
          setInvoiceGrinding(null);
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-20 lg:bottom-6 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold text-white max-w-sm text-center no-print ${
            toast.isError ? 'bg-red-600' : 'bg-emerald-800'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
