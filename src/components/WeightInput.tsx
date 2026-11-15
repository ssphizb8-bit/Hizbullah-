import React from 'react';
import { Language } from '../types';
import {
  MANN_KG,
  kgToMannDecimal,
  kgToMannRemainder,
  mannAndKgToTotalKg,
  round2,
} from '../utils/format';

interface WeightInputProps {
  label: string;
  valueKg: number;
  onChangeKg: (kg: number) => void;
  lang: Language;
  required?: boolean;
  helperText?: string;
}

export const WeightInput: React.FC<WeightInputProps> = ({
  label,
  valueKg,
  onChangeKg,
  lang,
  required,
  helperText,
}) => {
  const { mann, kgRem } = kgToMannRemainder(valueKg);

  const handleMannChange = (raw: string) => {
    const m = Math.max(0, Number(raw) || 0);
    onChangeKg(mannAndKgToTotalKg(m, kgRem));
  };

  const handleRemKgChange = (raw: string) => {
    const k = Math.max(0, Number(raw) || 0);
    onChangeKg(mannAndKgToTotalKg(mann, k));
  };

  const handleTotalKgChange = (raw: string) => {
    const total = Math.max(0, Number(raw) || 0);
    onChangeKg(round2(total));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        <span className="text-[11px] font-mono-num text-emerald-800">
          {kgToMannDecimal(valueKg)} {lang === 'ur' ? 'من' : 'Mann'} (1 {lang === 'ur' ? 'من' : 'Mann'} = {MANN_KG} {lang === 'ur' ? 'کلو' : 'KG'})
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="1"
              value={mann || ''}
              placeholder="0"
              onChange={(e) => handleMannChange(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono-num text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
            <span className="block text-[10px] text-slate-500 mt-0.5 px-1">
              {lang === 'ur' ? 'من (40 کلو)' : 'Mann (40kg)'}
            </span>
          </div>
        </div>

        <div>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.5"
              value={kgRem || ''}
              placeholder="0"
              onChange={(e) => handleRemKgChange(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono-num text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
            <span className="block text-[10px] text-slate-500 mt-0.5 px-1">
              {lang === 'ur' ? 'اضافی کلو' : 'Extra KG'}
            </span>
          </div>
        </div>

        <div>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.5"
              value={valueKg || ''}
              placeholder="0"
              onChange={(e) => handleTotalKgChange(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-sm font-bold font-mono-num text-emerald-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
            <span className="block text-[10px] font-semibold text-emerald-800 mt-0.5 px-1">
              {lang === 'ur' ? 'کل کلوگرام' : 'Total KG'}
            </span>
          </div>
        </div>
      </div>

      {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
};
