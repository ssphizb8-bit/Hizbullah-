import React, { useEffect, useRef, useState } from 'react';
import {
  Database,
  Download,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { AutoBackupRecord, Language, MillSettings, StockItem } from '../types';
import { t } from '../i18n/translations';
import {
  adjustStockItem,
  changePin,
  exportJsonBackup,
  exportSqliteBinary,
  loadDemoMillData,
  resetAllMillData,
  restoreFromAutoSnapshot,
  restoreFromBackupFile,
  updateSettings,
} from '../db/millService';
import { createAutoBackupSnapshot, listAutoBackups } from '../db/sqliteEngine';
import { formatWeight } from '../utils/format';

interface SettingsViewProps {
  lang: Language;
  settings: MillSettings;
  stock: StockItem[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, isError?: boolean) => void;
  onConfirmAction: (title: string, desc: string, onYes: () => Promise<void>) => void;
  onLockNow: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  lang,
  settings,
  stock,
  onRefresh,
  onToast,
  onConfirmAction,
  onLockNow,
}) => {
  const [millNameEn, setMillNameEn] = useState(settings.millNameEn);
  const [millNameUr, setMillNameUr] = useState(settings.millNameUr);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [grindingRate, setGrindingRate] = useState(settings.defaultGrindingRateMann);
  const [flourRate, setFlourRate] = useState(settings.defaultFlourRateKg);
  const [branRate, setBranRate] = useState(settings.defaultBranRateKg);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [autoBackups, setAutoBackups] = useState<AutoBackupRecord[]>([]);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshBackups = async () => {
    const list = await listAutoBackups();
    setAutoBackups(list);
  };

  useEffect(() => {
    refreshBackups();
  }, []);

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const s of stock) map[s.id] = String(s.qtyKg);
    setStockDrafts(map);
  }, [stock]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      millNameEn,
      millNameUr,
      phone,
      address,
      defaultGrindingRateMann: grindingRate,
      defaultFlourRateKg: flourRate,
      defaultBranRateKg: branRate,
    });
    await onRefresh();
    onToast(lang === 'ur' ? 'چکی کی تفصیل محفوظ ہو گئی۔' : 'Mill settings updated.');
  };

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await changePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      await onRefresh();
      onToast(lang === 'ur' ? 'پن کوڈ کامیابی سے تبدیل ہو گیا۔' : 'PIN updated successfully.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PIN update failed', true);
    }
  };

  const handleDownloadJson = async () => {
    const json = await exportJsonBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AataChakkiPro_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await onRefresh();
    onToast(lang === 'ur' ? 'بیک اپ فائل ڈاؤن لوڈ ہو گئی۔' : 'JSON backup downloaded.');
  };

  const handleDownloadSqlite = async () => {
    const bytes = await exportSqliteBinary();
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AataChakkiPro_${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    URL.revokeObjectURL(url);
    await onRefresh();
    onToast(lang === 'ur' ? 'ایس کیو لائٹ فائل ڈاؤن لوڈ ہو گئی۔' : 'SQLite .db file downloaded.');
  };

  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    onConfirmAction(
      lang === 'ur' ? 'بیک اپ ریسٹور کی تصدیق' : 'Confirm Backup Restore',
      lang === 'ur'
        ? `کیا آپ "${file.name}" سے ڈیٹا بیس بحال کرنا چاہتے ہیں؟ موجودہ ڈیٹا کا خودکار سنیپ شاٹ پہلے محفوظ کر لیا جائے گا۔`
        : `Restore database from "${file.name}"? An automatic safety snapshot of your current data will be saved first.`,
      async () => {
        await restoreFromBackupFile(file);
        await onRefresh();
        await refreshBackups();
        onToast(lang === 'ur' ? 'ڈیٹا بیس کامیابی سے ریسٹور ہو گیا۔' : 'Database restored successfully.');
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      {/* Mill Profile & Rates */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-2xl bg-white border border-emerald-100 p-5 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">{t(lang, 'millProfile')}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'millNameEn')}</label>
            <input
              type="text"
              value={millNameEn}
              onChange={(e) => setMillNameEn(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'millNameUr')}</label>
            <input
              type="text"
              dir="rtl"
              value={millNameUr}
              onChange={(e) => setMillNameUr(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'mobile')}</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'address')}</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>

        <h3 className="text-sm font-bold text-slate-900 pt-2">{t(lang, 'defaultRates')}</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {lang === 'ur' ? 'پسائی/من' : 'Grind/Mann'}
            </label>
            <input
              type="number"
              min="0"
              value={grindingRate}
              onChange={(e) => setGrindingRate(Number(e.target.value) || 0)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {lang === 'ur' ? 'آٹا/کلو' : 'Flour/KG'}
            </label>
            <input
              type="number"
              min="0"
              value={flourRate}
              onChange={(e) => setFlourRate(Number(e.target.value) || 0)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {lang === 'ur' ? 'چوکر/کلو' : 'Bran/KG'}
            </label>
            <input
              type="number"
              min="0"
              value={branRate}
              onChange={(e) => setBranRate(Number(e.target.value) || 0)}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full min-h-[46px] rounded-xl bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-800"
        >
          <Save className="w-4 h-4" />
          <span>{t(lang, 'save')}</span>
        </button>
      </form>

      {/* Security PIN + Manual Stock Adjustment */}
      <div className="space-y-5">
        <form
          onSubmit={handlePinChange}
          className="rounded-2xl bg-white border border-emerald-100 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-700" />
              <span>{t(lang, 'securityPin')}</span>
            </h2>
            <button
              type="button"
              onClick={onLockNow}
              className="min-h-[38px] px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold"
            >
              {t(lang, 'lockApp')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'currentPin')}</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{t(lang, 'newPin')}</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-mono-num"
              />
            </div>
          </div>

          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800"
          >
            {t(lang, 'changePin')}
          </button>
        </form>

        {/* Manual / Opening Stock Adjustment */}
        <div className="rounded-2xl bg-white border border-emerald-100 p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">{t(lang, 'stockAdjust')}</h2>
          <div className="divide-y divide-slate-100">
            {stock.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {lang === 'ur' ? item.nameUr : item.nameEn}
                  </p>
                  <p className="text-xs text-slate-500 font-mono-num">{formatWeight(item.qtyKg, lang)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={stockDrafts[item.id] ?? ''}
                    onChange={(e) =>
                      setStockDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    className="w-24 min-h-[40px] rounded-xl border border-slate-300 px-2.5 text-sm font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const val = Number(stockDrafts[item.id]);
                      if (isNaN(val) || val < 0) return;
                      await adjustStockItem(item.id, val);
                      await onRefresh();
                      onToast(lang === 'ur' ? 'اسٹاک اپڈیٹ ہو گیا۔' : 'Stock adjusted.');
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-100"
                  >
                    {t(lang, 'update')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SQLite Backup, Restore & Data Management */}
      <div className="lg:col-span-2 rounded-2xl bg-white border border-emerald-100 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-700" />
              <span>{t(lang, 'backupRestore')}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>
                {lang === 'ur'
                  ? 'ڈیٹا بیس آپ کے ڈیوائس میں آف لائن SQLite میں محفوظ رہتا ہے۔'
                  : 'All records are stored locally on your device in an offline SQLite database.'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-800"
            >
              <Download className="w-4 h-4" />
              <span>{t(lang, 'downloadBackupJson')}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadSqlite}
              className="min-h-[44px] px-4 rounded-xl border border-emerald-700 text-emerald-800 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-50"
            >
              <Download className="w-4 h-4" />
              <span>{t(lang, 'downloadSqliteFile')}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50"
            >
              <Upload className="w-4 h-4" />
              <span>{t(lang, 'restoreBackup')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.db,.sqlite"
              onChange={handleFileRestore}
              className="hidden"
            />
          </div>
        </div>

        {/* Automatic Restore Points */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">{t(lang, 'autoBackups')}</h3>
            <button
              type="button"
              onClick={async () => {
                await createAutoBackupSnapshot(
                  lang === 'ur' ? 'دستی سنیپ شاٹ' : 'Manual Snapshot'
                );
                await refreshBackups();
                onToast(lang === 'ur' ? 'بیک اپ سنیپ شاٹ بن گیا۔' : 'Local snapshot created.');
              }}
              className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'ابھی سنیپ شاٹ بنائیں' : 'Create Snapshot Now'}</span>
            </button>
          </div>

          {autoBackups.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">
              {lang === 'ur' ? 'کوئی خودکار سنیپ شاٹ موجود نہیں۔' : 'No local snapshots yet.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4">
              {autoBackups.map((bk) => (
                <div key={bk.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{bk.reason}</p>
                    <p className="text-slate-500 font-mono-num">
                      {new Date(bk.createdAt).toLocaleString()} · {(bk.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onConfirmAction(
                        lang === 'ur' ? 'ریسٹور کی تصدیق' : 'Confirm Restore',
                        lang === 'ur'
                          ? 'کیا آپ اس بیک اپ پوائنٹ پر واپس جانا چاہتے ہیں؟'
                          : 'Restore database to this snapshot?',
                        async () => {
                          await restoreFromAutoSnapshot(bk.dataBase64, bk.reason);
                          await onRefresh();
                          await refreshBackups();
                          onToast(lang === 'ur' ? 'ریسٹور مکمل ہو گیا۔' : 'Snapshot restored.');
                        }
                      )
                    }
                    className="min-h-[36px] px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold flex items-center gap-1 hover:bg-emerald-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t(lang, 'restoreNow')}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Demo Data & Reset */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              onConfirmAction(
                t(lang, 'loadDemoData'),
                lang === 'ur'
                  ? 'یہ موجودہ ڈیٹا کو صاف کر کے پاکستانی آٹا چکی کا نمونہ ڈیٹا لوڈ کرے گا۔'
                  : 'This replaces current data with sample Pakistani flour mill records for testing.',
                async () => {
                  await loadDemoMillData();
                  await onRefresh();
                  await refreshBackups();
                  onToast(lang === 'ur' ? 'نمونہ ڈیٹا لوڈ ہو گیا۔' : 'Sample mill data loaded.');
                }
              )
            }
            className="min-h-[44px] px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100"
          >
            {t(lang, 'loadDemoData')}
          </button>

          <button
            type="button"
            onClick={() =>
              onConfirmAction(
                t(lang, 'resetAllData'),
                lang === 'ur'
                  ? 'تمام لین دین، گاہک اور اسٹاک صفر ہو جائیں گے (پہلے خودکار بیک اپ محفوظ ہو جائے گا)۔'
                  : 'All transactions, customers, and stock will be cleared (an automatic backup is saved first).',
                async () => {
                  await resetAllMillData();
                  await onRefresh();
                  await refreshBackups();
                  onToast(lang === 'ur' ? 'تمام ڈیٹا صاف کر دیا گیا۔' : 'Database reset to clean state.');
                }
              )
            }
            className="min-h-[44px] px-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold flex items-center gap-1.5 hover:bg-red-100"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t(lang, 'resetAllData')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
