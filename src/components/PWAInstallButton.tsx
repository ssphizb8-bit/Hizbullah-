import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Language } from '../types';
import { t } from '../i18n/translations';

interface PWAInstallButtonProps {
  lang: Language;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang, compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center justify-center gap-2 rounded-xl bg-emerald-700 text-white font-semibold hover:bg-emerald-800 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 min-h-[44px] ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm w-full'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{t(lang, 'installApp')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm w-full'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>{t(lang, 'installApp')}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {lang === 'ur' ? 'فون پر انسٹال کریں' : 'Install on Phone'}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {lang === 'ur'
                  ? '1. براؤزر میں Share بٹن دبائیں۔ 2. Add to Home Screen منتخب کریں۔'
                  : '1. Tap the Share button in your browser toolbar. 2. Scroll down and tap Add to Home Screen.'}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
              >
                {t(lang, 'close')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
