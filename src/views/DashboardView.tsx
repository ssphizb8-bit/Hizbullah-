import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Coins,
  Package,
  Plus,
  Receipt,
  Scale,
  ShoppingBag,
  Users,
  Wheat,
} from 'lucide-react';
import {
  CashBookEntry,
  DashboardMetrics,
  Language,
  NavTab,
  StockItem,
} from '../types';
import { t } from '../i18n/translations';
import {
  formatDateDisplay,
  formatPKR,
  formatShortWeight,
} from '../utils/format';

interface DashboardViewProps {
  lang: Language;
  metrics: DashboardMetrics;
  stock: StockItem[];
  recentCash: CashBookEntry[];
  onNavigate: (tab: NavTab) => void;
  onQuickPayment: () => void;
  onLoadDemo: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lang,
  metrics,
  stock,
  recentCash,
  onNavigate,
  onQuickPayment,
  onLoadDemo,
}) => {
  const ArrowIcon = lang === 'ur' ? ChevronLeft : ChevronRight;
  const hasAnyData =
    recentCash.length > 0 ||
    stock.some((s) => s.qtyKg > 0) ||
    metrics.totalCustomerDues > 0;

  return (
    <div className="space-y-6">
      {/* Primary Financial Overview */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dominant Cash & Profit Anchor */}
        <div className="lg:col-span-1 rounded-2xl bg-emerald-800 text-white p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-100/90">
              {t(lang, 'cashInHand')}
            </p>
            <p className="text-3xl font-extrabold font-mono-num mt-1 tracking-tight">
              {formatPKR(metrics.cashBalance, lang)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-emerald-700/80">
            <div>
              <p className="text-[11px] text-emerald-100/80">{t(lang, 'customerDues')}</p>
              <p className="text-base font-bold font-mono-num text-amber-300 mt-0.5">
                {formatPKR(metrics.totalCustomerDues, lang)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-emerald-100/80">{t(lang, 'supplierPayables')}</p>
              <p className="text-base font-bold font-mono-num text-emerald-100 mt-0.5">
                {formatPKR(metrics.totalSupplierPayables, lang)}
              </p>
            </div>
          </div>
        </div>

        {/* Today's 4 Key Metrics */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white border border-emerald-100 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{t(lang, 'todaySales')}</span>
              <ShoppingBag className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="mt-3">
              <p className="text-lg font-extrabold font-mono-num text-slate-900">
                {formatPKR(metrics.todaySales, lang)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono-num">
                {formatShortWeight(metrics.todayFlourSoldKg, lang)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-emerald-100 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{t(lang, 'todayGrinding')}</span>
              <Wheat className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="mt-3">
              <p className="text-lg font-extrabold font-mono-num text-slate-900">
                {formatPKR(metrics.todayGrindingIncome, lang)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono-num">
                {formatShortWeight(metrics.todayGrindingKg, lang)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-emerald-100 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{t(lang, 'todayExpenses')}</span>
              <Receipt className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-3">
              <p className="text-lg font-extrabold font-mono-num text-red-700">
                {formatPKR(metrics.todayExpenses, lang)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {lang === 'ur' ? 'آج کے اخراجات' : 'Cash Outflow'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-emerald-100 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{t(lang, 'todayProfit')}</span>
              <Coins className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="mt-3">
              <p
                className={`text-lg font-extrabold font-mono-num ${
                  metrics.todayProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {formatPKR(metrics.todayProfit, lang)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {metrics.todayProfit >= 0
                  ? lang === 'ur'
                    ? 'منافع'
                    : 'Surplus'
                  : lang === 'ur'
                  ? 'خسارہ'
                  : 'Deficit'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Large Thumb-Friendly Quick Actions */}
      <section>
        <h2 className="text-sm font-bold text-slate-800 mb-3">{t(lang, 'quickActions')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('grinding')}
            className="min-h-[72px] rounded-2xl bg-emerald-700 text-white p-3.5 flex flex-col items-start justify-between hover:bg-emerald-800 active:scale-[0.98] transition-all text-start"
          >
            <Wheat className="w-5 h-5 text-emerald-100" />
            <span className="text-sm font-bold mt-2">{t(lang, 'newGrindingBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="min-h-[72px] rounded-2xl bg-white border border-emerald-200 text-emerald-900 p-3.5 flex flex-col items-start justify-between hover:bg-emerald-50 active:scale-[0.98] transition-all text-start"
          >
            <ShoppingBag className="w-5 h-5 text-emerald-700" />
            <span className="text-sm font-bold mt-2">{t(lang, 'newFlourSaleBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('bran')}
            className="min-h-[72px] rounded-2xl bg-white border border-emerald-200 text-emerald-900 p-3.5 flex flex-col items-start justify-between hover:bg-emerald-50 active:scale-[0.98] transition-all text-start"
          >
            <Package className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-bold mt-2">{t(lang, 'newBranSaleBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('purchase')}
            className="min-h-[72px] rounded-2xl bg-white border border-emerald-200 text-emerald-900 p-3.5 flex flex-col items-start justify-between hover:bg-emerald-50 active:scale-[0.98] transition-all text-start"
          >
            <Scale className="w-5 h-5 text-emerald-700" />
            <span className="text-sm font-bold mt-2">{t(lang, 'buyWheatBtn')}</span>
          </button>

          <button
            type="button"
            onClick={onQuickPayment}
            className="min-h-[72px] rounded-2xl bg-white border border-emerald-200 text-emerald-900 p-3.5 flex flex-col items-start justify-between hover:bg-emerald-50 active:scale-[0.98] transition-all text-start"
          >
            <Banknote className="w-5 h-5 text-emerald-700" />
            <span className="text-sm font-bold mt-2">{t(lang, 'receiveCashBtn')}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="min-h-[72px] rounded-2xl bg-white border border-slate-200 text-slate-900 p-3.5 flex flex-col items-start justify-between hover:bg-slate-50 active:scale-[0.98] transition-all text-start"
          >
            <Plus className="w-5 h-5 text-red-600" />
            <span className="text-sm font-bold mt-2">{t(lang, 'addExpenseBtn')}</span>
          </button>
        </div>
      </section>

      {/* Onboarding helper if fresh empty database */}
      {!hasAnyData && (
        <section className="rounded-2xl bg-white border border-emerald-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {lang === 'ur' ? 'نئی چکی سیٹ اپ تیار ہے' : 'Fresh Mill Database Ready'}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {lang === 'ur'
                ? 'آپ فوری طور پر گندم خریداری، پسائی یا گاہک اندراج شروع کر سکتے ہیں، یا آزمائش کے لیے نمونہ ڈیٹا لوڈ کر سکتے ہیں۔'
                : 'Start recording wheat purchases, grinding, and sales right away, or load realistic sample Pakistani mill data to explore reports.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadDemo}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 whitespace-nowrap shrink-0"
          >
            {t(lang, 'loadDemoData')}
          </button>
        </section>
      )}

      {/* Live Mill Stock + Recent Activity Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Live Stock */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-emerald-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">{t(lang, 'stockInventory')}</h2>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <span>{lang === 'ur' ? 'اسٹاک ایڈجسٹ' : 'Adjust'}</span>
              <ArrowIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {stock.map((item) => {
              const isLow = item.qtyKg <= 40;
              return (
                <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {lang === 'ur' ? item.nameUr : item.nameEn}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.category === 'wheat'
                        ? lang === 'ur'
                          ? 'خام گندم'
                          : 'Raw Wheat'
                        : item.category === 'bran'
                        ? lang === 'ur'
                          ? 'چوکر / بھوسی'
                          : 'By-product'
                        : lang === 'ur'
                        ? 'فروخت کے لیے تیار آٹا'
                        : 'Ready Flour'}
                      {isLow && (
                        <>
                          {' · '}
                          <span className="text-amber-700 font-semibold">
                            {lang === 'ur' ? 'کم اسٹاک' : 'Low Stock'}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-bold font-mono-num text-slate-900">
                      {formatShortWeight(item.qtyKg, lang)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Cash & Ledger Activity */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-emerald-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">{t(lang, 'recentTransactions')}</h2>
            <button
              type="button"
              onClick={() => onNavigate('accounting')}
              className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <span>{t(lang, 'cashBookTab')}</span>
              <ArrowIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentCash.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              {t(lang, 'noRecords')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentCash.slice(0, 8).map((entry) => {
                const isIn = entry.cashIn > 0;
                return (
                  <div key={entry.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isIn ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {isIn ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {entry.description}
                        </p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono-num">{entry.refNo}</span>
                          {' · '}
                          <span>{formatDateDisplay(entry.date, lang)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <p
                        className={`text-sm font-bold font-mono-num ${
                          isIn ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {isIn ? '+' : '-'} {formatPKR(isIn ? entry.cashIn : entry.cashOut, lang)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
