import { describe, it } from 'node:test';
import assert from 'node:assert';
const expect = (v: unknown) => ({ toBe: (e: unknown) => assert.strictEqual(v, e), toEqual: (e: unknown) => assert.deepStrictEqual(v, e) });
import { formatUsdRate, formatHours, computePhpMonthly, formatPhpMonthly, usesPhpConversion } from './jobRate';

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
