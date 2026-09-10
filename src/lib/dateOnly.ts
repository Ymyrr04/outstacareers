/**
 * Parse a date-only value ("YYYY-MM-DD") without timezone shifting.
 *
 * `new Date("2026-09-14")` is parsed as UTC midnight, which renders as
 * Sep 13 for anyone west of UTC (Florida, El Salvador, etc.). Anchoring
 * date-only strings at local noon keeps the calendar day identical for
 * every viewer, regardless of their timezone.
 */
export const parseDateOnly = (value: string | Date | null | undefined): Date => {
  if (value instanceof Date) return value;
  if (!value) return new Date(NaN);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T12:00:00`);
  return new Date(str);
};

export default parseDateOnly;
