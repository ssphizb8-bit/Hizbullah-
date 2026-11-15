import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BookOpen,
  Download,
  Edit3,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Customer, Language, LedgerEntry, MillSettings, Supplier } from '../types';
import { t } from '../i18n/translations';
import {
  formatDateDisplay,
  formatPKR,
  isValidPakistaniPhone,
  todayISO,
} from '../utils/format';
import {
  deleteCustomer,
  deletePartyPayment,
  deleteSupplier,
  getCustomerLedger,
  getSupplierLedger,
  recordPartyPayment,
  saveCustomer,
  saveSupplier,
} from '../db/millService';
import { exportElementToPdf } from '../utils/exportReports';

interface PartiesViewProps {
  lang: Language;
  settings: MillSettings;
  customers: Customer[];
  suppliers: Supplier[];
  initialSubTab?: 'customers' | 'suppliers';
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
  onConfirmDelete: (onYes: () => Promise<void>) => void;
}

export const PartiesView: React.FC<PartiesViewProps> = ({
  lang,
  settings,
  customers,
  suppliers,
  initialSubTab = 'customers',
  onRefresh,
  onToast,
  onConfirmDelete,
}) => {
  const [subTab, setSubTab] = useState<'customers' | 'suppliers'>(initialSubTab);
  const [search, setSearch] = useState('');

  // Form Modal State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState(0);

  // Ledger Drawer/View State
  const [activeLedger, setActiveLedger] = useState<{
    type: 'customer' | 'supplier';
    party: Customer | Supplier;
    entries: LedgerEntry[];
  } | null>(null);

  // Quick Payment State inside Ledger
  const [payDate, setPayDate] = useState(todayISO());
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const ledgerPrintRef = useRef<HTMLDivElement>(null);

  const openCreateForm = () => {
    setEditingId(undefined);
    setName('');
    setPhone('');
    setAddress('');
    setOpeningBalance(0);
    setShowForm(true);
  };

  const openEditForm = (p: Customer | Supplier) => {
    setEditingId(p.id);
    setName(p.name);
    setPhone(p.phone);
    setAddress(p.address);
    setOpeningBalance(p.openingBalance);
    setShowForm(true);
  };

  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPakistaniPhone(phone)) {
      onToast(
        lang === 'ur' ? 'درست موبائل نمبر درج کریں (مثلاً 0300-1234567)' : 'Please enter a valid mobile number.',
        true
      );
      return;
    }
    try {
      if (subTab === 'customers') {
        await saveCustomer({ id: editingId, name, phone, address, openingBalance });
      } else {
        await saveSupplier({ id: editingId, name, phone, address, openingBalance });
      }
      await onRefresh();
      setShowForm(false);
      onToast(lang === 'ur' ? 'معلومات محفوظ ہو گئیں۔' : 'Saved successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving';
      onToast(msg, true);
    }
  };

  const openPartyLedger = async (type: 'customer' | 'supplier', id: number) => {
    if (type === 'customer') {
      const res = await getCustomerLedger(id);
      setActiveLedger({ type, party: res.customer, entries: res.entries });
    } else {
      const res = await getSupplierLedger(id);
      setActiveLedger({ type, party: res.supplier, entries: res.entries });
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLedger) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      onToast(lang === 'ur' ? 'درست رقم درج کریں۔' : 'Enter a valid amount.', true);
      return;
    }
    try {
      await recordPartyPayment({
        date: payDate,
        partyType: activeLedger.type,
        partyId: activeLedger.party.id,
        amount: amt,
        notes: payNotes,
      });
      await onRefresh();
      await openPartyLedger(activeLedger.type, activeLedger.party.id);
      setPayAmount('');
      setPayNotes('');
      onToast(lang === 'ur' ? 'ادائیگی کھاتہ میں درج ہو گئی۔' : 'Payment recorded in ledger.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Payment error', true);
    }
  };

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = subTab === 'customers' ? customers : suppliers;
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  }, [subTab, customers, suppliers, search]);

  const totalBalance = filteredList.reduce((acc, p) => acc + Math.max(0, p.balance), 0);
  const BackIcon = lang === 'ur' ? ArrowRight : ArrowLeft;

  // ====== COMPLETE LEDGER DETAIL VIEW ======
  if (activeLedger) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveLedger(null)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 flex items-center gap-2 hover:bg-slate-50"
          >
            <BackIcon className="w-4 h-4" />
            <span>{lang === 'ur' ? 'واپس فہرست' : 'Back to List'}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              if (ledgerPrintRef.current) {
                await exportElementToPdf(
                  ledgerPrintRef.current,
                  `Khata-${activeLedger.party.name}.pdf`
                );
              }
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-800"
          >
            <Download className="w-4 h-4" />
            <span>{t(lang, 'exportPdf')}</span>
          </button>
        </div>

        {/* Record Cash Receipt / Payment Form */}
        <form
          onSubmit={handleRecordPayment}
          className="rounded-2xl bg-white border border-emerald-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'date')}</label>
            <input
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {activeLedger.type === 'customer' ? t(lang, 'receivePayment') : t(lang, 'paySupplier')} (PKR)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              required
              placeholder="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'notes')}</label>
            <input
              type="text"
              placeholder={lang === 'ur' ? 'نقد وصولی / تفصیل' : 'Cash receipt remarks'}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-800"
          >
            <Banknote className="w-4 h-4" />
            <span>
              {activeLedger.type === 'customer' ? t(lang, 'receivePayment') : t(lang, 'paySupplier')}
            </span>
          </button>
        </form>

        {/* Printable Ledger Statement */}
        <div ref={ledgerPrintRef} className="rounded-2xl bg-white border border-emerald-100 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-semibold text-emerald-800">
                {lang === 'ur' ? settings.millNameUr : settings.millNameEn} · {t(lang, 'ledgerTitle')}
              </p>
              <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">{activeLedger.party.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeLedger.party.phone} {activeLedger.party.address ? `· ${activeLedger.party.address}` : ''}
              </p>
            </div>
            <div className="text-start sm:text-end">
              <p className="text-xs text-slate-500">{t(lang, 'currentBalance')}</p>
              <p
                className={`text-2xl font-extrabold font-mono-num ${
                  activeLedger.party.balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatPKR(activeLedger.party.balance, lang)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 px-2 text-start font-semibold">{t(lang, 'date')}</th>
                  <th className="py-2.5 px-2 text-start font-semibold">{t(lang, 'description')}</th>
                  <th className="py-2.5 px-2 text-end font-semibold">{t(lang, 'debit')}</th>
                  <th className="py-2.5 px-2 text-end font-semibold">{t(lang, 'creditCol')}</th>
                  <th className="py-2.5 px-2 text-end font-semibold">{t(lang, 'runningBalance')}</th>
                  <th className="py-2.5 px-2 text-end font-semibold no-print">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeLedger.entries.map((entry) => {
                  const isPayment = entry.refType === 'payment_in' || entry.refType === 'payment_out';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-2 whitespace-nowrap text-xs text-slate-600">
                        <div>{formatDateDisplay(entry.date, lang)}</div>
                        <div className="font-mono-num text-[11px] text-slate-400">{entry.refNo}</div>
                      </td>
                      <td className="py-3 px-2 text-slate-800">{entry.description}</td>
                      <td className="py-3 px-2 text-end font-mono-num text-amber-700 font-semibold">
                        {entry.debit > 0 ? formatPKR(entry.debit, lang) : '—'}
                      </td>
                      <td className="py-3 px-2 text-end font-mono-num text-emerald-700 font-semibold">
                        {entry.credit > 0 ? formatPKR(entry.credit, lang) : '—'}
                      </td>
                      <td className="py-3 px-2 text-end font-mono-num font-bold text-slate-900">
                        {formatPKR(entry.runningBalance, lang)}
                      </td>
                      <td className="py-3 px-2 text-end no-print">
                        {isPayment && entry.refId && (
                          <button
                            type="button"
                            onClick={() =>
                              onConfirmDelete(async () => {
                                await deletePartyPayment(entry.refId!);
                                await onRefresh();
                                await openPartyLedger(activeLedger.type, activeLedger.party.id);
                                onToast(lang === 'ur' ? 'وصولی حذف ہو گئی۔' : 'Payment deleted.');
                              })
                            }
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                            title={t(lang, 'delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Opening Balance row at bottom (oldest chronologically) */}
                <tr className="bg-slate-50/60">
                  <td className="py-3 px-2 text-xs text-slate-500">—</td>
                  <td className="py-3 px-2 text-xs font-semibold text-slate-700">
                    {t(lang, 'openingBalance')}
                  </td>
                  <td className="py-3 px-2 text-end font-mono-num text-xs">—</td>
                  <td className="py-3 px-2 text-end font-mono-num text-xs">—</td>
                  <td className="py-3 px-2 text-end font-mono-num font-bold text-slate-800">
                    {formatPKR(activeLedger.party.openingBalance, lang)}
                  </td>
                  <td className="no-print" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ====== CUSTOMERS & SUPPLIERS DIRECTORY ======
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Segmented Tab */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-white rounded-xl border border-emerald-100 w-full sm:w-80">
          <button
            type="button"
            onClick={() => setSubTab('customers')}
            className={`min-h-[42px] rounded-lg text-xs font-bold transition-colors ${
              subTab === 'customers' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
            }`}
          >
            {t(lang, 'customersTab')} ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('suppliers')}
            className={`min-h-[42px] rounded-lg text-xs font-bold transition-colors ${
              subTab === 'suppliers' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
            }`}
          >
            {t(lang, 'suppliersTab')} ({suppliers.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'search')}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-emerald-800 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{subTab === 'customers' ? t(lang, 'addCustomer') : t(lang, 'addSupplier')}</span>
          </button>
        </div>
      </div>

      {/* Total Summary Bar */}
      <div className="rounded-2xl bg-white border border-emerald-100 px-5 py-3.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">
          {subTab === 'customers' ? t(lang, 'customerDues') : t(lang, 'supplierPayables')}
        </span>
        <span className="text-lg font-extrabold font-mono-num text-amber-700">
          {formatPKR(totalBalance, lang)}
        </span>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveParty}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">
              {editingId
                ? subTab === 'customers'
                  ? t(lang, 'editCustomer')
                  : t(lang, 'editSupplier')
                : subTab === 'customers'
                ? t(lang, 'addCustomer')
                : t(lang, 'addSupplier')}
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'name')} <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'mobile')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0300-1234567"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'address')}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t(lang, 'openingBalance')} (PKR)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={openingBalance || ''}
                placeholder="0"
                onChange={(e) => setOpeningBalance(Math.max(0, Number(e.target.value) || 0))}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-emerald-800"
              >
                <Plus className="w-4 h-4" />
                <span>{t(lang, 'save')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Party List */}
      <div className="rounded-2xl bg-white border border-emerald-100 divide-y divide-slate-100">
        {filteredList.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{t(lang, 'noRecords')}</p>
        ) : (
          filteredList.map((p) => (
            <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                  {p.phone && (
                    <span className="inline-flex items-center gap-1 font-mono-num">
                      <Phone className="w-3 h-3" /> {p.phone}
                    </span>
                  )}
                  {p.address && <span>· {p.address}</span>}
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div className="text-start sm:text-end">
                  <p className="text-[11px] text-slate-500">{t(lang, 'currentBalance')}</p>
                  <p
                    className={`text-sm font-extrabold font-mono-num ${
                      p.balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatPKR(p.balance, lang)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openPartyLedger(subTab === 'customers' ? 'customer' : 'supplier', p.id)}
                    className="min-h-[40px] px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{t(lang, 'viewLedger')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditForm(p)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onConfirmDelete(async () => {
                        if (subTab === 'customers') await deleteCustomer(p.id);
                        else await deleteSupplier(p.id);
                        await onRefresh();
                        onToast(lang === 'ur' ? 'حذف ہو گیا۔' : 'Deleted.');
                      })
                    }
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
