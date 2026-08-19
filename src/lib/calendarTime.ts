// Team Activity Calendar helpers — all times are Eastern Time (America/New_York)
export const ET_TZ = 'America/New_York';
export const ET_LABEL = 'ET (Eastern Time)';

export const ADMIN_PALETTE = [
  { name: 'Purple', main: '#3F35B0', bg: '#DAD6F7', text: '#2A2178' },
  { name: 'Teal', main: '#0A5642', bg: '#C5E9D9', text: '#05392B' },
  { name: 'Coral', main: '#7A2E15', bg: '#F2D2C8', text: '#521E0C' },
  { name: 'Blue', main: '#0F4A8C', bg: '#C5DCF2', text: '#0A3464' },
  { name: 'Amber', main: '#8F4009', bg: '#FFE6B8', text: '#6B2E05' },
  { name: 'Pink', main: '#7A0E3C', bg: '#F5C9DD', text: '#56082A' },
  { name: 'Lime', main: '#2F4A0C', bg: '#DDEFB0', text: '#1F3308' },
  { name: 'Indigo', main: '#2A2480', bg: '#D2DAF5', text: '#1C1860' },
  { name: 'Cyan', main: '#0A5A70', bg: '#BFEAF2', text: '#064150' },
] as const;

export const GRAY_COLOR = { name: 'Gray', main: '#6B7280', bg: '#F3F4F6', text: '#374151' };

export const colorForIndex = (index: number) =>
  index >= 0 && index < ADMIN_PALETTE.length ? ADMIN_PALETTE[index] : GRAY_COLOR;

/** Parse a plain YYYY-MM-DD date string safely (no timezone shifting). */
export const parseDateString = (d: string) => new Date(`${d}T12:00:00`);

/** Format a Date object as YYYY-MM-DD using its local calendar fields. */
export const toDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Today's date (YYYY-MM-DD) in Eastern Time. */
export const todayET = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts; // en-CA gives YYYY-MM-DD
};

/** Current minutes since midnight in Eastern Time. */
export const nowMinutesET = () => {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const [h, m] = s.split(':').map(Number);
  return (h % 24) * 60 + m;
};

/** Format minutes since midnight ET as 12-hour ET time label. */
export const formatMinutes = (mins: number) => {
  const base = new Date(Date.UTC(2020, 0, 1, Math.floor(mins / 60), mins % 60));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(base);
};

/** "09:00" <-> minutes */
export const minutesToInput = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export const inputToMinutes = (val: string) => {
  const [h, m] = val.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const formatDateLong = (dateStr: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parseDateString(dateStr));

export const weekdayOf = (dateStr: string) => parseDateString(dateStr).getDay();

export const addDays = (dateStr: string, days: number) => {
  const d = parseDateString(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
};

export const EVENT_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'interview', label: 'Interview' },
  { value: 'followup', label: 'Follow-up' },
] as const;

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

export const recurrenceLabel = (r?: string | null) =>
  RECURRENCE_OPTIONS.find((o) => o.value === r)?.label ?? 'Weekly';

/** Whole days between two YYYY-MM-DD strings. */
export const daysBetween = (a: string, b: string) =>
  Math.round((parseDateString(b).getTime() - parseDateString(a).getTime()) / 86400000);

export const dayOfMonth = (dateStr: string) => parseDateString(dateStr).getDate();

export const eventTypeLabel = (t: string) =>
  EVENT_TYPES.find((e) => e.value === t)?.label ??
  t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const DAY_START_MIN = 0; // 12:00 AM ET
export const DAY_END_MIN = 24 * 60; // 11:59 PM ET (24-hour span)
export const SLOT_HEIGHT = 28; // px per 30 minutes
export const PX_PER_MIN = SLOT_HEIGHT / 30;

/** Deterministic palette color for a user id (fallback when admin list lacks the creator). */
export const colorForUserId = (userId?: string | null) => {
  if (!userId) return GRAY_COLOR;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return ADMIN_PALETTE[h % ADMIN_PALETTE.length];
};
