// Shared job-rate helpers.
//
// Jobs are always stored in USD hourly terms in the database. The Philippines
// tab of the public site converts them to a PHP monthly range for display only
// (fixed conversion constants below). Nothing ever persists the PHP string.

export const USD_TO_PHP_RATE = 56;
export const WEEKS_PER_MONTH = 4;
export const MIN_HOURS_PER_WEEK = 40;
export const MAX_HOURS_PER_WEEK = 50;

/** Parse a USD hourly rate string like "$5.50 - $7.50/hr (40hrs/week)" or "$6".
 * Returns the lower bound of the range, or null when the rate is not USD hourly. */
export const parseUsdHourlyRate = (rate: string): number | null => {
  if (rate.startsWith('₱')) return null;

  const match = rate.match(/\$?([\d,]+(?:\.\d{1,2})?)\s*\/?\s*(hour|hr)?/i);
  if (!match) return null;

  const amount = parseFloat(match[1].replace(/,/g, ''));
  const period = match[2]?.toLowerCase() || '';

  // Only accept hourly rates
  if (period && period !== 'hour' && period !== 'hr') return null;

  return amount;
};

/** PHP monthly range derived from a USD hourly rate (40–50 hrs/week). */
export const calculatePhpMonthlyRange = (usdHourlyRate: number): { min: number; max: number } => {
  const minMonthly = Math.round(usdHourlyRate * USD_TO_PHP_RATE * MIN_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const maxMonthly = Math.round(usdHourlyRate * USD_TO_PHP_RATE * MAX_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  return { min: minMonthly, max: maxMonthly };
};

export const formatPhpMonthlyRange = (min: number, max: number): string => {
  const formattedMin = min.toLocaleString('en-PH');
  const formattedMax = max.toLocaleString('en-PH');
  return `₱${formattedMin} - ₱${formattedMax}/month`;
};

/** Display helper: renders a USD hourly rate as a PHP monthly range.
 * Returns the input unchanged when it is already PHP or not a parseable hourly rate. */
export const convertToPhpMonthlyRange = (rate: string): string => {
  const hourlyRate = parseUsdHourlyRate(rate);
  if (hourlyRate == null) return rate;

  const { min, max } = calculatePhpMonthlyRange(hourlyRate);
  return formatPhpMonthlyRange(min, max);
};

const formatUsdHourly = (min: number, max: number): string => {
  const fmt = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return `$${rounded.toFixed(2).replace(/\.00$/, '')}`;
  };
  return min === max ? `${fmt(min)}/hr` : `${fmt(min)} - ${fmt(max)}/hr`;
};

/** Reverse conversion: turn a legacy stored PHP monthly rate back into its
 * USD hourly equivalent using the same fixed constants (min ÷ 8960, max ÷ 11200).
 * Returns null when the rate is not a PHP monthly range. */
export const phpMonthlyToUsdHourly = (rate: string): string | null => {
  if (!rate.startsWith('₱')) return null;

  const match = rate.match(/₱\s*([\d,]+(?:\.\d{1,2})?)\s*-\s*₱\s*([\d,]+(?:\.\d{1,2})?)\s*\/\s*month/i);
  if (!match) return null;

  const minMonthly = parseFloat(match[1].replace(/,/g, ''));
  const maxMonthly = parseFloat(match[2].replace(/,/g, ''));

  const minHourly = minMonthly / (USD_TO_PHP_RATE * MIN_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const maxHourly = maxMonthly / (USD_TO_PHP_RATE * MAX_HOURS_PER_WEEK * WEEKS_PER_MONTH);

  return formatUsdHourly(minHourly, Math.max(maxHourly, minHourly));
};

/** Pick the rate string to show for a given public region.
 * - Philippines: USD hourly converted to a PHP monthly range.
 * - Global / Latin America / others: always USD — legacy PHP rates are
 *   reverse-converted back to the USD hourly figure. */
export const displayRateForRegion = (rate: string, region: string | null | undefined): string => {
  if (!rate) return rate;

  if (region === 'philippines') {
    return convertToPhpMonthlyRange(rate);
  }

  // Global (and Latin America, which already stores USD) keep the $ hourly rate.
  return phpMonthlyToUsdHourly(rate) ?? rate;
};
