import React, { useState } from 'react';
import { Delete, Globe, Lock, Wheat } from 'lucide-react';
import { Language } from '../types';
import { t } from '../i18n/translations';
import { verifyPin } from '../db/millService';

interface PinLockScreenProps {
  lang: Language;
  millNameEn: string;
  millNameUr: string;
  onToggleLang: () => void;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  lang,
  millNameEn,
  millNameUr,
  onToggleLang,
  onUnlock,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleDigit = async (digit: string) => {
    if (checking || pin.length >= 4) return;
    setError('');
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      setChecking(true);
      try {
        const ok = await verifyPin(next);
        if (ok) {
          onUnlock();
        } else {
          setError(t(lang, 'pinIncorrect'));
          setPin('');
        }
      } finally {
        setChecking(false);
      }
    }
  };

  const handleBackspace = () => {
    setError('');
    setPin((p) => p.slice(0, -1));
  };

  const handleClear = () => {
    setError('');
    setPin('');
  };

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#F4F7F4] flex flex-col items-center justify-between p-5"
    >
      {/* Top Language Toggle */}
      <div className="w-full max-w-md flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
          <Wheat className="w-5 h-5" />
          <span>{t(lang, 'appName')}</span>
        </div>
        <button
          type="button"
          onClick={onToggleLang}
          className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-emerald-200 bg-white text-emerald-800 text-xs font-semibold hover:bg-emerald-50 transition-colors"
        >
          <Globe className="w-4 h-4" />
          <span>{lang === 'ur' ? 'English' : 'اردو'}</span>
        </button>
      </div>

      {/* Main PIN Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl border border-emerald-100 shadow-sm p-6 my-auto">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 text-white flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {lang === 'ur' ? millNameUr : millNameEn}
          </h1>
          <p className="text-sm font-medium text-emerald-800 mt-1">{t(lang, 'pinTitle')}</p>
          <p className="text-xs text-slate-500 mt-1">{t(lang, 'pinSubtitle')}</p>

          {/* 4 PIN Indicators */}
          <div className="flex items-center justify-center gap-4 my-6" dir="ltr">
            {[0, 1, 2, 3].map((idx) => {
              const filled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    filled
                      ? 'bg-emerald-700 border-emerald-700 scale-110'
                      : 'bg-white border-slate-300'
                  }`}
                />
              );
            })}
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 mb-4 bg-red-50 border border-red-200 rounded-xl px-3 py-2 w-full">
              {error}
            </p>
          )}

          {/* Large Touch Numeric Keypad */}
          <div className="grid grid-cols-3 gap-3 w-full" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-14 rounded-2xl bg-[#F6F9F6] border border-emerald-100 text-xl font-bold font-mono-num text-slate-900 hover:bg-emerald-50 active:bg-emerald-700 active:text-white transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            >
              {t(lang, 'pinClear')}
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-14 rounded-2xl bg-[#F6F9F6] border border-emerald-100 text-xl font-bold font-mono-num text-slate-900 hover:bg-emerald-50 active:bg-emerald-700 active:text-white transition-colors"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              aria-label="Backspace"
              className="h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 text-center pb-2">{t(lang, 'pinDefaultHint')}</p>
    </div>
  );
};
