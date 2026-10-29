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

export interface RateFormValue {
  rateType: RateType;
  min: string;
  max: string;
  hoursOption: HoursOption;
}

export const DEFAULT_RATE_FORM: RateFormValue = { rateType: 'fixed', min: '', max: '', hoursOption: '40-50' };

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** Form value from a stored job; old jobs without rate_min start with blank boxes. */
export function rateFormFromJob(job: JobPay): RateFormValue {
  const type: RateType = job.rate_type === 'range' ? 'range' : 'fixed';
  const hours = (['40', '50', '40-50'] as const).find((h) => h === job.hours_option) ?? '40-50';
  return {
    rateType: type,
    min: job.rate_min == null ? '' : String(Number(job.rate_min)),
    max: type === 'range' && job.rate_max != null ? String(Number(job.rate_max)) : '',
    hoursOption: hours,
  };
}

/** Saved PHP text, e.g. "₱44,800 - ₱56,000/month". */
export function phpRateText(pay: JobPay, phpPerUsd: number): string | null {
  const m = computePhpMonthly(pay, phpPerUsd);
  if (!m) return null;
  const f = (n: number) => `₱${n.toLocaleString('en-US')}`;
  return m.min === m.max ? `${f(m.min)}/month` : `${f(m.min)} - ${f(m.max)}/month`;
}

export type JobPaySave = {
  rate_type: RateType;
  rate_min: number | null;
  rate_max: number | null;
  hours_option: HoursOption;
  rate: string | null;
};

/** Validates form input and builds the job pay columns, including the display rate text. */
export function buildJobPay(
  v: RateFormValue,
  region: string | null | undefined,
  phpPerUsd: number,
  legacyRate: string | null = null,
): { ok: true; value: JobPaySave; error?: undefined } | { ok: false; error: string; value?: undefined } {
  const minS = v.min.trim();
  const maxS = v.rateType === 'range' ? v.max.trim() : '';
  const base = { rate_type: v.rateType, hours_option: v.hoursOption };
  if (!minS && !maxS) {
    return { ok: true, value: { ...base, rate_min: null, rate_max: null, rate: legacyRate || null } };
  }
  if (v.rateType === 'range' && (!minS || !maxS)) return { ok: false, error: 'Enter both a minimum and maximum rate.' };
  if (!AMOUNT_RE.test(minS) || (maxS && !AMOUNT_RE.test(maxS))) {
    return { ok: false, error: 'Rate must be a number with up to 2 decimals.' };
  }
  const min = Number(minS);
  const max = v.rateType === 'range' ? Number(maxS) : min;
  if (max < min) return { ok: false, error: 'Maximum rate must be at least the minimum.' };
  const pay: JobPay = { rate_type: v.rateType, rate_min: min, rate_max: max, hours_option: v.hoursOption };
  const rate = usesPhpConversion(region) ? phpRateText(pay, phpPerUsd) : formatUsdRate(pay);
  return { ok: true, value: { ...base, rate_min: min, rate_max: max, rate } };
}

/** Parses old free-text USD hourly rates like "$5/hour"; returns null for peso or non-hourly text. */
export function parseLegacyUsdHourly(rate: string): number | null {
  if (rate.trim().startsWith('₱')) return null;
  const match = rate.match(/\$?([\d,]+(?:\.\d{1,2})?)\s*\/?\s*(hour|hr)?/i);
  if (!match) return null;
  const period = match[2]?.toLowerCase() || '';
  if (period && period !== 'hour' && period !== 'hr') return null;
  const amount = parseFloat(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Public display rate. showPeso follows each page's own rule for when pesos are shown. */
export function displayJobRate(
  job: JobPay & { rate?: string | null },
  showPeso: boolean,
  phpPerUsd: number,
): string | null {
  if (job.rate_min != null) {
    if (!showPeso) return formatUsdRate(job);
    return phpRateText({ ...job, hours_option: job.hours_option ?? '40-50' }, phpPerUsd) ?? formatUsdRate(job);
  }
  if (!job.rate) return null;
  if (!showPeso) return job.rate;
  const usd = parseLegacyUsdHourly(job.rate);
  if (usd == null) return job.rate;
  return phpRateText({ rate_type: 'fixed', rate_min: usd, hours_option: '40-50' }, phpPerUsd) ?? job.rate;
}
