export type RateType = 'fixed' | 'range';
export type HoursOption = '40' | '50' | '40-50';

export const DEFAULT_PHP_RATE = 56;

export interface JobPay {
  rate_type?: string | null;
  rate_min?: number | null;
  rate_max?: number | null;
  hours_option?: string | null;
}

const fmtUsd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Hours option -> [min, max] weekly hours. */
export function hoursRange(option: string | null | undefined): [number, number] | null {
  if (option === '40') return [40, 40];
  if (option === '50') return [50, 50];
  if (option === '40-50') return [40, 50];
  return null;
}

export function formatHours(option: string | null | undefined): string | null {
  const r = hoursRange(option);
  if (!r) return null;
  return r[0] === r[1] ? `${r[0]} hrs/week` : `${r[0]}–${r[1]} hrs/week`;
}

function bounds(pay: JobPay): [number, number] | null {
  const min = pay.rate_min == null ? null : Number(pay.rate_min);
  if (min == null || !Number.isFinite(min)) return null;
  if (pay.rate_type !== 'range') return [min, min];
  const max = pay.rate_max == null ? min : Number(pay.rate_max);
  return [min, Number.isFinite(max) ? max : min];
}

/** "$5/hour" or "$4–$6/hour". */
export function formatUsdRate(pay: JobPay): string | null {
  const b = bounds(pay);
  if (!b) return null;
  return b[0] === b[1] ? `${fmtUsd(b[0])}/hour` : `${fmtUsd(b[0])}–${fmtUsd(b[1])}/hour`;
}

const round100 = (n: number) => Math.round(n / 100) * 100;

/** Monthly PHP estimate; only meaningful for Philippines jobs. */
export function computePhpMonthly(pay: JobPay, phpPerUsd: number): { min: number; max: number } | null {
  const b = bounds(pay);
  const h = hoursRange(pay.hours_option);
  if (!b || !h || !(phpPerUsd > 0)) return null;
  return { min: round100(b[0] * phpPerUsd * h[0] * 4), max: round100(b[1] * phpPerUsd * h[1] * 4) };
}

export function formatPhpMonthly(pay: JobPay, phpPerUsd: number): string | null {
  const m = computePhpMonthly(pay, phpPerUsd);
  if (!m) return null;
  const f = (n: number) => `₱${n.toLocaleString('en-US')}`;
  return m.min === m.max ? `${f(m.min)}/month` : `${f(m.min)}–${f(m.max)}/month`;
}

export const usesPhpConversion = (region: string | null | undefined) =>
  (region ?? '').toLowerCase() === 'philippines';
