import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  parseUsdHourlyRate,
  calculatePhpMonthlyRange,
  formatPhpMonthlyRange,
  convertToPhpMonthlyRange,
  phpMonthlyToUsdHourly,
  displayRateForRegion,
} from './jobRates';

describe('parseUsdHourlyRate', () => {
  it('parses a simple USD hourly rate', () => {
    strictEqual(parseUsdHourlyRate('$5/hr'), 5);
    strictEqual(parseUsdHourlyRate('$6'), 6);
  });

  it('parses the lower bound of a range with extras', () => {
    strictEqual(parseUsdHourlyRate('$5.50 - $7.50/hr (40hrs/week)'), 5.5);
    strictEqual(parseUsdHourlyRate('$6.5/hr - $7/hr Depending on experience'), 6.5);
  });

  it('returns null for PHP rates', () => {
    strictEqual(parseUsdHourlyRate('₱44,800 - ₱56,000/month'), null);
  });
});

describe('convertToPhpMonthlyRange', () => {
  it('converts USD hourly to the PHP monthly range (40-50 hrs/week)', () => {
    strictEqual(convertToPhpMonthlyRange('$5/hr'), '₱44,800 - ₱56,000/month');
    strictEqual(convertToPhpMonthlyRange('$4.90/hr'), '₱43,904 - ₱54,880/month');
    strictEqual(convertToPhpMonthlyRange('$10/hr'), '₱89,600 - ₱112,000/month');
  });

  it('leaves PHP or unparseable rates unchanged', () => {
    strictEqual(convertToPhpMonthlyRange('₱44,800 - ₱56,000/month'), '₱44,800 - ₱56,000/month');
    strictEqual(convertToPhpMonthlyRange('Negotiable'), 'Negotiable');
  });
});

describe('phpMonthlyToUsdHourly', () => {
  it('reverse-converts a legacy PHP monthly rate to USD hourly', () => {
    strictEqual(phpMonthlyToUsdHourly('₱44,800 - ₱56,000/month'), '$5/hr');
    strictEqual(phpMonthlyToUsdHourly('₱43,904 - ₱54,880/month'), '$4.90/hr');
    strictEqual(phpMonthlyToUsdHourly('₱89,600 - ₱112,000/month'), '$10/hr');
  });

  it('returns null for non-PHP rates', () => {
    strictEqual(phpMonthlyToUsdHourly('$5/hr'), null);
  });
});

describe('round trip', () => {
  it('PHP display converts back to the original USD hourly rate', () => {
    for (const rate of ['$5/hr', '$4.90/hr', '$5.50/hr', '$6.80/hr', '$10/hr']) {
      strictEqual(phpMonthlyToUsdHourly(convertToPhpMonthlyRange(rate)), rate);
    }
  });
});

describe('displayRateForRegion', () => {
  it('Global keeps the $ hourly rate', () => {
    strictEqual(displayRateForRegion('$5.50 - $7.50/hr (40hrs/week)', 'global'), '$5.50 - $7.50/hr (40hrs/week)');
  });

  it('Global reverse-converts legacy PHP rates to $ hourly', () => {
    strictEqual(displayRateForRegion('₱44,800 - ₱56,000/month', 'global'), '$5/hr');
  });

  it('Philippines shows the PHP monthly range', () => {
    strictEqual(displayRateForRegion('$5/hr', 'philippines'), '₱44,800 - ₱56,000/month');
    // Legacy stored PHP stays PHP
    strictEqual(displayRateForRegion('₱44,800 - ₱56,000/month', 'philippines'), '₱44,800 - ₱56,000/month');
  });

  it('Latin America keeps the $ hourly rate', () => {
    strictEqual(displayRateForRegion('$6 - $8 /Hourly', 'latin-america'), '$6 - $8 /Hourly');
  });

  it('unparseable rates pass through untouched', () => {
    strictEqual(displayRateForRegion('Negotiable', 'global'), 'Negotiable');
  });
});

describe('format helpers', () => {
  it('calculatePhpMonthlyRange uses the fixed constants', () => {
    strictEqual(calculatePhpMonthlyRange(5).min, 44800);
    strictEqual(calculatePhpMonthlyRange(5).max, 56000);
  });

  it('formatPhpMonthlyRange formats with peso signs', () => {
    strictEqual(formatPhpMonthlyRange(44800, 56000), '₱44,800 - ₱56,000/month');
  });
});
