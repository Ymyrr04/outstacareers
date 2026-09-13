/**
 * Timesheet edit-window rules.
 *
 * A submitted timesheet stays editable by the contractor until 12:00 PM Eastern
 * Time on the Sunday following its week-ending date. After that it is locked
 * unless an admin/client flags it for revision.
 */
import { ET_TIMEZONE } from "./dateFormat";

type EtParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const etParts = (d: Date): EtParts => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: Math.max(0, WEEKDAYS.indexOf(parts.weekday)),
  };
};

/** Offset (in minutes) that ET is behind UTC at the given instant. */
const etOffsetMinutes = (d: Date): number => {
  const p = etParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return Math.round((asUtc - d.getTime()) / 60000);
};

/** Instant for a given ET calendar date at 12:00 PM ET (noon). */
const etNoon = (year: number, month: number, day: number): Date => {
  const guess = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const adjusted = new Date(guess.getTime() - etOffsetMinutes(guess) * 60000);
  // Re-check once in case the guess landed on the other side of a DST change.
  return new Date(guess.getTime() - etOffsetMinutes(adjusted) * 60000);
};

/**
 * First Sunday 12:00 PM ET strictly after the given instant.
 */
export const nextSundayNoonEt = (after: Date): Date => {
  for (let i = 0; i <= 8; i++) {
    const candidateDay = new Date(after.getTime() + i * 86400000);
    const p = etParts(candidateDay);
    if (p.weekday !== 0) continue;
    const lock = etNoon(p.year, p.month, p.day);
    if (lock.getTime() > after.getTime()) return lock;
  }
  return new Date(after.getTime() + 7 * 86400000);
};

/**
 * When a timesheet for the given week-ending date locks: 12:00 PM ET on the
 * Sunday that follows the end of that week (never before it was submitted).
 */
export const timesheetLockAt = (weekEndingDate: string, submittedAt?: string | null): Date => {
  // End of the week-ending calendar day, in ET.
  const baseDay = new Date(`${weekEndingDate}T12:00:00Z`);
  const p = etParts(baseDay);
  const endOfWeekDay = new Date(etNoon(p.year, p.month, p.day).getTime() - 12 * 3600000); // ~midnight ET on week-ending day
  const submitted = submittedAt ? new Date(submittedAt) : null;
  const base = submitted && submitted.getTime() > endOfWeekDay.getTime() ? submitted : endOfWeekDay;
  return nextSundayNoonEt(base);
};

/** True while the contractor can still edit their submitted timesheet. */
export const isTimesheetEditWindowOpen = (weekEndingDate: string, submittedAt?: string | null): boolean =>
  Date.now() < timesheetLockAt(weekEndingDate, submittedAt).getTime();
