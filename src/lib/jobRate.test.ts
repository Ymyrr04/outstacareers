import { describe, it } from 'node:test';
import assert from 'node:assert';
const expect = (v: unknown) => ({ toBe: (e: unknown) => assert.strictEqual(v, e), toEqual: (e: unknown) => assert.deepStrictEqual(v, e) });
import { displayJobRate, buildJobPay, formatUsdRate, formatHours, computePhpMonthly, formatPhpMonthly, usesPhpConversion } from './jobRate';

describe('jobRate', () => {
  it('formats fixed and range USD rates', () => {
    expect(formatUsdRate({ rate_type: 'fixed', rate_min: 5 })).toBe('$5/hour');
    expect(formatUsdRate({ rate_type: 'range', rate_min: 4, rate_max: 6 })).toBe('$4–$6/hour');
  });
  it('formats hours options', () => {
    expect(formatHours('40')).toBe('40 hrs/week');
    expect(formatHours('50')).toBe('50 hrs/week');
    expect(formatHours('40-50')).toBe('40–50 hrs/week');
  });
  it('computes PHP monthly with hours min/max', () => {
    expect(computePhpMonthly({ rate_type: 'fixed', rate_min: 5, hours_option: '40-50' }, 56)).toEqual({ min: 44800, max: 56000 });
    expect(computePhpMonthly({ rate_type: 'range', rate_min: 4, rate_max: 6, hours_option: '40-50' }, 56)).toEqual({ min: 35800, max: 67200 });
  });
  it('rounds to nearest 100 and shows one figure when equal', () => {
    expect(formatPhpMonthly({ rate_type: 'fixed', rate_min: 5, hours_option: '40' }, 57.37)).toBe('₱45,900/month');
  });
  it('only converts for philippines', () => {
    expect(usesPhpConversion('philippines')).toBe(true);
    expect(usesPhpConversion('latam')).toBe(false);
  });
});

describe('buildJobPay', () => {
  const v = (o: Partial<import('./jobRate').RateFormValue>) => ({ rateType: 'fixed' as const, min: '', max: '', hoursOption: '40-50' as const, ...o });
  it('fixed sets max = min and USD text outside PH', () => {
    const r = buildJobPay(v({ min: '5' }), 'global', 56);
    expect(r.ok && r.value).toEqual({ rate_type: 'fixed', hours_option: '40-50', rate_min: 5, rate_max: 5, rate: '$5/hour' });
  });
  it('PH saves peso monthly text', () => {
    const r = buildJobPay(v({ min: '5' }), 'philippines', 56);
    expect(r.ok && r.value.rate).toBe('₱44,800 - ₱56,000/month');
  });
  it('rejects max below min and 3 decimals', () => {
    expect(buildJobPay(v({ rateType: 'range', min: '6', max: '4' }), 'global', 56).ok).toBe(false);
    expect(buildJobPay(v({ min: '5.123' }), 'global', 56).ok).toBe(false);
  });
  it('blank keeps legacy text', () => {
    const r = buildJobPay(v({}), 'global', 56, '$7/hr');
    expect(r.ok && r.value.rate).toBe('$7/hr');
    expect(r.ok && r.value.rate_min).toBe(null);
  });
});

describe('displayJobRate', () => {
  it('structured: USD when not peso, live peso with hours when peso', () => {
    const j = { rate_type: 'range', rate_min: 4, rate_max: 6, hours_option: '40', rate: 'x' };
    expect(displayJobRate(j, false, 64)).toBe('$4–$6/hour');
    expect(displayJobRate(j, true, 64)).toBe('₱41,000 - ₱61,400/month');
  });
  it('legacy: text unchanged, USD converts with 40–50 hours', () => {
    expect(displayJobRate({ rate: '$5/hour' }, false, 64)).toBe('$5/hour');
    expect(displayJobRate({ rate: '$5/hour' }, true, 56)).toBe('₱44,800 - ₱56,000/month');
    expect(displayJobRate({ rate: '₱30,000/month' }, true, 64)).toBe('₱30,000/month');
  });
});
