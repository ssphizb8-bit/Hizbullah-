import React, { useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import { GrindingOrder, Language, MillSettings, SaleRecord } from '../types';
import { formatDateDisplay, formatPKR, formatWeight } from '../utils/format';
import { t, GRINDING_STATUS_LABELS } from '../i18n/translations';
import { exportElementToPdf } from '../utils/exportReports';

interface InvoiceModalProps {
  lang: Language;
  settings: MillSettings;
  sale?: SaleRecord | null;
  grinding?: GrindingOrder | null;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  lang,
  settings,
  sale,
  grinding,
  onClose,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  if (!sale && !grinding) return null;

  const docNo = sale ? sale.invoiceNo : grinding!.receiptNo;

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setExporting(true);
    try {
      await exportElementToPdf(sheetRef.current, `${docNo}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-auto">
        {/* Modal Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-800 text-white no-print">
          <span className="text-sm font-bold font-mono-num">{docNo}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold"
            >
              <Download className="w-4 h-4" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-semibold"
            >
              <Printer className="w-4 h-4" />
              <span>{t(lang, 'print')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-white/15"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Sheet */}
        <div ref={sheetRef} dir={lang === 'ur' ? 'rtl' : 'ltr'} className="p-6 bg-white text-slate-900">
          <div className="text-center border-b-2 border-emerald-700 pb-4">
            <h2 className="text-xl font-extrabold text-emerald-900">
              {lang === 'ur' ? settings.millNameUr : settings.millNameEn}
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              {settings.address} {settings.phone ? `· ${settings.phone}` : ''}
            </p>
            <p className="text-xs font-bold text-emerald-800 mt-2">
              {sale
                ? sale.saleType === 'flour'
                  ? lang === 'ur'
                    ? 'آٹا فروخت بل / انوائس'
                    : 'FLOUR SALES INVOICE'
                  : lang === 'ur'
                  ? 'چوکر فروخت بل / انوائس'
                  : 'BRAN SALES INVOICE'
                : lang === 'ur'
                ? 'گندم پسائی رسید'
                : 'WHEAT GRINDING RECEIPT'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 py-4 border-b border-slate-200 text-xs">
            <div>
              <span className="text-slate-500">{lang === 'ur' ? 'نمبر:' : 'No:'}</span>{' '}
              <span className="font-bold font-mono-num">{docNo}</span>
            </div>
            <div className="text-end">
              <span className="text-slate-500">{t(lang, 'date')}:</span>{' '}
              <span className="font-semibold">{formatDateDisplay(sale ? sale.date : grinding!.date, lang)}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">{lang === 'ur' ? 'گاہک:' : 'Customer:'}</span>{' '}
              <span className="font-bold text-slate-900">
                {sale ? sale.customerName : grinding!.customerName}
              </span>
            </div>
          </div>

          {sale && (
            <div className="py-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">{lang === 'ur' ? 'جنس / قسم' : 'Item'}</span>
                <span className="font-semibold">
                  {lang === 'ur' ? sale.stockNameUr : sale.stockNameEn}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'weight')}</span>
                <span className="font-semibold font-mono-num">{formatWeight(sale.weightKg, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'rate')}</span>
                <span className="font-mono-num">
                  {formatPKR(sale.rate, lang)} / {sale.rateUnit === 'mann' ? t(lang, 'mann') : t(lang, 'kg')}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-600">{t(lang, 'total')}</span>
                <span className="font-mono-num">{formatPKR(sale.grossAmount, lang)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>{t(lang, 'discount')}</span>
                  <span className="font-mono-num">- {formatPKR(sale.discount, lang)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-slate-900 border-t border-slate-300 pt-2">
                <span>{t(lang, 'netTotal')}</span>
                <span className="font-mono-num">{formatPKR(sale.netAmount, lang)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span>{t(lang, 'paid')}</span>
                <span className="font-mono-num">{formatPKR(sale.paidAmount, lang)}</span>
              </div>
              <div className="flex justify-between text-amber-700 font-bold">
                <span>{t(lang, 'due')}</span>
                <span className="font-mono-num">{formatPKR(Math.max(0, sale.netAmount - sale.paidAmount), lang)}</span>
              </div>
            </div>
          )}

          {grinding && (
            <div className="py-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'customerWheatKg')}</span>
                <span className="font-bold font-mono-num">{formatWeight(grinding.wheatKg, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'flourOutput')}</span>
                <span className="font-semibold font-mono-num">{formatWeight(grinding.flourKg, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'branOutput')}</span>
                <span className="font-semibold font-mono-num">
                  {formatWeight(grinding.branKg, lang)}
                  {grinding.keepBranForMill
                    ? lang === 'ur'
                      ? ' (چکی اسٹاک)'
                      : ' (Kept by Mill)'
                    : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t(lang, 'deliveryStatus')}</span>
                <span className="font-semibold">{GRINDING_STATUS_LABELS[grinding.status][lang]}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold border-t border-slate-300 pt-2">
                <span>{t(lang, 'grindingFee')}</span>
                <span className="font-mono-num">{formatPKR(grinding.grindingFee, lang)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span>{t(lang, 'paid')}</span>
                <span className="font-mono-num">{formatPKR(grinding.paidAmount, lang)}</span>
              </div>
              <div className="flex justify-between text-amber-700 font-bold">
                <span>{t(lang, 'due')}</span>
                <span className="font-mono-num">
                  {formatPKR(Math.max(0, grinding.grindingFee - grinding.paidAmount), lang)}
                </span>
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-slate-300 pt-3 mt-2 text-center text-[11px] text-slate-500">
            {lang === 'ur'
              ? 'شکریہ! کمپیوٹرائزڈ رسید — آٹا چکی پرو'
              : 'Thank you for your business! Computerized Receipt — AATA CHAKKI PRO'}
          </div>
        </div>
      </div>
    </div>
  );
};
