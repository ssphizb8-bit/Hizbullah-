import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import {
  Customer,
  ExpenseCategory,
  ExpenseRecord,
  GrindingOrder,
  Language,
  MillSettings,
  PeriodSummary,
  SaleRecord,
  StockItem,
  WheatPurchase,
} from '../types';
import { EXPENSE_CATEGORY_LABELS, t } from '../i18n/translations';
import {
  formatDateDisplay,
  formatPKR,
  formatWeight,
  todayISO,
} from '../utils/format';
import { getPeriodSummary } from '../db/millService';
import { exportElementToPdf, exportFullReportToExcel } from '../utils/exportReports';

interface ReportsViewProps {
  lang: Language;
  settings: MillSettings;
  stock: StockItem[];
  grinding: GrindingOrder[];
  sales: SaleRecord[];
  purchases: WheatPurchase[];
  expenses: ExpenseRecord[];
  customers: Customer[];
  onToast: (msg: string, isError?: boolean) => void;
}

type PeriodPreset = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

function getDateRange(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = todayISO();
  if (preset === 'daily') return { from: to, to };
  if (preset === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (preset === 'monthly') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, to };
  }
  return { from: `${now.getFullYear()}-01-01`, to };
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  lang,
  settings,
  stock,
  grinding,
  sales,
  purchases,
  expenses,
  customers,
  onToast,
}) => {
  const [preset, setPreset] = useState<PeriodPreset>('monthly');
  const initialRange = getDateRange('monthly');
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getPeriodSummary(fromDate, toDate).then((s) => {
      if (active) setSummary(s);
    });
    return () => {
      active = false;
    };
  }, [fromDate, toDate, grinding, sales, purchases, expenses]);

  const handlePreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = getDateRange(p);
      setFromDate(r.from);
      setToDate(r.to);
    }
  };

  const handleExportExcel = () => {
    if (!summary) return;
    exportFullReportToExcel({
      lang,
      summary,
      stock,
      grinding: grinding.filter((g) => g.date >= fromDate && g.date <= toDate),
      sales: sales.filter((s) => s.date >= fromDate && s.date <= toDate),
      purchases: purchases.filter((p) => p.date >= fromDate && p.date <= toDate),
      expenses: expenses.filter((e) => e.date >= fromDate && e.date <= toDate),
      customers,
      filename: `AataChakkiPro_${fromDate}_to_${toDate}.xlsx`,
    });
    onToast(lang === 'ur' ? 'ایکسل رپورٹ ڈاؤن لوڈ ہو گئی۔' : 'Excel (.xlsx) report downloaded.');
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportElementToPdf(reportRef.current, `AataChakkiPro_${fromDate}_to_${toDate}.pdf`);
      onToast(lang === 'ur' ? 'پی ڈی ایف رپورٹ ڈاؤن لوڈ ہو گئی۔' : 'PDF report downloaded.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter & Export Controls */}
      <div className="rounded-2xl bg-white border border-emerald-100 p-4 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 p-1 bg-emerald-50/70 rounded-xl border border-emerald-100">
            {(['daily', 'weekly', 'monthly', 'yearly', 'custom'] as PeriodPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePreset(p)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-colors ${
                  preset === p ? 'bg-emerald-700 text-white' : 'text-emerald-950 hover:bg-emerald-100/70'
                }`}
              >
                {t(lang, p === 'custom' ? 'customRange' : p)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="min-h-[42px] px-3.5 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-800"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{t(lang, 'exportExcel')}</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting}
              className="min-h-[42px] px-3.5 rounded-xl border border-emerald-700 text-emerald-800 bg-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-50 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>{t(lang, 'exportPdf')}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[42px] px-3 rounded-xl border border-slate-300 text-slate-700 bg-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50"
            >
              <Printer className="w-4 h-4" />
              <span>{t(lang, 'print')}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t(lang, 'fromDate')}</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPreset('custom');
                setFromDate(e.target.value);
              }}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t(lang, 'toDate')}</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPreset('custom');
                setToDate(e.target.value);
              }}
              className="w-full min-h-[40px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Printable / PDF-exportable Report Canvas */}
      {summary && (
        <div ref={reportRef} className="rounded-2xl bg-white border border-emerald-100 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-emerald-900">
                {lang === 'ur' ? settings.millNameUr : settings.millNameEn}
              </h2>
              <p className="text-xs text-slate-500">
                {t(lang, 'reportsTitle')} · {formatDateDisplay(fromDate, lang)} — {formatDateDisplay(toDate, lang)}
              </p>
            </div>
            <div className="text-start sm:text-end">
              <p className="text-xs text-slate-500">{lang === 'ur' ? 'خالص منافع' : 'Net Operating Profit'}</p>
              <p
                className={`text-2xl font-extrabold font-mono-num ${
                  summary.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-red-700'
                }`}
              >
                {formatPKR(summary.netOperatingProfit, lang)}
              </p>
            </div>
          </div>

          {/* Key Volume & Revenue Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">{lang === 'ur' ? 'پسائی آمدن' : 'Grinding Income'}</p>
              <p className="text-base font-extrabold font-mono-num text-slate-900 mt-1">
                {formatPKR(summary.grindingIncome, lang)}
              </p>
              <p className="text-xs text-slate-500 font-mono-num mt-0.5">
                {formatWeight(summary.grindingWheatKg, lang)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">{lang === 'ur' ? 'آٹا فروخت' : 'Flour Sales'}</p>
              <p className="text-base font-extrabold font-mono-num text-slate-900 mt-1">
                {formatPKR(summary.flourSalesTotal, lang)}
              </p>
              <p className="text-xs text-slate-500 font-mono-num mt-0.5">
                {formatWeight(summary.flourSoldKg, lang)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">{lang === 'ur' ? 'چوکر فروخت' : 'Bran Sales'}</p>
              <p className="text-base font-extrabold font-mono-num text-slate-900 mt-1">
                {formatPKR(summary.branSalesTotal, lang)}
              </p>
              <p className="text-xs text-slate-500 font-mono-num mt-0.5">
                {formatWeight(summary.branSoldKg, lang)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">{lang === 'ur' ? 'گندم خریداری' : 'Wheat Purchases'}</p>
              <p className="text-base font-extrabold font-mono-num text-red-700 mt-1">
                {formatPKR(summary.wheatPurchasesTotal, lang)}
              </p>
              <p className="text-xs text-slate-500 font-mono-num mt-0.5">
                {formatWeight(summary.wheatPurchasedKg, lang)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expenses Breakdown */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                {t(lang, 'expensesTitle')} ({formatPKR(summary.expensesTotal, lang)})
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4 text-sm">
                {(Object.keys(summary.expensesByCategory) as ExpenseCategory[]).map((cat) => (
                  <div key={cat} className="py-2.5 flex justify-between">
                    <span className="text-slate-600">{EXPENSE_CATEGORY_LABELS[cat][lang]}</span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {formatPKR(summary.expensesByCategory[cat], lang)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash Flow & Current Stock */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  {lang === 'ur' ? 'نقد کیش خلاصہ' : 'Period Cash Summary'}
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4 text-sm">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-600">{t(lang, 'cashIn')}</span>
                    <span className="font-mono-num font-bold text-emerald-700">
                      {formatPKR(summary.cashCollected, lang)}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-600">{t(lang, 'cashOut')}</span>
                    <span className="font-mono-num font-bold text-red-600">
                      {formatPKR(summary.cashPaidOut, lang)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  {t(lang, 'stockInventory')}
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4 text-sm">
                  {stock.map((s) => (
                    <div key={s.id} className="py-2.5 flex justify-between">
                      <span className="text-slate-600">{lang === 'ur' ? s.nameUr : s.nameEn}</span>
                      <span className="font-mono-num font-semibold text-slate-900">
                        {formatWeight(s.qtyKg, lang)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
