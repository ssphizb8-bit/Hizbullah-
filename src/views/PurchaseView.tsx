import React, { useMemo, useState } from 'react';
import { Edit3, Scale, Search, Trash2 } from 'lucide-react';
import {
  Language,
  PaymentMode,
  RateUnit,
  StockItem,
  Supplier,
  WheatPurchase,
} from '../types';
import { t } from '../i18n/translations';
import {
  computeAmountByRate,
  formatDateDisplay,
  formatPKR,
  formatWeight,
  round2,
  todayISO,
} from '../utils/format';
import { WeightInput } from '../components/WeightInput';
import { deleteWheatPurchase, saveWheatPurchase } from '../db/millService';

interface PurchaseViewProps {
  lang: Language;
  suppliers: Supplier[];
  stock: StockItem[];
  purchases: WheatPurchase[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
  onConfirmDelete: (onYes: () => Promise<void>) => void;
  onNavigateToSuppliers: () => void;
}

export const PurchaseView: React.FC<PurchaseViewProps> = ({
  lang,
  suppliers,
  stock,
  purchases,
  onRefresh,
  onToast,
  onConfirmDelete,
  onNavigateToSuppliers,
}) => {
  const wheatStockKg = stock.find((s) => s.id === 'wheat')?.qtyKg ?? 0;

  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [supplierId, setSupplierId] = useState<number | ''>(suppliers[0]?.id ?? '');
  const [weightKg, setWeightKg] = useState(400);
  const [rateUnit, setRateUnit] = useState<RateUnit>('mann');
  const [rate, setRate] = useState(3900);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState(computeAmountByRate(400, 3900, 'mann'));
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalAmount = computeAmountByRate(weightKg, rate, rateUnit);

  const syncPaid = (pm: PaymentMode, total: number) => {
    if (pm === 'cash') setPaidAmount(total);
    else if (pm === 'credit') setPaidAmount(0);
  };

  const handleWeightChange = (kg: number) => {
    setWeightKg(kg);
    const total = computeAmountByRate(kg, rate, rateUnit);
    syncPaid(paymentMode, total);
  };

  const handleRateChange = (newRate: number, unit: RateUnit) => {
    setRate(newRate);
    setRateUnit(unit);
    const total = computeAmountByRate(weightKg, newRate, unit);
    syncPaid(paymentMode, total);
  };

  const resetForm = () => {
    setEditId(null);
    setDate(todayISO());
    setSupplierId(suppliers[0]?.id ?? '');
    setWeightKg(400);
    setRateUnit('mann');
    setRate(3900);
    setPaymentMode('cash');
    setPaidAmount(computeAmountByRate(400, 3900, 'mann'));
    setNotes('');
  };

  const startEdit = (p: WheatPurchase) => {
    setEditId(p.id);
    setDate(p.date);
    setSupplierId(p.supplierId);
    setWeightKg(p.weightKg);
    setRateUnit(p.rateUnit);
    setRate(p.rate);
    setPaymentMode(p.paymentMode);
    setPaidAmount(p.paidAmount);
    setNotes(p.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      onToast(
        lang === 'ur' ? 'پہلے سپلائر منتخب کریں یا نیا شامل کریں۔' : 'Please select or add a supplier first.',
        true
      );
      return;
    }
    const effectivePaid =
      paymentMode === 'cash' ? totalAmount : paymentMode === 'credit' ? 0 : round2(paidAmount);

    setSubmitting(true);
    try {
      await saveWheatPurchase(
        {
          date,
          supplierId: Number(supplierId),
          weightKg,
          rate,
          rateUnit,
          totalAmount,
          paidAmount: effectivePaid,
          paymentMode,
          notes,
        },
        editId ?? undefined
      );
      await onRefresh();
      onToast(
        editId
          ? lang === 'ur'
            ? 'خریداری ریکارڈ اپڈیٹ ہو گیا۔'
            : 'Wheat purchase updated.'
          : lang === 'ur'
          ? 'گندم خریداری محفوظ ہو گئی اور اسٹاک بڑھ گیا۔'
          : 'Wheat purchase saved & stock increased.'
      );
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving purchase';
      onToast(
        msg === 'DUPLICATE_SUBMISSION'
          ? lang === 'ur'
            ? 'یہ خریداری ابھی محفوظ کی جا چکی ہے۔'
            : 'Duplicate purchase prevented.'
          : msg,
        true
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        p.invoiceNo.toLowerCase().includes(q) ||
        (p.supplierName || '').toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q)
    );
  }, [purchases, search]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-700" />
            <span>{editId ? t(lang, 'edit') : t(lang, 'wheatPurchaseTitle')}</span>
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

        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-emerald-900">
            {lang === 'ur' ? 'موجودہ گندم اسٹاک' : 'Current Wheat Stock'}
          </span>
          <span className="font-extrabold font-mono-num text-emerald-800">
            {formatWeight(wheatStockKg, lang)}
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'date')}</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-700">
              {t(lang, 'selectSupplier')} <span className="text-red-600">*</span>
            </label>
            <button
              type="button"
              onClick={onNavigateToSuppliers}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              + {t(lang, 'addSupplier')}
            </button>
          </div>
          <select
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          >
            <option value="">
              {suppliers.length === 0
                ? lang === 'ur'
                  ? 'کوئی سپلائر موجود نہیں — پہلے شامل کریں'
                  : 'No suppliers — click Add Supplier'
                : t(lang, 'selectSupplier')}
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <WeightInput
          label={t(lang, 'weight')}
          valueKg={weightKg}
          onChangeKg={handleWeightChange}
          lang={lang}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'rate')}</label>
            <div className="flex gap-1">
              <input
                type="number"
                min="0"
                step="1"
                value={rate || ''}
                onChange={(e) => handleRateChange(Math.max(0, Number(e.target.value) || 0), rateUnit)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
              />
              <select
                value={rateUnit}
                onChange={(e) => handleRateChange(rate, e.target.value as RateUnit)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold"
              >
                <option value="mann">{t(lang, 'mann')}</option>
                <option value="kg">{t(lang, 'kg')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'total')}</label>
            <div className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 flex items-center font-extrabold font-mono-num text-emerald-900">
              {formatPKR(totalAmount, lang)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'paymentMode')}</label>
            <select
              value={paymentMode}
              onChange={(e) => {
                const pm = e.target.value as PaymentMode;
                setPaymentMode(pm);
                syncPaid(pm, totalAmount);
              }}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="cash">{t(lang, 'cash')}</option>
              <option value="credit">{t(lang, 'credit')}</option>
              <option value="partial">{t(lang, 'partial')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'paid')}</label>
            <input
              type="number"
              min="0"
              max={totalAmount}
              disabled={paymentMode !== 'partial'}
              value={paymentMode === 'cash' ? totalAmount : paymentMode === 'credit' ? 0 : paidAmount}
              onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num disabled:bg-slate-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lang === 'ur' ? 'اختیاری تفصیل...' : 'Lot / grade details...'}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
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

      {/* Purchase History */}
      <div className="lg:col-span-7 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">
            {lang === 'ur' ? 'گندم خریداری ریکارڈ' : 'Purchase History'} ({filtered.length})
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'search')}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 ps-9 pe-3 py-1.5 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{t(lang, 'noRecords')}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((p) => {
              const due = round2(p.totalAmount - p.paidAmount);
              return (
                <div key={p.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{p.supplierName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono-num">{p.invoiceNo}</span>
                        {' · '}
                        <span>{formatDateDisplay(p.date, lang)}</span>
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-extrabold font-mono-num text-slate-900">
                        {formatPKR(p.totalAmount, lang)}
                      </p>
                      {due > 0 && (
                        <p className="text-xs font-semibold font-mono-num text-amber-700">
                          {t(lang, 'due')}: {formatPKR(due, lang)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                    <div className="font-mono-num">
                      <span>{formatWeight(p.weightKg, lang)}</span>
                      {' · '}
                      <span>
                        {formatPKR(p.rate, lang)} / {p.rateUnit === 'mann' ? t(lang, 'mann') : t(lang, 'kg')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onConfirmDelete(async () => {
                            await deleteWheatPurchase(p.id);
                            await onRefresh();
                            onToast(lang === 'ur' ? 'خریداری ریکارڈ حذف ہو گیا۔' : 'Purchase deleted.');
                          })
                        }
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
