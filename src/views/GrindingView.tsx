import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Printer,
  Search,
  Trash2,
  Wheat,
} from 'lucide-react';
import {
  Customer,
  GrindingMode,
  GrindingOrder,
  GrindingStatus,
  Language,
  MillSettings,
  PaymentMode,
  RateUnit,
  StockItem,
} from '../types';
import { GRINDING_STATUS_LABELS, t } from '../i18n/translations';
import {
  computeAmountByRate,
  formatDateDisplay,
  formatPKR,
  formatWeight,
  round2,
  todayISO,
} from '../utils/format';
import { WeightInput } from '../components/WeightInput';
import {
  deleteGrindingOrder,
  saveGrindingOrder,
  updateGrindingStatus,
} from '../db/millService';

interface GrindingViewProps {
  lang: Language;
  settings: MillSettings;
  customers: Customer[];
  stock: StockItem[];
  orders: GrindingOrder[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
  onConfirmDelete: (onYes: () => Promise<void>) => void;
  onOpenReceipt: (order: GrindingOrder) => void;
}

export const GrindingView: React.FC<GrindingViewProps> = ({
  lang,
  settings,
  customers,
  stock,
  orders,
  onRefresh,
  onToast,
  onConfirmDelete,
  onOpenReceipt,
}) => {
  const flourStocks = stock.filter((s) => s.category === 'flour');
  const wheatStockKg = stock.find((s) => s.id === 'wheat')?.qtyKg ?? 0;

  const [editId, setEditId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<GrindingMode>('customer');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [walkInName, setWalkInName] = useState('');
  const [wheatKg, setWheatKg] = useState(40);
  const [flourKg, setFlourKg] = useState(36);
  const [branKg, setBranKg] = useState(3.5);
  const [flourStockId, setFlourStockId] = useState('flour_chakki');
  const [keepBranForMill, setKeepBranForMill] = useState(false);
  const [rateUnit, setRateUnit] = useState<RateUnit>('mann');
  const [grindingRate, setGrindingRate] = useState(settings.defaultGrindingRateMann || 240);
  const [grindingFee, setGrindingFee] = useState(240);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState(240);
  const [status, setStatus] = useState<GrindingStatus>('delivered');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleWheatChange = (newKg: number) => {
    setWheatKg(newKg);
    // Suggest standard Pakistani chakki yield (~90% flour, ~8.5% bran)
    setFlourKg(round2(newKg * 0.9));
    setBranKg(round2(newKg * 0.085));
    if (mode === 'customer') {
      const fee = computeAmountByRate(newKg, grindingRate, rateUnit);
      setGrindingFee(fee);
      if (paymentMode === 'cash') setPaidAmount(fee);
      else if (paymentMode === 'credit') setPaidAmount(0);
    }
  };

  const handleRateChange = (newRate: number, unit: RateUnit) => {
    setGrindingRate(newRate);
    setRateUnit(unit);
    if (mode === 'customer') {
      const fee = computeAmountByRate(wheatKg, newRate, unit);
      setGrindingFee(fee);
      if (paymentMode === 'cash') setPaidAmount(fee);
      else if (paymentMode === 'credit') setPaidAmount(0);
    }
  };

  const handlePaymentModeChange = (pm: PaymentMode) => {
    setPaymentMode(pm);
    if (pm === 'cash') setPaidAmount(grindingFee);
    else if (pm === 'credit') setPaidAmount(0);
  };

  const resetForm = () => {
    setEditId(null);
    setDate(todayISO());
    setCustomerId('');
    setWalkInName('');
    setWheatKg(40);
    setFlourKg(36);
    setBranKg(3.5);
    setKeepBranForMill(false);
    const defaultFee = computeAmountByRate(40, settings.defaultGrindingRateMann || 240, 'mann');
    setGrindingRate(settings.defaultGrindingRateMann || 240);
    setRateUnit('mann');
    setGrindingFee(defaultFee);
    setPaymentMode('cash');
    setPaidAmount(defaultFee);
    setStatus('delivered');
    setNotes('');
  };

  const startEdit = (o: GrindingOrder) => {
    setEditId(o.id);
    setDate(o.date);
    setMode(o.mode);
    setCustomerId(o.customerId ?? '');
    setWalkInName(o.customerId ? '' : o.customerName);
    setWheatKg(o.wheatKg);
    setFlourKg(o.flourKg);
    setBranKg(o.branKg);
    setFlourStockId(o.flourStockId);
    setKeepBranForMill(o.keepBranForMill);
    setGrindingRate(o.grindingRate);
    setRateUnit(o.rateUnit);
    setGrindingFee(o.grindingFee);
    setPaymentMode(o.paymentMode);
    setPaidAmount(o.paidAmount);
    setStatus(o.status);
    setNotes(o.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const selectedCust = customers.find((c) => c.id === customerId);
      const resolvedName =
        mode === 'mill'
          ? lang === 'ur'
            ? 'مل اپنی پسائی'
            : 'Mill Own Production'
          : selectedCust
          ? selectedCust.name
          : walkInName.trim() || t(lang, 'walkInCustomer');

      const finalFee = mode === 'mill' ? 0 : round2(grindingFee);
      const finalPaid =
        mode === 'mill'
          ? 0
          : paymentMode === 'cash'
          ? finalFee
          : paymentMode === 'credit'
          ? 0
          : round2(paidAmount);

      await saveGrindingOrder(
        {
          date,
          mode,
          customerId: mode === 'customer' && selectedCust ? selectedCust.id : null,
          customerName: resolvedName,
          wheatKg,
          flourKg,
          branKg,
          flourStockId,
          keepBranForMill: mode === 'customer' ? keepBranForMill : true,
          grindingRate: mode === 'mill' ? 0 : grindingRate,
          rateUnit,
          grindingFee: finalFee,
          paidAmount: finalPaid,
          paymentMode: mode === 'mill' ? 'cash' : paymentMode,
          status,
          notes,
        },
        editId ?? undefined
      );
      await onRefresh();
      onToast(
        editId
          ? lang === 'ur'
            ? 'پسائی ریکارڈ اپڈیٹ ہو گیا۔'
            : 'Grinding record updated.'
          : lang === 'ur'
          ? 'نئی پسائی کامیابی سے محفوظ ہو گئی۔'
          : 'Grinding entry saved successfully.'
      );
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving grinding order';
      onToast(
        msg === 'DUPLICATE_SUBMISSION'
          ? lang === 'ur'
            ? 'یہ انٹری ابھی ابھی محفوظ کی جا چکی ہے۔'
            : 'Duplicate submission prevented.'
          : msg,
        true
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.receiptNo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.notes.toLowerCase().includes(q)
    );
  }, [orders, search]);

  const flourPct = wheatKg > 0 ? round2((flourKg / wheatKg) * 100) : 0;
  const branPct = wheatKg > 0 ? round2((branKg / wheatKg) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Entry Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Wheat className="w-5 h-5 text-emerald-700" />
            <span>{editId ? t(lang, 'edit') : t(lang, 'grindingTitle')}</span>
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

        {/* Mode Segmented Toggle */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-emerald-50/70 rounded-xl border border-emerald-100">
          <button
            type="button"
            onClick={() => setMode('customer')}
            className={`min-h-[42px] rounded-lg text-xs font-bold transition-colors ${
              mode === 'customer'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-emerald-900 hover:bg-emerald-100/60'
            }`}
          >
            {t(lang, 'customerGrinding')}
          </button>
          <button
            type="button"
            onClick={() => setMode('mill')}
            className={`min-h-[42px] rounded-lg text-xs font-bold transition-colors ${
              mode === 'mill'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-emerald-900 hover:bg-emerald-100/60'
            }`}
          >
            {t(lang, 'millProduction')}
          </button>
        </div>

        {mode === 'mill' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">
            <span className="font-semibold">{lang === 'ur' ? 'دستیاب گندم اسٹاک:' : 'Available Wheat Stock:'}</span>{' '}
            <span className="font-bold font-mono-num">{formatWeight(wheatStockKg, lang)}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'date')}</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'deliveryStatus')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as GrindingStatus)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-emerald-600 focus:outline-none"
            >
              <option value="in_mill">{GRINDING_STATUS_LABELS.in_mill[lang]}</option>
              <option value="ready">{GRINDING_STATUS_LABELS.ready[lang]}</option>
              <option value="delivered">{GRINDING_STATUS_LABELS.delivered[lang]}</option>
            </select>
          </div>
        </div>

        {mode === 'customer' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'selectCustomer')}
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                <option value="">{t(lang, 'walkInCustomer')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.balance > 0 ? `(${formatPKR(c.balance, lang)})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {!customerId && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'ur' ? 'کسٹمر کا نام (اختیاری)' : 'Walk-in Name (Optional)'}
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
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t(lang, 'targetFlourType')}
            </label>
            <select
              value={flourStockId}
              onChange={(e) => setFlourStockId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 focus:border-emerald-600 focus:outline-none"
            >
              {flourStocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {lang === 'ur' ? f.nameUr : f.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}

        <WeightInput
          label={t(lang, 'customerWheatKg')}
          valueKg={wheatKg}
          onChangeKg={handleWheatChange}
          lang={lang}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t(lang, 'flourOutput')} ({t(lang, 'kg')}) · <span className="text-emerald-700 font-mono-num">{flourPct}%</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={flourKg || ''}
              onChange={(e) => setFlourKg(Math.max(0, Number(e.target.value) || 0))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t(lang, 'branOutput')} ({t(lang, 'kg')}) · <span className="text-amber-700 font-mono-num">{branPct}%</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={branKg || ''}
              onChange={(e) => setBranKg(Math.max(0, Number(e.target.value) || 0))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {mode === 'customer' && (
          <>
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={keepBranForMill}
                onChange={(e) => setKeepBranForMill(e.target.checked)}
                className="w-4 h-4 accent-emerald-700 rounded"
              />
              <span>{t(lang, 'keepBranForMill')}</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(lang, 'rate')}
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={grindingRate || ''}
                    onChange={(e) => handleRateChange(Math.max(0, Number(e.target.value) || 0), rateUnit)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
                  />
                  <select
                    value={rateUnit}
                    onChange={(e) => handleRateChange(grindingRate, e.target.value as RateUnit)}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold"
                  >
                    <option value="mann">{t(lang, 'mann')}</option>
                    <option value="kg">{t(lang, 'kg')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(lang, 'grindingFee')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={grindingFee || ''}
                  onChange={(e) => {
                    const fee = Math.max(0, Number(e.target.value) || 0);
                    setGrindingFee(fee);
                    if (paymentMode === 'cash') setPaidAmount(fee);
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-bold font-mono-num text-emerald-950 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(lang, 'paymentMode')}
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => handlePaymentModeChange(e.target.value as PaymentMode)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">{t(lang, 'cash')}</option>
                  <option value="credit">{t(lang, 'credit')}</option>
                  <option value="partial">{t(lang, 'partial')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t(lang, 'paid')}
                </label>
                <input
                  type="number"
                  min="0"
                  max={grindingFee}
                  disabled={paymentMode !== 'partial'}
                  value={paymentMode === 'cash' ? grindingFee : paymentMode === 'credit' ? 0 : paidAmount}
                  onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono-num disabled:bg-slate-50"
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lang === 'ur' ? 'اختیاری نوٹ...' : 'Optional remarks...'}
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

      {/* Grinding History List */}
      <div className="lg:col-span-7 rounded-2xl bg-white border border-emerald-100 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">
            {lang === 'ur' ? 'پسائی ریکارڈز' : 'Grinding Records'} ({filtered.length})
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
            {filtered.map((o) => {
              const due = round2(o.grindingFee - o.paidAmount);
              return (
                <div key={o.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{o.customerName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono-num">{o.receiptNo}</span>
                        {' · '}
                        <span>{formatDateDisplay(o.date, lang)}</span>
                        {' · '}
                        <span>
                          {o.mode === 'mill'
                            ? t(lang, 'millProduction')
                            : t(lang, 'customerGrinding')}
                        </span>
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-extrabold font-mono-num text-emerald-800">
                        {o.mode === 'mill'
                          ? lang === 'ur'
                            ? 'اسٹاک پسائی'
                            : 'Stock Batch'
                          : formatPKR(o.grindingFee, lang)}
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
                      <span>{lang === 'ur' ? 'گندم:' : 'Wheat:'} {formatWeight(o.wheatKg, lang)}</span>
                      {' · '}
                      <span>{lang === 'ur' ? 'آٹا:' : 'Flour:'} {o.flourKg} {t(lang, 'kg')}</span>
                      {' · '}
                      <span>{lang === 'ur' ? 'چوکر:' : 'Bran:'} {o.branKg} {t(lang, 'kg')}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {o.status !== 'delivered' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await updateGrindingStatus(o.id, 'delivered');
                            await onRefresh();
                            onToast(lang === 'ur' ? 'حوالگی مکمل ہو گئی' : 'Marked Delivered');
                          }}
                          className="min-h-[36px] px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-1 hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{GRINDING_STATUS_LABELS.delivered[lang]}</span>
                        </button>
                      )}
                      {o.status === 'delivered' && (
                        <span className="text-xs font-semibold text-emerald-700 px-1.5">
                          {GRINDING_STATUS_LABELS.delivered[lang]}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenReceipt(o)}
                        title={t(lang, 'receipt')}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(o)}
                        title={t(lang, 'edit')}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onConfirmDelete(async () => {
                            await deleteGrindingOrder(o.id);
                            await onRefresh();
                            onToast(lang === 'ur' ? 'ریکارڈ حذف ہو گیا۔' : 'Grinding order deleted.');
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
