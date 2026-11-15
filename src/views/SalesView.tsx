import React, { useMemo, useState } from 'react';
import {
  Edit3,
  Package,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  Customer,
  Language,
  MillSettings,
  PaymentMode,
  RateUnit,
  SaleRecord,
  StockItem,
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
import { deleteSale, saveSale } from '../db/millService';

interface SalesViewProps {
  saleType: 'flour' | 'bran';
  lang: Language;
  settings: MillSettings;
  customers: Customer[];
  stock: StockItem[];
  sales: SaleRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
  onConfirmDelete: (onYes: () => Promise<void>) => void;
  onOpenInvoice: (sale: SaleRecord) => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  saleType,
  lang,
  settings,
  customers,
  stock,
  sales,
  onRefresh,
  onToast,
  onConfirmDelete,
  onOpenInvoice,
}) => {
  const availableItems = stock.filter((s) =>
    saleType === 'flour' ? s.category === 'flour' : s.category === 'bran'
  );
  const defaultStockId = availableItems[0]?.id ?? (saleType === 'flour' ? 'flour_chakki' : 'bran');
  const defaultRate =
    saleType === 'flour'
      ? settings.defaultFlourRateKg || 135
      : settings.defaultBranRateKg || 75;

  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [stockId, setStockId] = useState(defaultStockId);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [walkInName, setWalkInName] = useState('');
  const [weightKg, setWeightKg] = useState(40);
  const [rateUnit, setRateUnit] = useState<RateUnit>('kg');
  const [rate, setRate] = useState(defaultRate);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState(computeAmountByRate(40, defaultRate, 'kg'));
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedStock = stock.find((s) => s.id === stockId) ?? availableItems[0];
  const grossAmount = computeAmountByRate(weightKg, rate, rateUnit);
  const netAmount = Math.max(0, round2(grossAmount - discount));

  const syncPaid = (pm: PaymentMode, net: number) => {
    if (pm === 'cash') setPaidAmount(net);
    else if (pm === 'credit') setPaidAmount(0);
  };

  const handleWeightChange = (kg: number) => {
    setWeightKg(kg);
    const gross = computeAmountByRate(kg, rate, rateUnit);
    const net = Math.max(0, round2(gross - discount));
    syncPaid(paymentMode, net);
  };

  const handleRateChange = (newRate: number, unit: RateUnit) => {
    setRate(newRate);
    setRateUnit(unit);
    const gross = computeAmountByRate(weightKg, newRate, unit);
    const net = Math.max(0, round2(gross - discount));
    syncPaid(paymentMode, net);
  };

  const handleDiscountChange = (disc: number) => {
    setDiscount(disc);
    const net = Math.max(0, round2(grossAmount - disc));
    syncPaid(paymentMode, net);
  };

  const resetForm = () => {
    setEditId(null);
    setDate(todayISO());
    setStockId(defaultStockId);
    setCustomerId('');
    setWalkInName('');
    setWeightKg(40);
    setRateUnit('kg');
    const st = stock.find((s) => s.id === defaultStockId);
    const r = st?.defaultRateKg || defaultRate;
    setRate(r);
    setDiscount(0);
    setPaymentMode('cash');
    setPaidAmount(computeAmountByRate(40, r, 'kg'));
    setNotes('');
  };

  const startEdit = (s: SaleRecord) => {
    setEditId(s.id);
    setDate(s.date);
    setStockId(s.stockId);
    setCustomerId(s.customerId ?? '');
    setWalkInName(s.customerId ? '' : s.customerName);
    setWeightKg(s.weightKg);
    setRateUnit(s.rateUnit);
    setRate(s.rate);
    setDiscount(s.discount);
    setPaymentMode(s.paymentMode);
    setPaidAmount(s.paidAmount);
    setNotes(s.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMode !== 'cash' && !customerId) {
      onToast(t(lang, 'customerRequiredForCredit'), true);
      return;
    }
    const effectivePaid =
      paymentMode === 'cash' ? netAmount : paymentMode === 'credit' ? 0 : round2(paidAmount);

    setSubmitting(true);
    try {
      const cust = customers.find((c) => c.id === customerId);
      const id = await saveSale(
        {
          date,
          saleType,
          stockId: selectedStock?.id || stockId,
          customerId: cust ? cust.id : null,
          customerName: cust ? cust.name : walkInName.trim() || t(lang, 'walkInCustomer'),
          weightKg,
          rate,
          rateUnit,
          grossAmount,
          discount,
          netAmount,
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
            ? 'فروخت کا ریکارڈ اپڈیٹ ہو گیا۔'
            : 'Sale updated successfully.'
          : lang === 'ur'
          ? 'فروخت محفوظ ہو گئی اور اسٹاک اپڈیٹ ہو گیا۔'
          : 'Sale saved & stock updated.'
      );
      const savedList = sales;
      if (!editId && id && savedList) {
        // user can print invoice directly from list
      }
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving sale';
      onToast(
        msg === 'DUPLICATE_SUBMISSION'
          ? lang === 'ur'
            ? 'یہ بل ابھی ابھی محفوظ ہو چکا ہے۔'
            : 'Duplicate invoice prevented.'
          : msg,
        true
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sales.filter((s) => s.saleType === saleType);
    if (!q) return list;
    return list.filter(
      (s) =>
        s.invoiceNo.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        (s.stockNameEn || '').toLowerCase().includes(q) ||
        (s.stockNameUr || '').toLowerCase().includes(q)
    );
  }, [sales, saleType, search]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Sale Entry Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            {saleType === 'flour' ? (
              <ShoppingBag className="w-5 h-5 text-emerald-700" />
            ) : (
              <Package className="w-5 h-5 text-amber-600" />
            )}
            <span>
              {editId
                ? t(lang, 'edit')
                : saleType === 'flour'
                ? t(lang, 'flourSalesTitle')
                : t(lang, 'branSalesTitle')}
            </span>
          </h2>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
            >
              {t(lang, 'cancel')}
            </button>
          )}
        </div>

        {/* Live Available Stock Banner */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-emerald-900">{t(lang, 'availableStock')}</span>
          <span className="font-extrabold font-mono-num text-emerald-800">
            {formatWeight(selectedStock?.qtyKg ?? 0, lang)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {saleType === 'flour' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'flourType')}</label>
              <select
                value={stockId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setStockId(nextId);
                  const st = stock.find((s) => s.id === nextId);
                  if (st && st.defaultRateKg > 0 && rateUnit === 'kg') {
                    handleRateChange(st.defaultRateKg, 'kg');
                  }
                }}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              >
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {lang === 'ur' ? item.nameUr : item.nameEn} ({item.qtyKg} {t(lang, 'kg')})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t(lang, 'selectCustomer')}
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            >
              <option value="">{t(lang, 'walkInCustomer')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {!customerId && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'ur' ? 'نقد گاہک کا نام' : 'Walk-in Name'}
              </label>
              <input
                type="text"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder={t(lang, 'walkInCustomer')}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}
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
                step="0.5"
                value={rate || ''}
                onChange={(e) => handleRateChange(Math.max(0, Number(e.target.value) || 0), rateUnit)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
              />
              <select
                value={rateUnit}
                onChange={(e) => handleRateChange(rate, e.target.value as RateUnit)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold"
              >
                <option value="kg">{t(lang, 'kg')}</option>
                <option value="mann">{t(lang, 'mann')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'discount')}</label>
            <input
              type="number"
              min="0"
              max={grossAmount}
              step="1"
              value={discount || ''}
              placeholder="0"
              onChange={(e) => handleDiscountChange(Math.max(0, Number(e.target.value) || 0))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Summary Net Total */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">{t(lang, 'netTotal')}</span>
          <span className="text-lg font-extrabold font-mono-num text-emerald-800">
            {formatPKR(netAmount, lang)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'paymentMode')}</label>
            <select
              value={paymentMode}
              onChange={(e) => {
                const pm = e.target.value as PaymentMode;
                setPaymentMode(pm);
                syncPaid(pm, netAmount);
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
              max={netAmount}
              disabled={paymentMode !== 'partial'}
              value={paymentMode === 'cash' ? netAmount : paymentMode === 'credit' ? 0 : paidAmount}
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
            placeholder={lang === 'ur' ? 'اختیاری نوٹ...' : 'Optional notes...'}
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

      {/* Sales History List */}
      <div className="lg:col-span-7 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">
            {saleType === 'flour'
              ? lang === 'ur'
                ? 'آٹا فروخت ریکارڈ'
                : 'Flour Sales History'
              : lang === 'ur'
              ? 'چوکر فروخت ریکارڈ'
              : 'Bran Sales History'}{' '}
            ({filtered.length})
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
            {filtered.map((s) => {
              const due = round2(s.netAmount - s.paidAmount);
              return (
                <div key={s.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{s.customerName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono-num">{s.invoiceNo}</span>
                        {' · '}
                        <span>{formatDateDisplay(s.date, lang)}</span>
                        {' · '}
                        <span>{lang === 'ur' ? s.stockNameUr : s.stockNameEn}</span>
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-extrabold font-mono-num text-emerald-800">
                        {formatPKR(s.netAmount, lang)}
                      </p>
                      {due > 0 && (
                        <p className="text-xs font-semibold font-mono-num text-amber-700">
                          {t(lang, 'due')}: {formatPKR(due, lang)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                    <div className="font-mono-num">
                      <span>{formatWeight(s.weightKg, lang)}</span>
                      {' · '}
                      <span>
                        {formatPKR(s.rate, lang)} / {s.rateUnit === 'mann' ? t(lang, 'mann') : t(lang, 'kg')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(s)}
                        title={t(lang, 'invoice')}
                        className="min-h-[36px] px-2.5 flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{t(lang, 'invoice')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        title={t(lang, 'edit')}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onConfirmDelete(async () => {
                            await deleteSale(s.id);
                            await onRefresh();
                            onToast(lang === 'ur' ? 'فروخت حذف ہو گئی۔' : 'Sale deleted.');
                          })
                        }
                        title={t(lang, 'delete')}
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
