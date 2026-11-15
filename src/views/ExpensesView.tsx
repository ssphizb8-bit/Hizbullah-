import React, { useMemo, useState } from 'react';
import { Edit3, Receipt, Search, Trash2 } from 'lucide-react';
import { ExpenseCategory, ExpenseRecord, Language } from '../types';
import { EXPENSE_CATEGORY_LABELS, t } from '../i18n/translations';
import { formatDateDisplay, formatPKR, todayISO } from '../utils/format';
import { deleteExpense, saveExpense } from '../db/millService';

interface ExpensesViewProps {
  lang: Language;
  expenses: ExpenseRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
  onConfirmDelete: (onYes: () => Promise<void>) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'electricity',
  'salaries',
  'rent',
  'repairs',
  'transport',
  'misc',
];

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  lang,
  expenses,
  onRefresh,
  onToast,
  onConfirmDelete,
}) => {
  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<ExpenseCategory>('electricity');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [filterCat, setFilterCat] = useState<'all' | ExpenseCategory>('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setEditId(null);
    setDate(todayISO());
    setCategory('electricity');
    setAmount('');
    setDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      onToast(lang === 'ur' ? 'درست رقم درج کریں۔' : 'Enter a valid expense amount.', true);
      return;
    }
    setSubmitting(true);
    try {
      await saveExpense({ date, category, amount: amt, description }, editId ?? undefined);
      await onRefresh();
      onToast(
        editId
          ? lang === 'ur'
            ? 'خرچہ اپڈیٹ ہو گیا۔'
            : 'Expense updated.'
          : lang === 'ur'
          ? 'خرچہ محفوظ ہو گیا اور کیش بک اپڈیٹ ہو گئی۔'
          : 'Expense recorded & cash book updated.'
      );
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving expense';
      onToast(
        msg === 'DUPLICATE_SUBMISSION'
          ? lang === 'ur'
            ? 'یہ خرچہ ابھی درج ہو چکا ہے۔'
            : 'Duplicate expense prevented.'
          : msg,
        true
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filterCat !== 'all' && e.category !== filterCat) return false;
      if (!q) return true;
      return (
        e.voucherNo.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        EXPENSE_CATEGORY_LABELS[e.category][lang].toLowerCase().includes(q)
      );
    });
  }, [expenses, filterCat, search, lang]);

  const filteredTotal = filtered.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-red-600" />
            <span>{editId ? t(lang, 'edit') : t(lang, 'expensesTitle')}</span>
          </h2>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-slate-600 underline"
            >
              {t(lang, 'cancel')}
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'date')}</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'category')}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-emerald-600 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c][lang]}
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
            step="1"
            required
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'description')}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={lang === 'ur' ? 'بل نمبر یا تفصیل...' : 'Bill reference or details...'}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {editId ? t(lang, 'update') : t(lang, 'save')}
        </button>
      </form>

      {/* Expense List */}
      <div className="lg:col-span-7 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {lang === 'ur' ? 'اخراجات کا ریکارڈ' : 'Expense Ledger'}
            </h3>
            <p className="text-xs text-slate-500 font-mono-num">
              {t(lang, 'total')}: {formatPKR(filteredTotal, lang)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value as 'all' | ExpenseCategory)}
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold"
            >
              <option value="all">{lang === 'ur' ? 'تمام اقسام' : 'All Categories'}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c][lang]}
                </option>
              ))}
            </select>
            <div className="relative flex-1 sm:w-48">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(lang, 'search')}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 ps-9 pe-3 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{t(lang, 'noRecords')}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((exp) => (
              <div key={exp.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {EXPENSE_CATEGORY_LABELS[exp.category][lang]}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono-num">{exp.voucherNo}</span>
                    {' · '}
                    <span>{formatDateDisplay(exp.date, lang)}</span>
                    {exp.description ? ` · ${exp.description}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-extrabold font-mono-num text-red-700">
                    {formatPKR(exp.amount, lang)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(exp.id);
                      setDate(exp.date);
                      setCategory(exp.category);
                      setAmount(String(exp.amount));
                      setDescription(exp.description);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onConfirmDelete(async () => {
                        await deleteExpense(exp.id);
                        await onRefresh();
                        onToast(lang === 'ur' ? 'خرچہ حذف ہو گیا۔' : 'Expense deleted.');
                      })
                    }
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
