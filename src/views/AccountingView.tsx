import React, { useState } from 'react';
import { BookOpen, Calculator, History, Plus } from 'lucide-react';
import {
  AuditLogEntry,
  CashBookEntry,
  DashboardMetrics,
  Language,
  PeriodSummary,
} from '../types';
import { EXPENSE_CATEGORY_LABELS, t } from '../i18n/translations';
import { formatDateDisplay, formatPKR, todayISO } from '../utils/format';
import { addCashAdjustment } from '../db/millService';

interface AccountingViewProps {
  lang: Language;
  cashBook: CashBookEntry[];
  metrics: DashboardMetrics;
  overallSummary: PeriodSummary;
  auditLogs: AuditLogEntry[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  lang,
  cashBook,
  metrics,
  overallSummary,
  auditLogs,
  onRefresh,
  onToast,
}) => {
  const [tab, setTab] = useState<'cashbook' | 'pnl' | 'audit'>('cashbook');
  const [adjDate, setAdjDate] = useState(todayISO());
  const [adjDir, setAdjDir] = useState<'in' | 'out'>('in');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDesc, setAdjDesc] = useState('');

  const handleAdjustCash = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(adjAmount);
    if (!amt || amt <= 0) {
      onToast(lang === 'ur' ? 'درست رقم درج کریں۔' : 'Enter a valid amount.', true);
      return;
    }
    try {
      await addCashAdjustment(adjDate, adjDir, amt, adjDesc);
      await onRefresh();
      setAdjAmount('');
      setAdjDesc('');
      onToast(lang === 'ur' ? 'کیش بک اپڈیٹ ہو گئی۔' : 'Cash adjustment saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error', true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Segmented Sub-navigation */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-xl border border-emerald-100 max-w-xl">
        <button
          type="button"
          onClick={() => setTab('cashbook')}
          className={`min-h-[42px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            tab === 'cashbook' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{t(lang, 'cashBookTab')}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('pnl')}
          className={`min-h-[42px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            tab === 'pnl' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>{t(lang, 'profitLossTab')}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`min-h-[42px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            tab === 'audit' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>{t(lang, 'auditHistoryTab')}</span>
        </button>
      </div>

      {tab === 'cashbook' && (
        <div className="space-y-4">
          {/* Cash Balance + Quick Adjustment */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-4 rounded-2xl bg-emerald-800 text-white p-5 flex flex-col justify-center">
              <p className="text-xs text-emerald-100">{t(lang, 'cashInHand')}</p>
              <p className="text-3xl font-extrabold font-mono-num mt-1">
                {formatPKR(metrics.cashBalance, lang)}
              </p>
            </div>

            <form
              onSubmit={handleAdjustCash}
              className="lg:col-span-8 rounded-2xl bg-white border border-emerald-100 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(lang, 'adjustOpeningCash')}
                </label>
                <select
                  value={adjDir}
                  onChange={(e) => setAdjDir(e.target.value as 'in' | 'out')}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="in">{t(lang, 'cashIn')} (+)</option>
                  <option value="out">{t(lang, 'cashOut')} (-)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'date')}</label>
                <input
                  type="date"
                  required
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'amount')}</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={adjDesc}
                  onChange={(e) => setAdjDesc(e.target.value)}
                  placeholder={t(lang, 'notes')}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center justify-center shrink-0 hover:bg-emerald-800"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl bg-white border border-emerald-100 p-5 overflow-x-auto">
            {cashBook.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noRecords')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 px-2 text-start font-semibold">{t(lang, 'date')}</th>
                    <th className="py-2.5 px-2 text-start font-semibold">{t(lang, 'description')}</th>
                    <th className="py-2.5 px-2 text-end font-semibold">{t(lang, 'cashIn')}</th>
                    <th className="py-2.5 px-2 text-end font-semibold">{t(lang, 'cashOut')}</th>
                    <th className="py-2.5 px-2 text-end font-semibold">{t(lang, 'runningBalance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashBook.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-2 whitespace-nowrap text-xs text-slate-600">
                        <div>{formatDateDisplay(row.date, lang)}</div>
                        <div className="font-mono-num text-[11px] text-slate-400">{row.refNo}</div>
                      </td>
                      <td className="py-3 px-2 text-slate-800">{row.description}</td>
                      <td className="py-3 px-2 text-end font-mono-num text-emerald-700 font-semibold">
                        {row.cashIn > 0 ? formatPKR(row.cashIn, lang) : '—'}
                      </td>
                      <td className="py-3 px-2 text-end font-mono-num text-red-600 font-semibold">
                        {row.cashOut > 0 ? formatPKR(row.cashOut, lang) : '—'}
                      </td>
                      <td className="py-3 px-2 text-end font-mono-num font-bold text-slate-900">
                        {formatPKR(row.runningBalance, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'pnl' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Revenue & Gross Margin */}
          <div className="rounded-2xl bg-white border border-emerald-100 p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {lang === 'ur' ? 'آمدنی اور منافع (مجموعی حساب)' : 'All-Time Income & Profit Statement'}
            </h3>
            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-3 flex justify-between">
                <span className="text-slate-600">{lang === 'ur' ? 'گندم پسائی آمدن' : 'Wheat Grinding Income'}</span>
                <span className="font-bold font-mono-num text-emerald-700">
                  + {formatPKR(overallSummary.grindingIncome, lang)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600">{lang === 'ur' ? 'آٹا فروخت' : 'Flour Sales'}</span>
                <span className="font-bold font-mono-num text-emerald-700">
                  + {formatPKR(overallSummary.flourSalesTotal, lang)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600">{lang === 'ur' ? 'چوکر فروخت' : 'Bran (Chokar) Sales'}</span>
                <span className="font-bold font-mono-num text-emerald-700">
                  + {formatPKR(overallSummary.branSalesTotal, lang)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600">{lang === 'ur' ? 'گندم خریداری لاگت' : 'Wheat Purchases'}</span>
                <span className="font-bold font-mono-num text-red-600">
                  - {formatPKR(overallSummary.wheatPurchasesTotal, lang)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600">{lang === 'ur' ? 'چکی کے کل اخراجات' : 'Operating Expenses'}</span>
                <span className="font-bold font-mono-num text-red-600">
                  - {formatPKR(overallSummary.expensesTotal, lang)}
                </span>
              </div>
              <div className="pt-4 flex justify-between text-base font-extrabold">
                <span className="text-slate-900">{lang === 'ur' ? 'خالص آپریٹنگ منافع' : 'Net Operating Profit'}</span>
                <span
                  className={`font-mono-num ${
                    overallSummary.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-red-700'
                  }`}
                >
                  {formatPKR(overallSummary.netOperatingProfit, lang)}
                </span>
              </div>
            </div>
          </div>

          {/* Expense Breakdown & Balance Sheet Snapshot */}
          <div className="rounded-2xl bg-white border border-emerald-100 p-5 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-3">
                {lang === 'ur' ? 'اخراجات کی تفصیل' : 'Expense Breakdown'}
              </h3>
              <div className="divide-y divide-slate-100 text-sm">
                {(Object.keys(overallSummary.expensesByCategory) as Array<keyof typeof EXPENSE_CATEGORY_LABELS>).map(
                  (cat) => (
                    <div key={cat} className="py-2.5 flex justify-between">
                      <span className="text-slate-600">{EXPENSE_CATEGORY_LABELS[cat][lang]}</span>
                      <span className="font-semibold font-mono-num text-slate-900">
                        {formatPKR(overallSummary.expensesByCategory[cat], lang)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'cashInHand')}</span>
                <span className="font-bold font-mono-num text-emerald-800">
                  {formatPKR(metrics.cashBalance, lang)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'customerDues')}</span>
                <span className="font-bold font-mono-num text-amber-700">
                  {formatPKR(metrics.totalCustomerDues, lang)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'supplierPayables')}</span>
                <span className="font-bold font-mono-num text-red-700">
                  {formatPKR(metrics.totalSupplierPayables, lang)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-2xl bg-white border border-emerald-100 p-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">
            {t(lang, 'auditHistoryTab')} ({auditLogs.length})
          </h3>
          {auditLogs.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{t(lang, 'noRecords')}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{log.summary}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span
                        className={`font-bold ${
                          log.action === 'DELETE'
                            ? 'text-red-600'
                            : log.action === 'UPDATE'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {log.action}
                      </span>
                      {' · '}
                      <span>{log.entityType}</span>
                      {' · '}
                      <span className="font-mono-num">#{log.entityId}</span>
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 font-mono-num shrink-0">
                    {new Date(log.timestamp).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
