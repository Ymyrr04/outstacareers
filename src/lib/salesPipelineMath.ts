// Constants for sales pipeline value calculations.
// Adjust these here to change the formula across the app.
export const MARGIN_PER_HIRE = 3; // dollars per hour
export const HOURS_PER_WEEK = 50;
export const WEEKS_PER_YEAR = 52;

export const estDealValue = (hires: number | null | undefined): number => {
  const h = Math.max(0, Math.floor(Number(hires) || 0));
  return h * MARGIN_PER_HIRE * HOURS_PER_WEEK * WEEKS_PER_YEAR;
};

export const pipelineValue = (
  hires: number | null | undefined,
  likelihood: number | null | undefined,
): number => {
  const pct = Math.min(100, Math.max(0, Number(likelihood) || 0));
  return Math.round(estDealValue(hires) * (pct / 100));
};

export const formatCurrency = (n: number): string =>
  `$${Math.round(n).toLocaleString('en-US')}`;
