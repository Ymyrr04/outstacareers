// Team Activity Calendar helpers — all times are Eastern Time (America/New_York)
export const ET_TZ = 'America/New_York';
export const ET_LABEL = 'ET (Eastern Time)';

export const ADMIN_PALETTE = [
  { name: 'Purple', main: '#534AB7', bg: '#EEEDFE', text: '#3C3489' },
  { name: 'Teal', main: '#0F6E56', bg: '#E1F5EE', text: '#085041' },
  { name: 'Coral', main: '#993C1D', bg: '#FAECE7', text: '#712B13' },
  { name: 'Blue', main: '#185FA5', bg: '#E6F1FB', text: '#0C447C' },
  { name: 'Amber', main: '#B45309', bg: '#FFFBEB', text: '#92400E' },
  { name: 'Pink', main: '#9D174D', bg: '#FDF2F8', text: '#831843' },
  { name: 'Lime', main: '#3F6212', bg: '#F7FEE7', text: '#365314' },
  { name: 'Indigo', main: '#3730A3', bg: '#EEF2FF', text: '#312E81' },
  { name: 'Cyan', main: '#0E7490', bg: '#ECFEFF', text: '#164E63' },
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

export const eventTypeLabel = (t: string) =>
  EVENT_TYPES.find((e) => e.value === t)?.label ?? t;

export const DAY_START_MIN = 8 * 60; // 8:00 AM ET
export const DAY_END_MIN = 20 * 60; // 8:00 PM ET
export const SLOT_HEIGHT = 28; // px per 30 minutes
export const PX_PER_MIN = SLOT_HEIGHT / 30;
