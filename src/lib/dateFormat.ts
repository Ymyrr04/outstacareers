/**
 * Unified date/time formatting for the whole ATS.
 *
 * Rules:
 *  - Every timestamp renders in Eastern Time (America/New_York) so all admins,
 *    wherever they are, see the same clock time.
 *  - Date-only values ("YYYY-MM-DD") never shift a calendar day.
 *  - Formats: "Sep 14, 2026" and "Sep 14, 2026 3:05 PM ET".
 */
import { parseDateOnly } from "./dateOnly";

export const ET_TIMEZONE = "America/New_York";

const isDateOnly = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const toDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : isDateOnly(value) ? parseDateOnly(value) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

type Input = string | number | Date | null | undefined;

/** "Sep 14, 2026" — never shifts a calendar day. */
export const formatDate = (value: Input, fallback = "—"): string => {
  const d = toDate(value);
  if (!d) return fallback;
  // Date-only values are calendar days, not moments — don't re-zone them.
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (!isDateOnly(value)) opts.timeZone = ET_TIMEZONE;
  return d.toLocaleDateString("en-US", opts);
};

/** "Sep 14" — short form without the year. */
export const formatDateShort = (value: Input, fallback = "—"): string => {
  const d = toDate(value);
  if (!d) return fallback;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (!isDateOnly(value)) opts.timeZone = ET_TIMEZONE;
  return d.toLocaleDateString("en-US", opts);
};

/** "Mon, Sep 14, 2026" */
export const formatDateWithWeekday = (value: Input, fallback = "—"): string => {
  const d = toDate(value);
  if (!d) return fallback;
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  if (!isDateOnly(value)) opts.timeZone = ET_TIMEZONE;
  return d.toLocaleDateString("en-US", opts);
};

/** "3:05 PM ET" */
export const formatTime = (value: Input, fallback = "—"): string => {
  const d = toDate(value);
  if (!d) return fallback;
  return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ET_TIMEZONE })} ET`;
};

/** "Sep 14, 2026 3:05 PM ET" */
export const formatDateTime = (value: Input, fallback = "—"): string => {
  const d = toDate(value);
  if (!d) return fallback;
  if (isDateOnly(value)) return formatDate(value, fallback);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: ET_TIMEZONE });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ET_TIMEZONE });
  return `${date} ${time} ET`;
};

/** Same as formatDateTime but for CSV exports (no fallback dash). */
export const formatDateTimeCsv = (value: Input): string => formatDateTime(value, "");
export const formatDateCsv = (value: Input): string => formatDate(value, "");
