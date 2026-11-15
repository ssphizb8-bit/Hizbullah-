import { Language, RateUnit } from '../types';

export const MANN_KG = 40;

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function kgToMannDecimal(kg: number): number {
  return round2(kg / MANN_KG);
}

export function kgToMannRemainder(kg: number): { mann: number; kgRem: number } {
  const safeKg = Math.max(0, round2(kg));
  const mann = Math.floor(safeKg / MANN_KG);
  const kgRem = round2(safeKg - mann * MANN_KG);
  return { mann, kgRem };
}

export function mannAndKgToTotalKg(mann: number, kgRem: number): number {
  return round2(Math.max(0, mann) * MANN_KG + Math.max(0, kgRem));
}

export function computeAmountByRate(weightKg: number, rate: number, unit: RateUnit): number {
  if (weightKg <= 0 || rate <= 0) return 0;
  if (unit === 'mann') {
    return round2((weightKg / MANN_KG) * rate);
  }
  return round2(weightKg * rate);
}

export function formatPKR(amount: number, lang: Language = 'en'): string {
  const rounded = Math.round(amount * 100) / 100;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded);
  return lang === 'ur' ? `روپے ${formatted}` : `Rs ${formatted}`;
}

export function formatWeight(kg: number, lang: Language = 'en'): string {
  const safeKg = round2(kg);
  const { mann, kgRem } = kgToMannRemainder(safeKg);
  const kgStr = safeKg.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  if (lang === 'ur') {
    if (mann === 0) return `${kgStr} کلو`;
    if (kgRem === 0) return `${kgStr} کلو (${mann} من)`;
    return `${kgStr} کلو (${mann} من ${kgRem} کلو)`;
  }
  if (mann === 0) return `${kgStr} KG`;
  if (kgRem === 0) return `${kgStr} KG (${mann} Mann)`;
  return `${kgStr} KG (${mann}M ${kgRem}KG)`;
}

export function formatShortWeight(kg: number, lang: Language = 'en'): string {
  const safeKg = round2(kg);
  const mannDec = kgToMannDecimal(safeKg);
  const kgStr = safeKg.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return lang === 'ur'
    ? `${kgStr} کلو · ${mannDec} من`
    : `${kgStr} KG · ${mannDec} Mann`;
}

export function formatDateDisplay(isoDate: string, lang: Language = 'en'): string {
  if (!isoDate) return '';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function sha256(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback if SubtleCrypto is unavailable
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fb_${(h >>> 0).toString(16)}`;
}

export function isValidPakistaniPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (!cleaned) return true; // optional when empty
  return /^(\+92|0)?3[0-9]{9}$/.test(cleaned) || /^[0-9]{7,13}$/.test(cleaned);
}
