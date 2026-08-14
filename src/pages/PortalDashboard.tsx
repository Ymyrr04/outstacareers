import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogOut, Pencil, CalendarIcon, UserCircle2, Check, ChevronsUpDown, HelpCircle, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Lock, Info, Plus, X, Split } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DailyCheckin } from '@/components/portal/DailyCheckin';
import { LeaveApplication } from '@/components/portal/LeaveApplication';
import { TimesheetTutorialDialog } from '@/components/portal/TimesheetTutorialDialog';
import { addDays, format, startOfWeek } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// 12-hour time slots in 30-min increments: "12:00 AM" .. "11:30 PM"
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const period = h < 12 ? 'AM' : 'PM';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      out.push(`${hour12}:${m.toString().padStart(2, '0')} ${period}`);
    }
  }
  return out;
})();

// Parse "9 AM – 6 PM EST" or "9:00 AM – 6:00 PM EST" into start/end slot labels
const parseShift = (raw: string | null | undefined): { start: string; end: string } => {
  if (!raw) return { start: '', end: '' };
  const cleaned = raw.replace(/\s*EST\s*$/i, '').trim();
  const parts = cleaned.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return { start: '', end: '' };
  const norm = (s: string): string => {
    const m = s.trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
    if (!m) return '';
    const hh = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    if (hh < 1 || hh > 12 || (mm !== 0 && mm !== 30)) return '';
    return `${hh}:${mm.toString().padStart(2, '0')} ${m[3]}`;
  };
  return { start: norm(parts[0]), end: norm(parts[1]) };
};

const composeShift = (start: string, end: string): string =>
  start && end ? `${start} – ${end} EST` : '';

// Convert "9:00 AM" / "6:00 PM" -> "HH:MM" 24h, the format FlexibleTimeInput expects.
const to24h = (s: string): string => {
  if (!s) return '';
  const m = s.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const period = m[3];
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

function TimeCombobox({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time..." />
          <CommandList
            className="max-h-64 overflow-y-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <CommandEmpty>No time found.</CommandEmpty>
            <CommandGroup>
              {TIME_SLOTS.map((t) => (
                <CommandItem
                  key={t}
                  value={t}
                  onSelect={() => { onChange(t); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === t ? 'opacity-100' : 'opacity-0')} />
                  {t}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


interface ContractorInfo {
  contractor_assignment_id: string;
  applicant_id: string;
  job_title: string | null;
  company_name: string | null;
  full_name: string | null;
  hourly_rate: number | null;
  hours_per_week: number | null;
  regular_work_shift: string | null;
  contact_number: string | null;
  emergency_number: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  work_days: string[];
  sunday_hours_excluded: boolean;
  break_duration_minutes: number | null;
  break_is_paid: boolean | null;
  timezone: string | null;
  checkin_reminder_enabled: boolean;
  checkin_reminder_time: string | null;
}

interface ProfileForm {
  full_name: string;
  phone: string;
  whatsapp: string;
  location: string;
  country: string;
  contact_number: string;
  emergency_number: string;
  hours_per_week: string;
  hourly_rate: string;
  regular_work_shift: string;
  work_days: string[];
  break_duration: string;       // numeric, in the selected unit
  break_unit: 'minutes' | 'hours';
  break_is_paid: boolean;       // true = paid, false = unpaid
  break_enabled: boolean;       // true if contractor has configured a break at all
}

const WORK_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DOW_TO_SHORT: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
const DEFAULT_WORK_DAYS: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];


type Shift = {
  time_in: string;  // "HH:MM" 24h
  time_out: string; // "HH:MM" 24h
  note?: string;    // optional note for this shift
};
interface DayEntry {
  time_in: string;  // "HH:MM" 24h — first shift
  time_out: string; // "HH:MM" 24h — first shift
  shifts?: Shift[]; // additional shifts (2nd, 3rd, ... unlimited)
  hours: string;    // computed string e.g. "8.50" (sum of all shifts)
  reason: string;
}
interface Timesheet {
  id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  incentive_amount: number;
  notes: string | null;
  status: string;
  outsta_status?: string | null;
  submitted_at: string;
  daily_hours: Record<string, { hours: number; time_in?: string; time_out?: string; time_in_2?: string; time_out_2?: string; shifts?: Shift[]; reason?: string }> | null;
  client_approval_status?: string | null;
  client_flag_reason?: string | null;
  client_reviewed_at?: string | null;
}

// Compute raw decimal hours between two "HH:MM" times. If time_out <= time_in, treat as overnight (+24h).
const computeRawHours = (timeIn: string, timeOut: string): number => {
  if (!timeIn || !timeOut) return 0;
  const [ih, im] = timeIn.split(':').map(Number);
  const [oh, om] = timeOut.split(':').map(Number);
  if ([ih, im, oh, om].some((n) => isNaN(n))) return 0;
  let start = ih * 60 + im;
  let end = oh * 60 + om;
  if (end <= start) end += 24 * 60; // overnight shift
  return Math.round(((end - start) / 60) * 100) / 100;
};

// Apply unpaid-break deduction (if configured) to a raw hours value.
// Never goes below 0.
const applyBreakDeduction = (
  rawHours: number,
  breakMinutes: number | null | undefined,
  breakIsPaid: boolean | null | undefined
): number => {
  if (rawHours <= 0) return 0;
  if (breakIsPaid !== false) return rawHours; // paid or unconfigured = no deduction
  if (!breakMinutes || breakMinutes <= 0) return rawHours;
  const deducted = rawHours - breakMinutes / 60;
  return Math.max(0, Math.round(deducted * 100) / 100);
};

// Compute billable hours (after unpaid break deduction, if any).
const computeHours = (
  timeIn: string,
  timeOut: string,
  breakMinutes?: number | null,
  breakIsPaid?: boolean | null
): number => {
  const raw = computeRawHours(timeIn, timeOut);
  return applyBreakDeduction(raw, breakMinutes, breakIsPaid);
};

// Compute total billable day hours = shift 1 + every additional shift.
// Each shift gets the unpaid-break deduction applied independently when configured.
const computeDayBillable = (
  entry: Pick<DayEntry, 'time_in' | 'time_out' | 'shifts'>,
  breakMinutes?: number | null,
  breakIsPaid?: boolean | null
): number => {
  const h1 = computeHours(entry.time_in, entry.time_out, breakMinutes, breakIsPaid);
  const rest = (entry.shifts || []).reduce(
    (sum, s) => sum + (s.time_in && s.time_out ? computeHours(s.time_in, s.time_out, breakMinutes, breakIsPaid) : 0),
    0
  );
  return Math.round((h1 + rest) * 100) / 100;
};


// Convert stored break (always minutes) into the profile form's display unit.
const breakStateToForm = (
  minutes: number | null | undefined,
  isPaid: boolean | null | undefined
): { break_duration: string; break_unit: 'minutes' | 'hours'; break_is_paid: boolean; break_enabled: boolean } => {
  if (minutes == null || minutes <= 0) {
    return { break_duration: '', break_unit: 'minutes', break_is_paid: false, break_enabled: false };
  }
  // Prefer hours display when divisible
  if (minutes % 60 === 0) {
    return { break_duration: String(minutes / 60), break_unit: 'hours', break_is_paid: !!isPaid, break_enabled: true };
  }
  return { break_duration: String(minutes), break_unit: 'minutes', break_is_paid: !!isPaid, break_enabled: true };
};

const formatHoursLabel = (h: number) => (h > 0 ? h.toFixed(2) : '0.00');

// Parse a wide variety of user-typed time strings into "HH:MM" (24h). Returns '' if not parseable yet.
// Accepts: "11:25 AM", "9:25pm", "21:25", "9", "925", "0925", "9:5", etc.
const parseFlexibleTime = (raw: string): string => {
  if (!raw) return '';
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  // Detect am/pm suffix
  let ampm: 'am' | 'pm' | null = null;
  let core = s;
  if (s.endsWith('am') || s.endsWith('a')) { ampm = 'am'; core = s.replace(/a\.?m?\.?$/, ''); }
  else if (s.endsWith('pm') || s.endsWith('p')) { ampm = 'pm'; core = s.replace(/p\.?m?\.?$/, ''); }
  core = core.replace(/[^\d:]/g, '');
  if (!core) return '';
  let h: number, m: number;
  if (core.includes(':')) {
    const [hStr, mStr = '0'] = core.split(':');
    h = parseInt(hStr, 10);
    m = parseInt(mStr, 10);
  } else {
    // pure digits: 9 -> 9:00, 925 -> 9:25, 0925 -> 09:25, 1430 -> 14:30
    if (core.length <= 2) { h = parseInt(core, 10); m = 0; }
    else if (core.length === 3) { h = parseInt(core.slice(0, 1), 10); m = parseInt(core.slice(1), 10); }
    else { h = parseInt(core.slice(0, core.length - 2), 10); m = parseInt(core.slice(-2), 10); }
  }
  if (isNaN(h) || isNaN(m)) return '';
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Format "HH:MM" 24h as "h:mm AM/PM" for display
const formatTimeDisplay = (hhmm: string): string => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Returns the Monday of the current week (week starts Monday).
// Uses local calendar formatting — toISOString() would shift the date by a day
// for viewers whose UTC offset pushes local midnight into another UTC day.
const getDefaultWeekStart = () => {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
};

// Build the list of date keys (yyyy-MM-dd) inclusive between from and to
const buildDateKeys = (from: string, to: string): string[] => {
  if (!from || !to) return [];
  // Normalize to yyyy-MM-dd in case input has extra parts
  const fromNorm = from.slice(0, 10);
  const toNorm = to.slice(0, 10);
  const start = new Date(fromNorm + 'T00:00:00');
  const end = new Date(toNorm + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  if (end < start) return [];
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const count = Math.min(diffDays + 1, 31); // cap at 31 days
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }
  return out;
};

// Read additional shifts from a stored daily_hours entry, falling back to the
// legacy time_in_2 / time_out_2 pair for timesheets saved before unlimited shifts.
const readShifts = (d: { time_in_2?: string; time_out_2?: string; shifts?: Shift[] } | undefined): Shift[] => {
  if (!d) return [];
  if (Array.isArray(d.shifts) && d.shifts.length > 0) {
    return d.shifts.map((s) => ({ time_in: s?.time_in || '', time_out: s?.time_out || '', note: s?.note || '' }));
  }
  if (d.time_in_2 || d.time_out_2) return [{ time_in: d.time_in_2 || '', time_out: d.time_out_2 || '' }];
  return [];
};

const emptyDaysFor = (keys: string[]): Record<string, DayEntry> =>
  Object.fromEntries(keys.map((k) => [k, { time_in: '', time_out: '', hours: '', reason: '' }]));


// Detect whether the user typed an explicit am/pm marker
const hasAmPmMarker = (raw: string) => /[ap]\.?m?\.?\s*$/i.test(raw.trim());

// Flexible time input: lets the user type freely (e.g. "9:25 PM", "21:25", "925")
// and emits a parsed "HH:MM" 24h value live as they type. If the user enters a
// 12-hour-ambiguous value (hour 1-12) without AM/PM, a mini popup asks which.
const FlexibleTimeInput = ({
  id,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  id: string;
  value: string; // parsed "HH:MM" 24h
  onChange: (parsed: string) => void;
  className?: string;
  ariaLabel?: string;
}) => {
  const [text, setText] = useState<string>(formatTimeDisplay(value));
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<{ h: number; m: number } | null>(null);

  // Sync external value -> displayed text when not actively editing
  useEffect(() => {
    if (!focused && !pickerOpen) setText(formatTimeDisplay(value));
  }, [value, focused, pickerOpen]);

  const commitWithMeridiem = (meridiem: 'am' | 'pm') => {
    if (!pending) return;
    let h = pending.h;
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    const hhmm = `${String(h).padStart(2, '0')}:${String(pending.m).padStart(2, '0')}`;
    onChange(hhmm);
    setText(formatTimeDisplay(hhmm));
    setPending(null);
    setPickerOpen(false);
  };

  const handleBlur = () => {
    setFocused(false);
    const raw = text.trim();
    if (raw === '') {
      onChange('');
      setText('');
      return;
    }
    // If user typed explicit am/pm, just parse normally
    if (hasAmPmMarker(raw)) {
      const parsed = parseFlexibleTime(raw);
      if (parsed) {
        onChange(parsed);
        setText(formatTimeDisplay(parsed));
      }
      return;
    }
    // Extract hour/minute from raw digits (no am/pm)
    const core = raw.replace(/[^\d:]/g, '');
    if (!core) return;
    let h: number, m: number;
    if (core.includes(':')) {
      const [hStr, mStr = '0'] = core.split(':');
      h = parseInt(hStr, 10);
      m = parseInt(mStr, 10);
    } else if (core.length <= 2) {
      h = parseInt(core, 10); m = 0;
    } else if (core.length === 3) {
      h = parseInt(core.slice(0, 1), 10); m = parseInt(core.slice(1), 10);
    } else {
      h = parseInt(core.slice(0, core.length - 2), 10); m = parseInt(core.slice(-2), 10);
    }
    if (isNaN(h) || isNaN(m) || m < 0 || m > 59 || h < 0 || h > 23) return;
    // Unambiguous: hour is 0 or 13-23 -> commit directly
    if (h === 0 || h > 12) {
      const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      onChange(hhmm);
      setText(formatTimeDisplay(hhmm));
      return;
    }
    // Ambiguous (1-12): open AM/PM mini picker
    setPending({ h, m });
    setPickerOpen(true);
  };

  return (
    <Popover
      open={pickerOpen}
      onOpenChange={(o) => { if (!o) { setPickerOpen(false); setPending(null); } }}
      modal
    >
      <PopoverTrigger asChild>
        <Input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="e.g. 9:00 AM"
          value={text}
          aria-label={ariaLabel}
          className={className}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (raw.trim() === '') {
              onChange('');
              return;
            }
            if (hasAmPmMarker(raw)) {
              const parsed = parseFlexibleTime(raw);
              if (parsed) onChange(parsed);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleBlur();
            }
          }}
          onBlur={(e) => {
            const next = e.relatedTarget as HTMLElement | null;
            if (next && next.closest('[data-ampm-picker]')) return;
            handleBlur();
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        data-ampm-picker
        align="start"
        className="w-auto p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          // Keep open if clicking the input itself; otherwise still keep open
          // until the user picks AM or PM.
          e.preventDefault();
        }}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={() => { setPickerOpen(false); setPending(null); }}
      >
        <div className="text-xs text-muted-foreground mb-2 px-1">
          {pending ? `${pending.h}:${String(pending.m).padStart(2, '0')} — AM or PM?` : 'AM or PM?'}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => commitWithMeridiem('am')}>AM</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => commitWithMeridiem('pm')}>PM</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ProfileField = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="text-sm mt-0.5 break-words">{value != null && value !== '' ? value : <span className="text-muted-foreground"></span>}</div>
  </div>
);

// Parse timezone strings like "PHT (UTC+8)" or "EST (UTC-5)" into offset minutes.
// Falls back to the browser's offset when the string is missing or malformed.
function tzOffsetMinutes(tz?: string | null): number | null {
  if (!tz) return null;
  const m = tz.match(/UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const h = parseInt(m[2], 10);
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (h * 60 + mm);
}

// Returns "YYYY-MM-DD" for `now` shifted into the given TZ offset.
function todayInTz(offsetMin: number | null): string {
  const now = new Date();
  const effective = offsetMin ?? -now.getTimezoneOffset();
  const shifted = new Date(now.getTime() + (effective + now.getTimezoneOffset()) * 60000);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

// Minutes since midnight in the given TZ offset.
function nowMinutesInTz(offsetMin: number | null): number {
  const now = new Date();
  const effective = offsetMin ?? -now.getTimezoneOffset();
  const shifted = new Date(now.getTime() + (effective + now.getTimezoneOffset()) * 60000);
  return shifted.getHours() * 60 + shifted.getMinutes();
}

function timeStringToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const PortalDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<ContractorInfo | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [flagDialogTimesheet, setFlagDialogTimesheet] = useState<Timesheet | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientNotified, setClientNotified] = useState(false);
  const [invoiceMatches, setInvoiceMatches] = useState(false);
  const [missingReasonOpen, setMissingReasonOpen] = useState(false);
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // When set, opens the "Resolve missing hours" dialog for the given date key.
  const [splitDialogKey, setSplitDialogKey] = useState<string | null>(null);

  // Check-in reminder + attention badge state
  const [hasCheckinToday, setHasCheckinToday] = useState<boolean>(true);
  const [pendingManagerCheckins, setPendingManagerCheckins] = useState<number>(0);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [tabValue, setTabValue] = useState<'timesheet' | 'checkin' | 'leave'>('timesheet');

  const emptyProfileForm: ProfileForm = {
    full_name: '', phone: '', whatsapp: '', location: '', country: '',
    contact_number: '', emergency_number: '', hours_per_week: '',
    hourly_rate: '', regular_work_shift: '', work_days: [],
    break_duration: '', break_unit: 'minutes', break_is_paid: false, break_enabled: false,
  };


  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [days, setDays] = useState<Record<string, DayEntry>>({});
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [incentiveNote, setIncentiveNote] = useState('');
  const [notes, setNotes] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraReason, setExtraReason] = useState('');

  // week-ending used for DB key (the "to" date)
  const weekEnding = weekEnd;

  // Date keys for the currently selected range
  const dateKeys = useMemo(() => buildDateKeys(weekStart, weekEnd), [weekStart, weekEnd]);

  const dayLabel = (key: string) => {
    const d = new Date(key + 'T00:00:00');
    return WEEKDAY_NAMES[d.getDay()];
  };

  // Validate the date range
  const dateRangeValid = useMemo(() => {
    if (!weekStart || !weekEnd) return false;
    const s = new Date(weekStart + 'T00:00:00').getTime();
    const e = new Date(weekEnd + 'T00:00:00').getTime();
    return e >= s;
  }, [weekStart, weekEnd]);

  // Sync days state to match the date range — preserve existing values for overlapping keys
  useEffect(() => {
    if (editingId) return; // don't auto-rebuild while editing existing entry
    setDays((prev) => {
      const next: Record<string, DayEntry> = {};
      dateKeys.forEach((k) => {
        next[k] = prev[k] || { time_in: '', time_out: '', hours: '', reason: '' };
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEnd]);

  // Sunday-exclusion exception: when enabled on the contractor profile, hours
  // logged on Sundays are silently excluded from invoice totals and OT detection.
  // The contractor can still log hours on Sunday — nothing changes visually.
  const isExcludedDay = (k: string): boolean => {
    if (!info?.sunday_hours_excluded) return false;
    return new Date(k + 'T00:00:00').getDay() === 0;
  };

  // Total hours INCLUDES Sunday hours (so the contractor sees their full effort).
  // Billing/invoice math uses `billableHours` below, which excludes Sunday when
  // the sunday-exclusion exception is enabled.
  const totalHours = useMemo(() => {
    return dateKeys.reduce((sum, k) => {
      const v = parseFloat(days[k]?.hours || '0');
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [days, dateKeys]);

  // Sum of hours logged on excluded (Sunday) days — shown for transparency,
  // but NOT billed and NOT counted as OT.
  const excludedHours = useMemo(() => {
    return dateKeys.reduce((sum, k) => {
      if (!isExcludedDay(k)) return sum;
      const v = parseFloat(days[k]?.hours || '0');
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [days, dateKeys, info?.sunday_hours_excluded]);

  // Billable hours = total minus the silently-excluded (Sunday) hours.
  const billableHours = useMemo(
    () => Number((totalHours - excludedHours).toFixed(2)),
    [totalHours, excludedHours]
  );


  const loadAll = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      navigate('/portal/login');
      return;
    }

    // A contractor may have multiple assignments (across clients, past + present).
    // Fetch ALL their portal mappings, then pick the active/current one for the dashboard.
    const { data: portalRows } = await supabase
      .from('contractor_portal_users')
      .select('contractor_assignment_id, must_change_password')
      .eq('user_id', session.session.user.id);

    if (!portalRows || portalRows.length === 0) {
      await supabase.auth.signOut();
      navigate('/portal/login');
      return;
    }
    if (portalRows.some((r: any) => r.must_change_password)) {
      navigate('/portal/change-password');
      return;
    }

    const allAssignmentIds = portalRows.map((r: any) => r.contractor_assignment_id);

    // Pull every assignment the user is linked to so we can (a) pick the active one
    // for the dashboard view and (b) join client/job info to past timesheets.
    const { data: assignmentsAll } = await supabase
      .from('contractor_assignments')
      .select('id, applicant_id, job_title, hourly_rate, hours_per_week, regular_work_shift, contact_number, emergency_number, country, work_days, status, start_date, sunday_hours_excluded, break_duration_minutes, break_is_paid, timezone, checkin_reminder_enabled, checkin_reminder_time, applicant:applicants_prescreen(full_name, email, phone, whatsapp, location), client:clients(company_name)')
      .in('id', allAssignmentIds);

    // Pick the active assignment first; otherwise the most recently started.
    const sorted = [...(assignmentsAll || [])].sort((a: any, b: any) => {
      const aActive = ['active', 'rendering'].includes(a.status) ? 0 : 1;
      const bActive = ['active', 'rendering'].includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aDate = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bDate = b.start_date ? new Date(b.start_date).getTime() : 0;
      return bDate - aDate;
    });
    const assignment: any = sorted[0];
    if (!assignment) {
      setLoading(false);
      return;
    }

    const applicant = (assignment.applicant as any) || {};
    const wd = Array.isArray(assignment.work_days) ? (assignment.work_days as string[]) : [];

    const nextInfo: ContractorInfo = {
      contractor_assignment_id: assignment.id,
      applicant_id: assignment.applicant_id || '',
      job_title: assignment.job_title || null,
      company_name: (assignment.client as any)?.company_name || null,
      full_name: applicant.full_name || null,
      hourly_rate: assignment.hourly_rate ?? null,
      hours_per_week: assignment.hours_per_week ?? null,
      regular_work_shift: assignment.regular_work_shift || null,
      contact_number: assignment.contact_number || null,
      emergency_number: assignment.emergency_number || null,
      country: assignment.country || null,
      email: applicant.email || null,
      phone: applicant.phone || null,
      whatsapp: applicant.whatsapp || null,
      location: applicant.location || null,
      work_days: wd,
      sunday_hours_excluded: Boolean((assignment as any).sunday_hours_excluded),
      break_duration_minutes: (assignment as any).break_duration_minutes ?? null,
      break_is_paid: (assignment as any).break_is_paid ?? null,
      timezone: (assignment as any).timezone || null,
      checkin_reminder_enabled: Boolean((assignment as any).checkin_reminder_enabled),
      checkin_reminder_time: (assignment as any).checkin_reminder_time || null,
    };
    setInfo(nextInfo);
    setProfileForm({
      full_name: nextInfo.full_name || '',
      phone: nextInfo.phone || '',
      whatsapp: nextInfo.whatsapp || '',
      location: nextInfo.location || '',
      country: nextInfo.country || '',
      contact_number: nextInfo.contact_number || '',
      emergency_number: nextInfo.emergency_number || '',
      hours_per_week: nextInfo.hours_per_week != null ? String(nextInfo.hours_per_week) : '',
      hourly_rate: nextInfo.hourly_rate != null ? String(nextInfo.hourly_rate) : '',
      regular_work_shift: nextInfo.regular_work_shift || '9:00 AM – 6:00 PM EST',
      work_days: [...nextInfo.work_days],
      ...breakStateToForm(nextInfo.break_duration_minutes, nextInfo.break_is_paid),
    });

    // Force profile completion on first login if any required field is missing.
    const incomplete =
      !nextInfo.full_name ||
      !nextInfo.phone ||
      !nextInfo.regular_work_shift ||
      nextInfo.hours_per_week == null ||
      nextInfo.hourly_rate == null;
    if (incomplete) {
      setProfileEditing(true);
      setProfileOpen(true);
    }

    // Pull timesheets from ALL of the contractor's assignments (current + previous),
    // so they can review historical invoices even after switching clients.
    const { data: ts } = await supabase
      .from('contractor_timesheets')
      .select('id, week_ending_date, total_hours, overtime_hours, incentive_amount, notes, status, outsta_status, submitted_at, daily_hours, client_approval_status, client_flag_reason, client_reviewed_at')
      .in('contractor_assignment_id', allAssignmentIds)
      .order('week_ending_date', { ascending: false });

    setTimesheets((ts as any) || []);
    setLoading(false);
  };

  // Computed: profile is missing required fields
  // Has the contractor configured their weekly work schedule?
  const hasWorkDays = (info?.work_days?.length || 0) > 0;

  // Computed: profile is missing required fields
  const profileIncomplete = !info
    ? false
    : (!info.full_name ||
       !info.phone ||
       !info.regular_work_shift ||
       info.hours_per_week == null ||
       info.hourly_rate == null ||
       !hasWorkDays);


  useEffect(() => { loadAll(); }, []);

  // ==== Check-in attention badge + reminder popup ====
  const tzOffset = useMemo(() => tzOffsetMinutes(info?.timezone), [info?.timezone]);

  const refreshCheckinToday = async () => {
    if (!info?.contractor_assignment_id) return;
    const today = todayInTz(tzOffset);
    // A contractor is considered "checked-in for today" if EITHER:
    //   (a) they filed a regular daily check-in, OR
    //   (b) they submitted a manager-sent check-in message today.
    // Otherwise a template posted by the manager would keep the red badge on the
    // Check-in tab even after the contractor completes and submits the form.
    const [{ data: daily }, { data: submittedMsgs }, { data: pendingMsgs }] = await Promise.all([
      supabase
        .from('contractor_daily_checkins')
        .select('id')
        .eq('contractor_assignment_id', info.contractor_assignment_id)
        .eq('checkin_date', today)
        .limit(1),
      supabase
        .from('contractor_checkin_messages' as any)
        .select('id')
        .eq('contractor_assignment_id', info.contractor_assignment_id)
        .not('submitted_at', 'is', null)
        .gte('submitted_at', `${today}T00:00:00`)
        .lte('submitted_at', `${today}T23:59:59.999`)
        .limit(1),
      supabase
        .from('contractor_checkin_messages' as any)
        .select('id')
        .eq('contractor_assignment_id', info.contractor_assignment_id)
        .is('submitted_at', null),
    ]);
    const hasDaily = Boolean(daily && daily.length > 0);
    const hasMsgSubmission = Boolean(submittedMsgs && (submittedMsgs as any[]).length > 0);
    setHasCheckinToday(hasDaily || hasMsgSubmission);
    setPendingManagerCheckins((pendingMsgs as any[] | null)?.length || 0);
  };

  useEffect(() => {
    if (!info?.contractor_assignment_id) return;
    refreshCheckinToday();
    const id = window.setInterval(refreshCheckinToday, 5 * 60 * 1000); // every 5 min
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.contractor_assignment_id, info?.timezone]);

  // Reminder popup ticker — checks once per minute
  useEffect(() => {
    if (!info?.contractor_assignment_id) return;
    const tick = () => {
      if (!info.checkin_reminder_enabled) return;
      if (hasCheckinToday) return;
      // Only nag the contractor if their manager has actually sent a check-in
      // that is still awaiting a response. Otherwise stay silent.
      if (pendingManagerCheckins === 0) return;
      const reminderMin = timeStringToMinutes(info.checkin_reminder_time);
      if (reminderMin === null) return;
      const nowMin = nowMinutesInTz(tzOffset);
      if (nowMin < reminderMin) return;
      const today = todayInTz(tzOffset);
      const snoozeUntil = Number(localStorage.getItem(`checkin_snooze_${info.contractor_assignment_id}`) || 0);
      if (Date.now() < snoozeUntil) return;
      const dismissed = localStorage.getItem(`checkin_reminded_${info.contractor_assignment_id}_${today}`);
      if (dismissed) return;
      setReminderOpen(true);
    };
    tick();
    const id = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.contractor_assignment_id, info?.checkin_reminder_enabled, info?.checkin_reminder_time, info?.timezone, hasCheckinToday, pendingManagerCheckins]);

  const dismissReminderForToday = () => {
    if (!info?.contractor_assignment_id) return;
    const today = todayInTz(tzOffset);
    localStorage.setItem(`checkin_reminded_${info.contractor_assignment_id}_${today}`, '1');
    setReminderOpen(false);
  };
  const snoozeReminder = () => {
    if (!info?.contractor_assignment_id) return;
    localStorage.setItem(`checkin_snooze_${info.contractor_assignment_id}`, String(Date.now() + 30 * 60 * 1000));
    setReminderOpen(false);
  };


  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/portal/login');
  };

  // Validate inputs (per-day hours and overtime). Returns true if numeric values are sane.
  const validateNumbers = (): boolean => {
    for (const k of dateKeys) {
      const raw = days[k]?.hours;
      if (raw === '' || raw == null) continue;
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0 || n > 24) {
        toast({ title: `Invalid hours for ${dayLabel(k)} (${format(new Date(k + 'T00:00:00'), 'MMM d')})`, description: 'Daily hours must be between 0 and 24.', variant: 'destructive' });
        return false;
      }
    }
    const ot = parseFloat(overtimeHours || '0');
    if (isNaN(ot) || ot < 0) {
      toast({ title: 'Invalid incentives', description: 'Incentives amount must be 0 or greater.', variant: 'destructive' });
      return false;
    }
    if (ot > 0 && !incentiveNote.trim()) {
      toast({ title: 'Incentive reason required', description: 'Please add a note explaining the incentive amount.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Helper: is the given date key a scheduled workday for this contractor?
  // Excluded days (e.g. Sunday when sunday_hours_excluded is on) are treated as not scheduled.
  const workDaysSet = useMemo(() => new Set(info?.work_days || []), [info?.work_days]);
  const isScheduledDay = (k: string) => {
    if (!hasWorkDays) return false;
    if (isExcludedDay(k)) return false;
    const dow = new Date(k + 'T00:00:00').getDay();
    return workDaysSet.has(DOW_TO_SHORT[dow]);
  };

  // Per-day expected hours = weekly target / number of scheduled work days
  // (excluding any days that are silently excluded from billing, e.g. Sunday)
  const perDayExpected = useMemo(() => {
    const hpw = info?.hours_per_week ? Number(info.hours_per_week) : null;
    const workDays = info?.work_days || [];
    const effectiveDays = info?.sunday_hours_excluded
      ? workDays.filter((d) => d !== 'Sun')
      : workDays;
    const numDays = effectiveDays.length;
    if (!hpw || numDays <= 0) return null;
    return hpw / numDays;
  }, [info?.hours_per_week, info?.work_days, info?.sunday_hours_excluded]);

  // Returns scheduled workday keys with no hours entered (require a reason).
  const getEmptyDays = (): string[] =>
    dateKeys.filter((k) => {
      const raw = days[k]?.hours;
      const isEmpty = raw === '' || raw == null || parseFloat(raw) === 0;
      if (!isEmpty) return false;
      return isScheduledDay(k);
    });


  // Per-row OT/regular split.
  // - Non-scheduled day with hours → all OT
  // - Scheduled day → hours count as regular until cumulative weekly target is reached;
  //   any excess becomes OT.
  const rowOtMap = useMemo(() => {
    const map: Record<string, { regularHours: number; otHours: number; isFullOT: boolean; isPartialOT: boolean; isScheduled: boolean }> = {};
    const hpw = info?.hours_per_week ? Number(info.hours_per_week) : null;
    let regularRunning = 0;
    const sortedKeys = [...dateKeys].sort();
    for (const k of sortedKeys) {
      // Sunday-exclusion exception: silently ignore Sunday hours when enabled.
      // The row reads as if no hours were entered — no OT badge, no regular hours.
      if (isExcludedDay(k)) {
        map[k] = { regularHours: 0, otHours: 0, isFullOT: false, isPartialOT: false, isScheduled: false };
        continue;
      }
      const h = parseFloat(days[k]?.hours || '0');
      const dayHours = !isNaN(h) && h > 0 ? h : 0;
      const scheduled = isScheduledDay(k);
      let regular = 0;
      let ot = 0;
      if (dayHours > 0) {
        if (!scheduled) {
          ot = dayHours;
        } else if (hpw != null && hpw > 0) {
          const remainingToTarget = Math.max(0, hpw - regularRunning);
          regular = Math.min(dayHours, remainingToTarget);
          ot = Math.max(0, dayHours - regular);
        } else {
          regular = dayHours;
        }
      }
      map[k] = {
        regularHours: Number(regular.toFixed(2)),
        otHours: Number(ot.toFixed(2)),
        isFullOT: dayHours > 0 && regular === 0 && ot > 0,
        isPartialOT: regular > 0 && ot > 0,
        isScheduled: scheduled,
      };
      regularRunning += regular;
    }
    return map;
  }, [days, dateKeys, info?.hours_per_week, workDaysSet, info?.sunday_hours_excluded]);

  // Returns list of day keys that have any OT hours
  const getOvertimeDays = (): string[] =>
    dateKeys.filter((k) => (rowOtMap[k]?.otHours || 0) > 0.001);

  // Expected hours = the contractor's weekly target from their profile
  const expectedHours = useMemo(() => {
    const hpw = info?.hours_per_week ? Number(info.hours_per_week) : null;
    if (!hpw || dateKeys.length === 0) return null;
    return hpw;
  }, [info?.hours_per_week, dateKeys]);

  // Regular hours = sum of regular portions
  const regularHoursTotal = useMemo(
    () => Number(dateKeys.reduce((s, k) => s + (rowOtMap[k]?.regularHours || 0), 0).toFixed(2)),
    [dateKeys, rowOtMap]
  );

  // OT hours = sum of OT portions
  const otHours = useMemo(
    () => Number(dateKeys.reduce((s, k) => s + (rowOtMap[k]?.otHours || 0), 0).toFixed(2)),
    [dateKeys, rowOtMap]
  );

  // Missing hours = sum, over scheduled days, of (perDayExpected - hoursLogged), clamped at 0
  const missingHoursTotal = useMemo(() => {
    if (perDayExpected == null) return 0;
    let missing = 0;
    for (const k of dateKeys) {
      if (!isScheduledDay(k)) continue;
      const v = parseFloat(days[k]?.hours || '0');
      const dayHours = !isNaN(v) && v > 0 ? v : 0;
      if (dayHours < perDayExpected) missing += perDayExpected - dayHours;
    }
    return Number(missing.toFixed(2));
  }, [dateKeys, days, perDayExpected, workDaysSet]);

  const hoursDiff = useMemo(() => {
    if (expectedHours == null) return 0;
    return Number((billableHours - expectedHours).toFixed(2));
  }, [billableHours, expectedHours]);

  // Tolerance: anything within ±0.25h is considered matching
  const hoursMatch = expectedHours == null ? true : Math.abs(hoursDiff) <= 0.25;

  // Scheduled days where hours logged are below per-day expected
  const getUnderHoursDays = (): string[] => {
    if (perDayExpected == null) return [];
    return dateKeys.filter((k) => {
      if (!isScheduledDay(k)) return false;
      const raw = days[k]?.hours;
      if (raw === '' || raw == null) return false;
      const v = parseFloat(raw);
      return !isNaN(v) && v > 0 && v < perDayExpected - 0.01;
    });
  };

  // Kept for backwards compat with submit handler; over-hours rows = OT rows now
  const getOverHoursDays = (): string[] => getOvertimeDays();



  const hasPendingApproval = useMemo(() => getOvertimeDays().length > 0, [days, dateKeys]);

  const handleSubmitClick = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!info) return;
    if (!hasWorkDays) {
      toast({ title: 'Work days not set', description: 'Please set your scheduled work days in your profile before submitting.', variant: 'destructive' });
      setProfileEditing(true);
      setProfileOpen(true);
      return;
    }
    if (!dateRangeValid) {
      toast({ title: 'Invalid date range', description: '"To" date must be on or after "From" date.', variant: 'destructive' });
      return;
    }
    if (!validateNumbers()) return;
    if (totalHours <= 0) {
      toast({ title: 'No hours entered', description: 'Please enter hours for at least one day.', variant: 'destructive' });
      return;
    }
    const empties = getEmptyDays();
    const overtimes = getOvertimeDays();
    const overHours = getOverHoursDays();
    const underHours = getUnderHoursDays();
    const allFlagged = Array.from(new Set([...empties, ...overtimes, ...overHours, ...underHours]));
    const missingReason = allFlagged.filter((k) => !days[k]?.reason?.trim());
    if (missingReason.length > 0) {
      setMissingDays(missingReason);
      setMissingReasonOpen(true);
      return;
    }
    // Fallback: under target but no obvious flagged days — still require at least one reason
    if (!hoursMatch && hoursDiff < 0) {
      const anyReason = dateKeys.some((k) => days[k]?.reason?.trim());
      if (!anyReason) {
        toast({
          title: `Missing ${Math.abs(hoursDiff).toFixed(2)} hrs`,
          description: 'Total is below your weekly target. Please add a Reason on at least one day explaining the discrepancy.',
          variant: 'destructive',
        });
        return;
      }
    }
    // Fallback: over target but no individual day exceeds per-day expected
    // (e.g. worked an extra day at the normal daily rate) — still require at least one reason
    if (!hoursMatch && hoursDiff > 0) {
      const anyReason = dateKeys.some((k) => days[k]?.reason?.trim());
      if (!anyReason) {
        toast({
          title: `Over by ${hoursDiff.toFixed(2)} hrs`,
          description: 'Total is above your weekly target. Please add a Reason on at least one day explaining the extra hours.',
          variant: 'destructive',
        });
        return;
      }
    }
    setConfirmOpen(true);

  };

  const performSubmit = async () => {
    if (!info) return;
    if (!validateNumbers()) return;
    const ot = parseFloat(overtimeHours || '0');

    const dailyPayload: Record<string, { hours: number; time_in?: string; time_out?: string; time_in_2?: string; time_out_2?: string; shifts?: Shift[]; reason?: string; weekday?: string }> = {};
    dateKeys.forEach((k) => {
      const h = parseFloat(days[k]?.hours || '0') || 0;
      const reason = days[k]?.reason?.trim() || '';
      const time_in = days[k]?.time_in || '';
      const time_out = days[k]?.time_out || '';
      // Additional shifts (unlimited). The first extra shift is also written to
      // time_in_2 / time_out_2 for backwards compatibility with existing readers.
      const extras = (days[k]?.shifts || [])
        .filter((s) => s.time_in || s.time_out)
        .map((s) => ({ time_in: s.time_in, time_out: s.time_out, ...(s.note?.trim() ? { note: s.note.trim() } : {}) }));
      dailyPayload[k] = {
        hours: h,
        weekday: dayLabel(k),
        ...(time_in ? { time_in } : {}),
        ...(time_out ? { time_out } : {}),
        ...(extras[0]?.time_in ? { time_in_2: extras[0].time_in } : {}),
        ...(extras[0]?.time_out ? { time_out_2: extras[0].time_out } : {}),
        ...(extras.length ? { shifts: extras } : {}),
        ...(reason ? { reason } : {}),
      };
    });


    setSubmitting(true);
    try {
      const needsApproval = getOvertimeDays().length > 0;
      const extraAmt = parseFloat(extraAmount || '0') || 0;
      const noteParts: string[] = [];
      if (notes.trim()) noteParts.push(notes.trim());
      if (ot > 0 && incentiveNote.trim()) noteParts.push(`Incentive ($${ot.toFixed(2)}): ${incentiveNote.trim()}`);
      if (extraAmt > 0 && extraReason.trim()) noteParts.push(`Extra amount ($${extraAmt.toFixed(2)}): ${extraReason.trim()}`);
      const combinedNotes = noteParts.join('\n\n');

      // Detect if this is a resubmission of a previously flagged timesheet
      const prior = timesheets.find((t) => t.id === editingId);
      const wasFlagged = !!prior && (
        prior.client_approval_status === 'flagged' ||
        prior.outsta_status === 'flagged' ||
        prior.status === 'flagged' ||
        prior.status === 'rejected'
      );

      const { error } = await supabase.from('contractor_timesheets').upsert({
        contractor_assignment_id: info.contractor_assignment_id,
        week_ending_date: weekEnding,
        total_hours: billableHours,
        overtime_hours: otHours,
        incentive_amount: ot,
        notes: combinedNotes || null,
        daily_hours: dailyPayload,
        status: needsApproval ? 'pending_approval' : 'submitted',
        submitted_at: new Date().toISOString(),
        ...(wasFlagged ? { client_approval_status: 'pending', client_flag_reason: null, outsta_status: 'pending' } : {}),
      }, { onConflict: 'contractor_assignment_id,week_ending_date' });
      if (error) throw error;
      toast({
        title: editingId ? 'Timesheet updated' : 'Timesheet submitted',
        description: needsApproval ? 'Days over 10 hours are pending admin approval.' : undefined,
      });

      // Fire email notifications + auto Payoneer verification
      try {
        const { data: tsRow } = await supabase
          .from('contractor_timesheets')
          .select('id')
          .eq('contractor_assignment_id', info.contractor_assignment_id)
          .eq('week_ending_date', weekEnding)
          .maybeSingle();
        if (tsRow?.id) {
          // Non-blocking notify
          supabase.functions.invoke('notify-timesheet-event', {
            body: {
              event: wasFlagged ? 'timesheet_resubmitted' : 'timesheet_submitted',
              timesheetId: tsRow.id,
            },
          }).catch((e) => console.error('notify invoke failed', e));

          // Auto-fire Payoneer verification (awaited so the request isn't
          // abandoned by the subsequent reload/cancel). Edge function caches
          // results, so repeat submissions of the same link are free.
          const payoneerMatch = (combinedNotes || '').match(/https?:\/\/(?:link\.|app\.)?payoneer\.com\/\S+/i);
          if (payoneerMatch) {
            try {
              await supabase.functions.invoke('verify-payoneer-invoice', {
                body: { url: payoneerMatch[0], timesheetId: tsRow.id },
              });
            } catch (e) {
              console.error('payoneer verify invoke failed', e);
            }
          }
        }
      } catch (e) {
        console.error('notify lookup failed', e);
      }


      handleCancelEdit();
      loadAll();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  const handleEdit = (t: Timesheet) => {
    setEditingId(t.id);
    // Determine date range. Prefer explicit date keys stored in daily_hours; fallback to legacy 7-day window.
    let fromKey = '';
    let toKey = t.week_ending_date;
    const dh = (t.daily_hours || {}) as Record<string, any>;
    const dateLikeKeys = Object.keys(dh).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (dateLikeKeys.length > 0) {
      fromKey = dateLikeKeys[0];
      toKey = dateLikeKeys[dateLikeKeys.length - 1];
    } else {
      const ending = new Date(t.week_ending_date + 'T00:00:00');
      fromKey = format(addDays(ending, -6), 'yyyy-MM-dd');
    }
    setWeekStart(fromKey);
    setWeekEnd(toKey);
    setDateRange({
      from: new Date(fromKey + 'T00:00:00'),
      to: new Date(toKey + 'T00:00:00'),
    });
    setDraftDateRange({
      from: new Date(fromKey + 'T00:00:00'),
      to: new Date(toKey + 'T00:00:00'),
    });

    const keys = buildDateKeys(fromKey, toKey);
    const next = emptyDaysFor(keys);

    if (dateLikeKeys.length > 0) {
      keys.forEach((k) => {
        const d = dh[k];
        if (d) next[k] = {
          time_in: d.time_in || '',
          time_out: d.time_out || '',
          shifts: readShifts(d),
          hours: d.hours != null ? String(d.hours) : '',
          reason: d.reason || '',
        };
      });
    } else {
      // Legacy: map mon/tue/... in order onto the 7 generated keys
      const legacy = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      keys.forEach((k, i) => {
        const d = dh[legacy[i]];
        if (d) next[k] = {
          time_in: d.time_in || '',
          time_out: d.time_out || '',
          shifts: readShifts(d),
          hours: d.hours != null ? String(d.hours) : '',
          reason: d.reason || '',
        };
      });
    }

    setDays(next);
    setOvertimeHours(String(t.incentive_amount ?? 0));
    // Parse existing Incentive / Extra amount lines out of notes so they
    // are not re-appended (duplicated) when the contractor re-submits.
    const rawNotes = t.notes || '';
    let incNote = '';
    let extraAmt = '';
    let extraRsn = '';
    const remaining: string[] = [];
    rawNotes.split(/\n+/).forEach((line) => {
      const incMatch = line.match(/^\s*Incentive\s*\(\$[\d.]+\)\s*:\s*(.*)$/i);
      const extraMatch = line.match(/^\s*Extra amount\s*\(\$([\d.]+)\)\s*:\s*(.*)$/i);
      if (incMatch) {
        incNote = incMatch[1].trim();
      } else if (extraMatch) {
        extraAmt = extraMatch[1];
        extraRsn = extraMatch[2].trim();
      } else if (line.trim()) {
        remaining.push(line);
      }
    });
    setIncentiveNote(incNote);
    setExtraAmount(extraAmt);
    setExtraReason(extraRsn);
    setNotes(remaining.join('\n\n'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setWeekStart('');
    setWeekEnd('');
    setDateRange(undefined);
    setDraftDateRange(undefined);
    setDays({});
    setOvertimeHours('0');
    setIncentiveNote('');
    setExtraAmount('');
    setExtraReason('');
    setNotes('');
  };

  const handleProfileCancel = () => {
    if (!info) return;
    setProfileForm({
      full_name: info.full_name || '',
      phone: info.phone || '',
      whatsapp: info.whatsapp || '',
      location: info.location || '',
      country: info.country || '',
      contact_number: info.contact_number || '',
      emergency_number: info.emergency_number || '',
      hours_per_week: info.hours_per_week != null ? String(info.hours_per_week) : '',
      hourly_rate: info.hourly_rate != null ? String(info.hourly_rate) : '',
      regular_work_shift: info.regular_work_shift || '',
      work_days: [...info.work_days],
      ...breakStateToForm(info.break_duration_minutes, info.break_is_paid),
    });

    setProfileEditing(false);
  };

  const handleProfileSave = async () => {
    if (!info) return;
    if (!profileForm.full_name.trim()) {
      toast({ title: 'Name required', description: 'Please enter your full name.', variant: 'destructive' });
      return;
    }
    if (!profileForm.phone.trim()) {
      toast({ title: 'Phone required', description: 'Please enter your phone number.', variant: 'destructive' });
      return;
    }
    if (!profileForm.regular_work_shift.trim()) {
      toast({ title: 'Work shift required', description: 'Please enter your regular work shift.', variant: 'destructive' });
      return;
    }
    const hpw = profileForm.hours_per_week.trim() === '' ? null : Number(profileForm.hours_per_week);
    const rate = profileForm.hourly_rate.trim() === '' ? null : Number(profileForm.hourly_rate);
    if (hpw == null) {
      toast({ title: 'Hours per week required', description: 'Please enter your regular hours per week.', variant: 'destructive' });
      return;
    }
    if (isNaN(hpw) || hpw < 0 || hpw > 168) {
      toast({ title: 'Invalid hours', description: 'Hours per week must be between 0 and 168.', variant: 'destructive' });
      return;
    }
    if (rate == null) {
      toast({ title: 'Rate required', description: 'Please enter your current hourly rate.', variant: 'destructive' });
      return;
    }
    if (isNaN(rate) || rate < 0) {
      toast({ title: 'Invalid rate', description: 'Rate must be a non-negative number.', variant: 'destructive' });
      return;
    }
    if (profileForm.work_days.length === 0) {
      toast({ title: 'Work days required', description: 'Please select your scheduled work days.', variant: 'destructive' });
      return;
    }
    // Break / Lunch: validate and convert to minutes for storage
    let breakMinutesToSave: number | null = null;
    let breakIsPaidToSave: boolean | null = null;
    if (profileForm.break_enabled) {
      const rawDur = profileForm.break_duration.trim();
      if (rawDur === '') {
        toast({ title: 'Break duration required', description: 'Enter a break duration or turn off the break setting.', variant: 'destructive' });
        return;
      }
      const num = Number(rawDur);
      if (isNaN(num) || num < 0) {
        toast({ title: 'Invalid break duration', description: 'Break duration must be a non-negative number.', variant: 'destructive' });
        return;
      }
      const minutes = profileForm.break_unit === 'hours' ? Math.round(num * 60) : Math.round(num);
      if (minutes > 24 * 60) {
        toast({ title: 'Break too long', description: 'Break duration cannot exceed 24 hours.', variant: 'destructive' });
        return;
      }
      breakMinutesToSave = minutes;
      breakIsPaidToSave = profileForm.break_is_paid;
    }
    setProfileSaving(true);
    try {
      const { error: aErr } = await supabase
        .from('contractor_assignments')
        .update({
          hourly_rate: rate,
          hours_per_week: hpw,
          regular_work_shift: profileForm.regular_work_shift.trim() || null,
          work_days: profileForm.work_days,
          break_duration_minutes: breakMinutesToSave,
          break_is_paid: breakIsPaidToSave,
        } as any)


        .eq('id', info.contractor_assignment_id);
      if (aErr) throw aErr;

      const { error: pErr } = await supabase
        .from('applicants_prescreen')
        .update({
          full_name: profileForm.full_name.trim(),
          phone: profileForm.phone.trim() || null,
        })
        .eq('id', info.applicant_id);
      if (pErr) throw pErr;

      toast({ title: 'Profile updated', description: 'Your profile changes have been saved.' });
      setProfileEditing(false);
      await loadAll();
    } catch (e: any) {
      toast({ title: 'Could not save profile', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleClearDateRange = () => {
    setDraftDateRange(undefined);
    setDateRange(undefined);
    setWeekStart('');
    setWeekEnd('');
    setDays({});
  };

  const handleApplyDateRange = () => {
    if (!draftDateRange?.from || !draftDateRange?.to) return;

    setDateRange(draftDateRange);
    setWeekStart(format(draftDateRange.from, 'yyyy-MM-dd'));
    setWeekEnd(format(draftDateRange.to, 'yyyy-MM-dd'));
    setDatePickerOpen(false);
  };

  const shiftWeek = (direction: -1 | 1) => {
    let from: Date;
    let to: Date;
    if (weekStart && weekEnd) {
      from = addDays(new Date(weekStart + 'T00:00:00'), direction * 7);
      to = addDays(new Date(weekEnd + 'T00:00:00'), direction * 7);
    } else {
      const today = new Date();
      const monday = startOfWeek(today, { weekStartsOn: 1 });
      from = addDays(monday, direction * 7);
      to = addDays(from, 6);
    }
    const fromKey = format(from, 'yyyy-MM-dd');
    const toKey = format(to, 'yyyy-MM-dd');
    const range = { from, to };
    setDateRange(range);
    setDraftDateRange(range);
    setWeekStart(fromKey);
    setWeekEnd(toKey);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  // Regular shift parsed from the contractor's profile, in "HH:MM" 24h format.
  const regularShift24 = useMemo(() => {
    const { start, end } = parseShift(info?.regular_work_shift);
    return { start: to24h(start), end: to24h(end) };
  }, [info?.regular_work_shift]);
  const hasRegularShift = !!(regularShift24.start && regularShift24.end);

  const isRegularApplied = (k: string) => {
    if (!hasRegularShift) return false;
    const d = days[k];
    return !!d && d.time_in === regularShift24.start && d.time_out === regularShift24.end;
  };

  const fillRegular = (k: string) => {
    if (!hasRegularShift) return;
    if (isRegularApplied(k)) {
      // Clear primary shift AND any split shift on this day
      updateDay(k, { time_in: '', time_out: '', shifts: [] });
    } else {
      updateDay(k, { time_in: regularShift24.start, time_out: regularShift24.end });
    }
  };

  const fillAllRegular = () => {
    if (!hasRegularShift) return;
    setDays((prev) => {
      const next = { ...prev };
      dateKeys.forEach((k) => {
        if (!isScheduledDay(k)) return;
        const merged: DayEntry = {
          ...(next[k] || { time_in: '', time_out: '', hours: '', reason: '' }),
          time_in: regularShift24.start,
          time_out: regularShift24.end,
        };
        const h = computeDayBillable(merged, info?.break_duration_minutes, info?.break_is_paid);
        merged.hours = h > 0 ? String(h) : '';
        next[k] = merged;
      });
      return next;
    });
  };

  const updateDay = (k: string, patch: Partial<DayEntry>) => {
    setDays((prev) => {
      const merged = { ...prev[k], ...patch } as DayEntry;
      // Recompute hours whenever any time field is touched (shift 1 or split shift 2)
      if ('time_in' in patch || 'time_out' in patch || 'shifts' in patch) {
        const h = computeDayBillable(merged, info?.break_duration_minutes, info?.break_is_paid);
        merged.hours = h > 0 ? String(h) : '';
      }
      return { ...prev, [k]: merged };
    });
  };

  // If the contractor's break configuration changes, recompute every day's billable hours
  // so the timesheet and totals stay in sync without requiring a re-entry of times.
  useEffect(() => {
    setDays((prev) => {
      const next: Record<string, DayEntry> = {};
      let changed = false;
      Object.entries(prev).forEach(([k, entry]) => {
        if (entry?.time_in && entry?.time_out) {
          const h = computeDayBillable(entry, info?.break_duration_minutes, info?.break_is_paid);
          const newHours = h > 0 ? String(h) : '';
          if (newHours !== entry.hours) changed = true;
          next[k] = { ...entry, hours: newHours };
        } else {
          next[k] = entry;
        }
      });
      return changed ? next : prev;
    });
  }, [info?.break_duration_minutes, info?.break_is_paid]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet><title>My Timesheets | OutSta PL Portal</title></Helmet>
      <header className="border-b bg-background">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">OutSta PL Portal</h1>
            <p className="text-xs text-muted-foreground">{info?.full_name} · {info?.company_name} · {info?.job_title}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setProfileEditing(false); setProfileOpen(true); }}
              aria-label="Open profile"
              className="gap-2"
            >
              <UserCircle2 className="w-6 h-6 text-primary" />
              <span className="hidden sm:inline text-sm">Profile</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
        <Dialog
          open={profileOpen || profileIncomplete}
          onOpenChange={(open) => {
            if (profileIncomplete && !open) return; // block close while incomplete
            setProfileOpen(open);
            if (!open) setProfileEditing(false);
          }}
        >
          <DialogContent
            className={`max-w-3xl max-h-[90vh] overflow-y-auto ${profileIncomplete ? '[&>button]:hidden' : ''}`}
            onPointerDownOutside={(e) => { if (profileIncomplete) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (profileIncomplete) e.preventDefault(); }}
            onInteractOutside={(e) => { if (profileIncomplete) e.preventDefault(); }}
          >
            <DialogHeader>
              <DialogTitle>{profileIncomplete ? 'Complete your profile' : 'My Profile'}</DialogTitle>
              <DialogDescription>
                {profileIncomplete
                  ? 'Please fill in the required details below before using the portal. This helps us keep your assignment information accurate.'
                  : 'Keep your contact and assignment details up to date.'}
              </DialogDescription>
            </DialogHeader>
            {profileIncomplete && (
              <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
                Required: Full name, Phone, Regular work shift, Hours per week, Current rate, and Work days.
              </div>
            )}
            {(!profileEditing && !profileIncomplete) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm py-2">
                <ProfileField label="Full name" value={info?.full_name} />
                <ProfileField label="Email" value={info?.email} />
                <ProfileField label="Phone" value={info?.phone} />
                <ProfileField label="Job title" value={info?.job_title} />
                <ProfileField label="Company" value={info?.company_name} />
                <ProfileField label="Regular work shift" value={info?.regular_work_shift} />
                <ProfileField label="Hours per week" value={info?.hours_per_week != null ? `${info.hours_per_week} hrs` : null} />
                <ProfileField label="Current rate" value={info?.hourly_rate != null ? `$${Number(info.hourly_rate).toFixed(2)}/hr` : null} />
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Work days</div>
                  {hasWorkDays ? (
                    <div className="flex flex-wrap gap-1.5">
                      {WORK_DAY_SHORT.map((d) => {
                        const on = (info?.work_days || []).includes(d);
                        return (
                          <span
                            key={d}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border'}`}
                          >
                            {d}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-destructive">
                      ⚠ Work days not set — please update your profile
                    </div>
                  )}
                </div>
                <ProfileField
                  label="Break / Lunch"
                  value={
                    info?.break_duration_minutes && info.break_duration_minutes > 0
                      ? `${info.break_duration_minutes % 60 === 0 ? info.break_duration_minutes / 60 + ' hr' : info.break_duration_minutes + ' min'} · ${info.break_is_paid ? 'Paid (included)' : 'Unpaid (deducted)'}`
                      : null
                  }
                />

              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="p-full_name">Full name <span className="text-destructive">*</span></Label>
                  <Input id="p-full_name" value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={info?.email || ''} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-phone">Phone <span className="text-destructive">*</span></Label>
                  <Input id="p-phone" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Regular work shift (EST) <span className="text-destructive">*</span></Label>
                  {(() => {
                    const { start, end } = parseShift(profileForm.regular_work_shift);
                    return (
                      <div className="flex items-center gap-2">
                        <TimeCombobox
                          value={start}
                          placeholder="Start time"
                          ariaLabel="Shift start time"
                          onChange={(v) => setProfileForm({ ...profileForm, regular_work_shift: composeShift(v, end) })}
                        />
                        <span className="text-muted-foreground text-sm shrink-0">–</span>
                        <TimeCombobox
                          value={end}
                          placeholder="End time"
                          ariaLabel="Shift end time"
                          onChange={(v) => setProfileForm({ ...profileForm, regular_work_shift: composeShift(start, v) })}
                        />
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-hpw">Hours per week <span className="text-destructive">*</span></Label>
                  <Input id="p-hpw" type="number" step="0.5" min="0" max="168" value={profileForm.hours_per_week} onChange={(e) => setProfileForm({ ...profileForm, hours_per_week: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-rate">Current rate (per hour) <span className="text-destructive">*</span></Label>
                  <Input id="p-rate" type="number" step="0.01" min="0" value={profileForm.hourly_rate} onChange={(e) => setProfileForm({ ...profileForm, hourly_rate: e.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Work days <span className="text-destructive">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_DAY_SHORT.map((d) => {
                      const on = profileForm.work_days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const set = new Set(profileForm.work_days);
                            if (set.has(d)) set.delete(d); else set.add(d);
                            const ordered = WORK_DAY_SHORT.filter((x) => set.has(x));
                            setProfileForm({ ...profileForm, work_days: ordered });
                          }}
                          className={`px-3.5 py-1.5 rounded-full text-sm font-medium border-2 transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
                          aria-pressed={on}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select the days you are expected to work each week. This determines when undertime and overtime are tracked.
                  </p>
                </div>
                {/* Break / Lunch */}
                <div className="space-y-3 md:col-span-2 rounded-md border p-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">Break / Lunch</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        If your break is unpaid, it will be automatically deducted from your total billable hours each day you log time.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
                      <Checkbox
                        checked={profileForm.break_enabled}
                        onCheckedChange={(v) => setProfileForm({ ...profileForm, break_enabled: !!v })}
                      />
                      <span>Enable</span>
                    </label>
                  </div>
                  {profileForm.break_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Break duration</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step={profileForm.break_unit === 'hours' ? '0.25' : '1'}
                            value={profileForm.break_duration}
                            onChange={(e) => setProfileForm({ ...profileForm, break_duration: e.target.value })}
                            className="w-28"
                            placeholder={profileForm.break_unit === 'hours' ? '1' : '60'}
                          />
                          <div className="inline-flex rounded-md border overflow-hidden">
                            {(['minutes', 'hours'] as const).map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => setProfileForm({ ...profileForm, break_unit: u })}
                                className={`px-3 py-1.5 text-xs font-medium transition-colors ${profileForm.break_unit === u ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Break type</Label>
                        <div className="inline-flex rounded-md border overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setProfileForm({ ...profileForm, break_is_paid: false })}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${!profileForm.break_is_paid ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                          >
                            Unpaid (deducted)
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileForm({ ...profileForm, break_is_paid: true })}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${profileForm.break_is_paid ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                          >
                            Paid (included)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              {(!profileEditing && !profileIncomplete) ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Close</Button>
                  <Button type="button" onClick={() => setProfileEditing(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                </>
              ) : (
                <>
                  {!profileIncomplete && (
                    <Button type="button" variant="outline" onClick={handleProfileCancel} disabled={profileSaving}>Cancel</Button>
                  )}
                  <Button type="button" onClick={handleProfileSave} disabled={profileSaving}>
                    {profileSaving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    {profileIncomplete ? 'Save & continue' : 'Save'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as any)} className="space-y-6">
          <TabsList>
            <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
            <TabsTrigger value="checkin" className="relative">
              Check-in
              {pendingManagerCheckins > 0 && (
                <span
                  aria-label="Check-in from your manager"
                  className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow ring-2 ring-background"
                >
                  {pendingManagerCheckins}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
          </TabsList>
          <TabsContent value="timesheet" className="space-y-6 mt-0">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{editingId ? 'Edit Weekly Hours' : 'Submit Weekly Hours'}</CardTitle>
                <CardDescription>
                  {editingId
                    ? 'Update the entry below and click Save to confirm changes.'
                    : 'Pick the date range (From – To) and enter the hours you worked each day.'}
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setTutorialOpen(true)} className="shrink-0">
                <HelpCircle className="w-4 h-4 mr-2" />
                How it works
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!hasWorkDays && (
              <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 px-4 py-3">
                <div className="text-sm">
                  <div className="font-medium">Your work schedule is not set.</div>
                  <div className="text-xs opacity-90">Please update your profile before submitting hours.</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-400 bg-white hover:bg-amber-100"
                  onClick={() => { setProfileEditing(true); setProfileOpen(true); }}
                >
                  Set up my schedule →
                </Button>
              </div>
            )}
            <form onSubmit={handleSubmitClick} onKeyDown={handleFormKeyDown} className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-center items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => shiftWeek(-1)}
                    aria-label="Previous week"
                    className="h-8 w-8 shrink-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Popover
                    open={datePickerOpen}
                    onOpenChange={(open) => {
                      setDatePickerOpen(open);
                      setDraftDateRange(open ? dateRange : dateRange);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'rounded-full px-4 py-2 font-normal bg-blue-50 hover:bg-blue-100 border-blue-200',
                          !weekStart && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                        {weekStart && weekEnd ? (
                          <>
                            {format(new Date(weekStart + 'T00:00:00'), 'MMM d, yyyy')} – {format(new Date(weekEnd + 'T00:00:00'), 'MMM d, yyyy')}
                          </>
                        ) : weekStart ? (
                          <>{format(new Date(weekStart + 'T00:00:00'), 'MMM d, yyyy')} – pick end date</>
                        ) : (
                          <span>Pick a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                      <div className="space-y-2 p-2">
                        <Calendar
                          mode="range"
                          numberOfMonths={2}
                          showOutsideDays={false}
                          weekStartsOn={1}
                          defaultMonth={draftDateRange?.from ?? dateRange?.from ?? new Date()}
                          selected={draftDateRange}
                          onSelect={setDraftDateRange}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                          classNames={{
                            cell: 'h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
                            day_today: 'text-primary font-semibold',
                            day_range_start: 'day-range-start rounded-l-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                            day_range_end: 'day-range-end rounded-r-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                            day_range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none',
                          }}
                        />
                        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
                          <Button type="button" variant="ghost" size="sm" onClick={handleClearDateRange}>
                            Clear
                          </Button>
                          <Button type="button" size="sm" onClick={handleApplyDateRange} disabled={!draftDateRange?.from || !draftDateRange?.to}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => shiftWeek(1)}
                    aria-label="Next week"
                    className="h-8 w-8 shrink-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {weekStart && weekEnd && !dateRangeValid && (
                  <p className="text-xs text-destructive text-center">"To" must be on or after "From".</p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                {/* LEFT: daily entries */}
                <div className="space-y-3 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Label className="block">Time in / Time out per day</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter your log-in and log-out times — total hours are calculated automatically. Overnight shifts (log-out before log-in) are handled automatically.
                      </p>
                    </div>
                    {dateKeys.length > 0 && hasRegularShift && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fillAllRegular}
                        className="h-8 border-teal-500/60 text-teal-700 hover:bg-teal-50 hover:text-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Fill all with regular hours
                      </Button>
                    )}
                  </div>
                  <div className="rounded-lg border bg-card overflow-hidden">
                    {dateKeys.length === 0 && (
                      <p className="text-sm text-muted-foreground p-4">
                        Select a valid date range to enter your times.
                      </p>
                    )}
                    {dateKeys.map((k, idx) => {
                      const date = new Date(k + 'T00:00:00');
                      const entry = days[k] || { time_in: '', time_out: '', hours: '', reason: '' };
                      const hoursNum = parseFloat(entry.hours || '0');
                      const validHours = !isNaN(hoursNum) && hoursNum > 0 ? hoursNum : 0;
                      const ot = rowOtMap[k] || { regularHours: 0, otHours: 0, isFullOT: false, isPartialOT: false, isScheduled: false };
                      const scheduled = hasWorkDays && ot.isScheduled;
                      const isUnderTarget =
                        hasWorkDays &&
                        scheduled &&
                        perDayExpected != null &&
                        validHours > 0 &&
                        validHours < perDayExpected - 0.01;
                      const isEmptyScheduled = hasWorkDays && scheduled && validHours === 0;
                      const isOTRow = hasWorkDays && (ot.otHours || 0) > 0.001;
                      const isPartialOT = hasWorkDays && ot.isPartialOT;
                      const isFullOT = hasWorkDays && ot.isFullOT;
                      // Severity: undertime/missing = red; overtime = amber; otherwise none.
                      const isMissing = isUnderTarget || isEmptyScheduled;
                      const needsReason = isOTRow || isUnderTarget || isEmptyScheduled;
                      const reasonLabel = isEmptyScheduled
                        ? '(required — no hours logged)'
                        : isUnderTarget
                        ? `(required — undertime, ${(perDayExpected! - validHours).toFixed(2)} hrs short)`
                        : isPartialOT
                        ? `(required — overtime, includes ${ot.otHours} hrs OT)`
                        : isFullOT
                        ? '(required — overtime)'
                        : '(only if no hours)';
                      const reasonPlaceholder = isOTRow
                        ? 'e.g. urgent deadline, extra workload'
                        : isMissing
                        ? 'e.g. half day, left early, sick, day off'
                        : 'Optional — e.g. day off, holiday, sick';
                      const label = dayLabel(k);
                      const borderTone = isMissing
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : isOTRow
                        ? 'border-amber-500 focus-visible:ring-amber-500'
                        : 'border-blue-300 dark:border-blue-700 focus-visible:ring-blue-500';
                      const timeInputClass = `bg-background border-2 h-12 text-base font-medium w-[100px] text-center ${borderTone}`;
                      const rowBg = isMissing
                        ? 'bg-red-50/60 dark:bg-red-950/20'
                        : isOTRow
                        ? 'bg-amber-50/60 dark:bg-amber-950/20'
                        : idx % 2 === 0
                        ? 'bg-background'
                        : 'bg-muted/40';
                      const leftBorder = isMissing
                        ? 'border-l-4 border-l-red-500'
                        : isOTRow
                        ? 'border-l-4 border-l-amber-500'
                        : '';

                      const extraShifts = entry.shifts || [];
                      const hasSplit = extraShifts.length > 0;
                      const shortBy = perDayExpected != null && validHours < perDayExpected
                        ? Number((perDayExpected - validHours).toFixed(2))
                        : 0;

                      return (
                        <div
                          key={k}
                          className={`px-4 py-3 border-b last:border-b-0 ${leftBorder} ${rowBg}`}
                        >
                          <div className="grid grid-cols-1 md:grid-cols-[110px_100px_100px_72px_1fr] gap-2.5 md:gap-3 items-center">


                          <div>
                            <div className="font-semibold text-sm">{label}</div>
                            <div className="text-xs text-muted-foreground">{format(date, 'MMM d, yyyy')}</div>
                            {scheduled && (
                              hasRegularShift ? (
                                (() => {
                                  const applied = isRegularApplied(k);
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => fillRegular(k)}
                                      className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                        applied
                                          ? 'border-teal-500 bg-teal-500 text-white hover:bg-teal-600'
                                          : 'border-teal-500/60 text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40'
                                      }`}
                                      aria-label={applied ? `Clear regular hours for ${label}` : `Fill ${label} with regular hours`}
                                      aria-pressed={applied}
                                      title={applied ? 'Click to clear' : 'Click to fill with regular hours'}
                                    >
                                      <Check className="h-3 w-3" />
                                      Regular
                                    </button>
                                  );
                                })()
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70 cursor-help"
                                    >
                                      <Check className="h-3 w-3" />
                                      Regular
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    Set your regular work shift in your profile to use this feature
                                  </TooltipContent>
                                </Tooltip>
                              )
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`tin-${k}`} className="text-[11px] font-medium text-muted-foreground">Time in</Label>
                            <FlexibleTimeInput
                              id={`tin-${k}`}
                              value={entry.time_in}
                              onChange={(v) => updateDay(k, { time_in: v })}
                              ariaLabel={`${label} ${format(date, 'MMM d')} time in`}
                              className={timeInputClass}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`tout-${k}`} className="text-[11px] font-medium text-muted-foreground">Time out</Label>
                            <FlexibleTimeInput
                              id={`tout-${k}`}
                              value={entry.time_out}
                              onChange={(v) => updateDay(k, { time_out: v })}
                              ariaLabel={`${label} ${format(date, 'MMM d')} time out`}
                              className={timeInputClass}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Label className="text-[11px] font-medium text-muted-foreground">Total hours</Label>
                              {(() => {
                                const breakOn = info?.break_is_paid === false && (info?.break_duration_minutes || 0) > 0;
                                if (!breakOn) return null;
                                const raw = computeRawHours(entry.time_in, entry.time_out);
                                if (raw <= 0) return null;
                                const mins = info!.break_duration_minutes!;
                                const breakLabel = mins % 60 === 0 ? `${mins / 60} hr` : `${mins} min`;
                                const formatTime = (t: string) => {
                                  if (!t) return '';
                                  const [hh, mm] = t.split(':').map(Number);
                                  if (isNaN(hh)) return t;
                                  const period = hh < 12 ? 'AM' : 'PM';
                                  const h12 = hh % 12 === 0 ? 12 : hh % 12;
                                  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
                                };
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Break deduction info">
                                        <Info className="w-3 h-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      Includes {breakLabel} unpaid break deduction ({formatTime(entry.time_in)} – {formatTime(entry.time_out)} = {raw.toFixed(2)} hrs raw)
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                            </div>
                            <Input
                              readOnly
                              value={hoursNum > 0 ? hoursNum.toFixed(2) : '0.00'}
                              className={`h-12 w-[72px] text-center text-base font-semibold border-2 bg-muted/40 ${isMissing ? 'border-red-500 text-red-900 dark:text-red-200' : isOTRow ? 'border-amber-500 text-amber-900 dark:text-amber-200' : 'border-blue-300 dark:border-blue-700'}`}
                            />
                          </div>
                          <div className="space-y-1 min-w-0">
                            <Label htmlFor={`reason-${k}`} className="text-[11px] font-medium text-muted-foreground">
                              Reason {reasonLabel}
                            </Label>
                            <Input
                              id={`reason-${k}`}
                              placeholder={reasonPlaceholder}
                              value={entry.reason}
                              onChange={(e) => updateDay(k, { reason: e.target.value })}
                              className={`bg-background border-2 h-10 ${borderTone}`}
                            />
                          </div>
                          </div>


                          {extraShifts.map((s, si) => {
                            const ordinal = si + 2;
                            const suffix = ordinal === 2 ? '2nd' : ordinal === 3 ? '3rd' : `${ordinal}th`;
                            const setShift = (patch: Partial<Shift>) =>
                              updateDay(k, {
                                shifts: extraShifts.map((x, xi) => (xi === si ? { ...x, ...patch } : x)),
                              });
                            return (
                            <div key={si} className="mt-2 grid grid-cols-1 md:grid-cols-[110px_100px_100px_72px_1fr] gap-2.5 md:gap-3 items-center">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                                Shift {ordinal}
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`tin${ordinal}-${k}`} className="text-[11px] font-medium text-muted-foreground">Time in ({suffix})</Label>
                                <FlexibleTimeInput
                                  id={`tin${ordinal}-${k}`}
                                  value={s.time_in || ''}
                                  onChange={(v) => setShift({ time_in: v })}
                                  ariaLabel={`${label} ${format(date, 'MMM d')} shift ${ordinal} time in`}
                                  className={timeInputClass}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`tout${ordinal}-${k}`} className="text-[11px] font-medium text-muted-foreground">Time out ({suffix})</Label>
                                <FlexibleTimeInput
                                  id={`tout${ordinal}-${k}`}
                                  value={s.time_out || ''}
                                  onChange={(v) => setShift({ time_out: v })}
                                  ariaLabel={`${label} ${format(date, 'MMM d')} shift ${ordinal} time out`}
                                  className={timeInputClass}
                                />
                              </div>
                              <div />
                              <div className="space-y-1 min-w-0">
                                <Label htmlFor={`note${ordinal}-${k}`} className="text-[11px] font-medium text-muted-foreground">Note (optional)</Label>
                                <Input
                                  id={`note${ordinal}-${k}`}
                                  placeholder="e.g. returned after client meeting"
                                  value={s.note || ''}
                                  onChange={(e) => setShift({ note: e.target.value })}
                                  className="bg-background border-2 h-10"
                                />
                              </div>
                              <div className="md:col-span-5 flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateDay(k, { shifts: extraShifts.filter((_, xi) => xi !== si) })}
                                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Remove shift {ordinal}
                                </Button>
                                {si === extraShifts.length - 1 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateDay(k, { shifts: [...extraShifts, { time_in: s.time_out || '', time_out: '' }] })}
                                    className="h-8 text-xs border-teal-500/60 text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                                  >
                                    <Split className="h-3.5 w-3.5" />
                                    Add another shift
                                  </Button>
                                )}
                              </div>
                            </div>

                            );
                          })}


                          {!hasSplit && isMissing && validHours > 0 && shortBy > 0.01 && (
                            <div className="mt-2 flex items-center gap-2">
                              {entry.reason?.trim() ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSplitDialogKey(k)}
                                  className="h-8 border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Undertime explained ({shortBy.toFixed(2)} hrs short) — edit
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSplitDialogKey(k)}
                                  className="h-8 border-red-500/60 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                                >
                                  <Split className="h-3.5 w-3.5" />
                                  Missing {shortBy.toFixed(2)} hrs — Add split shift or mark as undertime
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT: sticky summary */}
                <aside className="lg:sticky lg:top-6 self-start">
                  {(() => {
                    const expected = expectedHours ?? 0;
                    const pct = expected > 0 ? Math.min(100, (billableHours / expected) * 100) : 0;
                    const incentiveAmt = parseFloat(overtimeHours || '0') || 0;
                    const rate = info?.hourly_rate != null ? Number(info.hourly_rate) : null;
                    const invoiceTotal = rate != null ? billableHours * rate + incentiveAmt : null;
                    const showStatus = expectedHours != null && dateKeys.length > 0;
                    return (
                      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Week summary</div>
                            <div className="text-sm font-semibold mt-0.5">
                              {weekStart && weekEnd
                                ? `${format(new Date(weekStart + 'T00:00:00'), 'MMM d')} – ${format(new Date(weekEnd + 'T00:00:00'), 'MMM d, yyyy')}`
                                : 'No week selected'}
                            </div>
                          </div>
                          {showStatus && (
                            hoursMatch ? (
                              <CheckCircle2 className="w-7 h-7 text-emerald-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-7 h-7 text-amber-500 shrink-0" />
                            )
                          )}
                        </div>
                        <div className="p-5 space-y-5">
                          {expected > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-baseline justify-between text-sm">
                                <span className="text-muted-foreground">Hours logged</span>
                                <span className="font-semibold">
                                  {billableHours.toFixed(2)} <span className="text-muted-foreground font-normal">/ {expected.toFixed(0)} hrs</span>
                                </span>
                              </div>
                              <Progress value={expected > 0 ? Math.min(100, (regularHoursTotal / expected) * 100) : 0} className="h-2" />
                              <p className="text-[11px] text-muted-foreground">Progress reflects billable regular hours toward your weekly target.</p>
                            </div>
                          )}

                          <dl className="space-y-2.5 text-sm">
                            <div className="flex items-center justify-between">
                              <dt className="text-muted-foreground">Regular hours</dt>
                              <dd className="font-semibold">{regularHoursTotal.toFixed(2)} hrs</dd>
                            </div>
                            <div className="flex items-center justify-between">
                              <dt className="text-muted-foreground">OT hours</dt>
                              <dd className={`font-semibold ${otHours > 0 ? 'text-amber-600' : ''}`}>{otHours.toFixed(2)} hrs</dd>
                            </div>
                            {excludedHours > 0 && (
                              <div className="flex items-center justify-between">
                                <dt className="text-muted-foreground">Sunday hours <span className="text-[11px]">(not billed)</span></dt>
                                <dd className="font-semibold text-muted-foreground">{excludedHours.toFixed(2)} hrs</dd>
                              </div>
                            )}
                            {missingHoursTotal > 0 && (
                              <div className="flex items-center justify-between">
                                <dt className="text-muted-foreground">Missing hours</dt>
                                <dd className="font-semibold text-red-600">{missingHoursTotal.toFixed(2)} hrs</dd>
                              </div>
                            )}
                            {expected > 0 && (
                              <div className="flex items-center justify-between pt-2 border-t">
                                <dt className="text-muted-foreground">Weekly target</dt>
                                <dd className="font-medium">{expected.toFixed(2)} hrs</dd>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <dt className="font-medium">Total hours</dt>
                              <dd className="text-base font-bold">{totalHours.toFixed(2)} hrs</dd>
                            </div>
                          </dl>


                          {(rate != null || incentiveAmt > 0) && (
                            <dl className="space-y-2.5 text-sm pt-2 border-t">
                              {rate != null && (
                                <div className="flex items-center justify-between">
                                  <dt className="text-muted-foreground">Hourly rate</dt>
                                  <dd className="font-medium">${rate.toFixed(2)}/hr</dd>
                                </div>
                              )}
                              {incentiveAmt > 0 && (
                                <div className="flex items-center justify-between">
                                  <dt className="text-muted-foreground">Incentives</dt>
                                  <dd className="font-medium">${incentiveAmt.toFixed(2)}</dd>
                                </div>
                              )}
                              {invoiceTotal != null && (
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <dt className="font-medium">Invoice total</dt>
                                  <dd className="text-lg font-bold text-primary">${invoiceTotal.toFixed(2)}</dd>
                                </div>
                              )}
                            </dl>
                          )}


                          {showStatus && !hoursMatch && (
                            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 px-3 py-2 text-xs leading-relaxed">
                              {hoursDiff < 0
                                ? `Add a reason on day(s) where hours are missing (e.g. day off, holiday, sick).`
                                : `Add a reason on day(s) where you worked extra hours.`}
                            </div>
                          )}
                          {showStatus && hoursMatch && (
                            <div className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 px-3 py-2 text-xs">
                              ✓ Matches your weekly target.
                            </div>
                          )}

                          <div className="space-y-2 pt-1 border-t">
                            <Label htmlFor="ot" className="text-xs font-medium">Incentives ($)</Label>
                            <Input
                              id="ot"
                              type="number"
                              step="0.01"
                              min="0"
                              value={overtimeHours}
                              onChange={(e) => setOvertimeHours(e.target.value)}
                              placeholder="0.00"
                              className="h-9 text-base"
                            />
                            {incentiveAmt > 0 && (
                              <Textarea
                                rows={2}
                                value={incentiveNote}
                                onChange={(e) => setIncentiveNote(e.target.value)}
                                placeholder="Reason for incentive (e.g. performance bonus, project completion)"
                                className="text-sm"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </aside>
              </div>


              <div className="space-y-2">
                <Label htmlFor="notes">Please attach your Payoneer request link here</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste your Payoneer payment request link" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    Having issues submitting your Payoneer request? Contact admin via WhatsApp:{' '}
                    <a href="https://wa.me/639982326001" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      +63 998 232 6001
                    </a>
                  </p>
                  <p>
                    Or email us at{' '}
                    <a href="mailto:mark@outsta.io" className="text-primary hover:underline font-medium">mark@outsta.io</a>
                    {' '}/{' '}
                    <a href="mailto:Liezl@outsta.io" className="text-primary hover:underline font-medium">Liezl@outsta.io</a>
                  </p>
                  <p className="pt-1">Please include in your message:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>Your total hours for the week</li>
                    <li>Reason for not completing your hours (if applicable)</li>
                    <li>Reason for OT (if applicable)</li>
                    <li>Reason for the extra amount (if applicable)</li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {editingId && (
                  <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={submitting}>
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => {
                    if (profileIncomplete) {
                      toast({ title: 'Complete your profile first', description: 'Please fill in the required profile details before submitting hours.', variant: 'destructive' });
                      setProfileEditing(true);
                      setProfileOpen(true);
                      return;
                    }
                    handleSubmitClick();
                  }}
                  disabled={submitting || profileIncomplete || !hasWorkDays}
                  title={!hasWorkDays ? 'Set your work days in your profile to enable submission' : (profileIncomplete ? 'Complete your profile to enable submitting' : undefined)}
                >
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {editingId ? 'Save changes' : 'Submit'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Submission history</CardTitle></CardHeader>
          <CardContent className="p-0">
            {timesheets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No submissions yet.</div>
            ) : (
              <TooltipProvider delayDuration={150}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week ending</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Incentives</TableHead>
                    <TableHead>Client Status</TableHead>
                    <TableHead>OutSta Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map((t) => {
                    const clientStatus = (t.client_approval_status || 'pending') as 'pending' | 'approved' | 'flagged';
                    const outstaStatus: 'pending' | 'approved' | 'flagged' =
                      t.outsta_status === 'flagged' || t.status === 'rejected' || t.status === 'flagged' ? 'flagged'
                      : (t.outsta_status === 'approved' || t.status === 'approved') ? 'approved'
                      : 'pending';
                    const submittedAt = t.submitted_at ? new Date(t.submitted_at).getTime() : 0;
                    const minsSince = (Date.now() - submittedAt) / 60000;
                    const withinGrace = minsSince < 3;
                    const isFlagged = clientStatus === 'flagged' || outstaStatus === 'flagged';
                    const bothApproved = clientStatus === 'approved' && outstaStatus === 'approved';
                    const canEdit = !bothApproved && (withinGrace || isFlagged);

                    const renderStatus = (s: 'pending' | 'approved' | 'flagged', who: 'client' | 'outsta') => {
                      const tip = who === 'client'
                        ? (s === 'approved' ? 'Approved by your client' : s === 'flagged' ? 'Flagged by your client for revision' : 'Awaiting client review')
                        : (s === 'approved' ? 'Processed by OutSta' : s === 'flagged' ? 'Flagged by OutSta for revision' : 'Awaiting OutSta review');
                      const cls = s === 'approved'
                        ? 'border-emerald-500 text-emerald-600'
                        : s === 'flagged'
                          ? 'border-amber-500 text-amber-600'
                          : 'border-muted-foreground/30 text-muted-foreground';
                      const label = s === 'approved' ? 'Approved ✅' : s === 'flagged' ? 'Flagged 🚩' : 'Pending';
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium cursor-help ${cls}`}>
                              {label}
                              <Info className="w-3 h-3 opacity-60" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{tip}</TooltipContent>
                        </Tooltip>
                      );
                    };

                    return (
                      <TableRow key={t.id} className={editingId === t.id ? 'bg-muted/40' : ''}>
                        <TableCell>{format(new Date(t.week_ending_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-medium">{Number(t.total_hours).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{Number(t.overtime_hours).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(t.incentive_amount || 0).toFixed(2)}</TableCell>
                        <TableCell>{renderStatus(clientStatus, 'client')}</TableCell>
                        <TableCell>{renderStatus(outstaStatus, 'outsta')}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{t.notes || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(t.submitted_at), 'MMM d, h:mm a')}</TableCell>
                        <TableCell className="text-right">
                          {canEdit ? (
                            <div className="inline-flex items-center gap-2 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(t)}>
                                <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                              </Button>
                              {isFlagged && (
                                <button
                                  type="button"
                                  onClick={() => setFlagDialogTimesheet(t)}
                                  className="inline-flex items-center rounded-full border border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors"
                                >
                                  🚩 See comment
                                </button>
                              )}
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center justify-end text-muted-foreground">
                                  <Lock className="w-3.5 h-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {bothApproved
                                  ? 'Locked — fully approved'
                                  : 'Locked — 3-minute edit window has passed. Ask your client or OutSta to flag it if changes are needed.'}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
          </TabsContent>
          <TabsContent value="checkin" className="mt-0 space-y-3">
            {!hasCheckinToday && info && pendingManagerCheckins > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 px-4 py-2.5 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>You haven't submitted today's check-in yet.</span>
              </div>
            )}
            {info && (
              <DailyCheckin
                contractorAssignmentId={info.contractor_assignment_id}
                contractorName={info.full_name || 'Contractor'}
                jobTitle={info.job_title}
                companyName={info.company_name}
                onSubmitted={() => { setHasCheckinToday(true); setReminderOpen(false); }}
              />
            )}
          </TabsContent>
          <TabsContent value="leave" className="mt-0">
            {info && <LeaveApplication contractorAssignmentId={info.contractor_assignment_id} />}
          </TabsContent>
        </Tabs>
      </main>

      {/* Daily check-in reminder popup */}
      <Dialog open={reminderOpen} onOpenChange={(o) => { if (!o) dismissReminderForToday(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Don't forget your daily check-in! 📋</DialogTitle>
            <DialogDescription>
              Take a minute to complete today's check-in and keep your manager updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={snoozeReminder}>Remind me later</Button>
            <Button onClick={() => { setTabValue('checkin'); setReminderOpen(false); }}>
              Go to Check-in →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!flagDialogTimesheet} onOpenChange={(o) => { if (!o) setFlagDialogTimesheet(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Flag from client</DialogTitle>
            {flagDialogTimesheet?.client_reviewed_at && (
              <DialogDescription>
                Flagged on {format(new Date(flagDialogTimesheet.client_reviewed_at), "MMMM d, yyyy 'at' h:mm a")}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm whitespace-pre-wrap text-amber-900">
              {flagDialogTimesheet?.client_flag_reason?.trim()
                ? flagDialogTimesheet.client_flag_reason
                : 'The client flagged this submission but did not leave a comment.'}
            </div>
            <p className="text-xs text-muted-foreground">
              Please edit your submission to address this comment, then resubmit.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialogTimesheet(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={missingReasonOpen} onOpenChange={setMissingReasonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reason required</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for any missed workdays or overtime hours logged beyond your weekly target.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {missingDays.map((k, idx) => {
              const isOT = (rowOtMap[k]?.otHours || 0) > 0.001;
              const reasonType = isOT ? 'overtime' : 'no hours';
              return (
                <div key={k} className="space-y-1">
                  <Label className="text-sm">
                    {dayLabel(k)} <span className="text-xs text-muted-foreground">({format(new Date(k + 'T00:00:00'), 'MMM d')})</span>{' '}
                    <span className={`text-xs ${isOT ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      ({reasonType})
                    </span>
                  </Label>
                  <Input
                    autoFocus={idx === 0}
                    placeholder={isOT ? 'Reason for overtime (e.g. urgent deadline)' : 'Reason (e.g. day off, holiday, sick)'}
                    value={days[k]?.reason || ''}
                    onChange={(e) => updateDay(k, { reason: e.target.value })}
                  />
                </div>
              );
            })}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const stillMissing = missingDays.filter((k) => !days[k]?.reason?.trim());
                if (stillMissing.length > 0) {
                  setMissingDays(stillMissing);
                  toast({ title: 'Reason still required', description: 'Please fill in all reasons.', variant: 'destructive' });
                  return;
                }
                setMissingReasonOpen(false);
                setConfirmOpen(true);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resolve missing hours: add split shift OR mark as undertime */}
      <Dialog open={!!splitDialogKey} onOpenChange={(o) => { if (!o) setSplitDialogKey(null); }}>
        <DialogContent className="sm:max-w-lg">
          {(() => {
            if (!splitDialogKey) return null;
            const k = splitDialogKey;
            const entry = days[k];
            if (!entry) return null;
            const dLabel = dayLabel(k);
            const dateStr = format(new Date(k + 'T00:00:00'), 'MMM d, yyyy');
            const logged = computeDayBillable(entry, info?.break_duration_minutes, info?.break_is_paid);
            const expected = perDayExpected ?? 0;
            const short = Math.max(0, Number((expected - logged).toFixed(2)));
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Missing hours on {dLabel}</DialogTitle>
                  <DialogDescription>
                    {dateStr} — You logged <strong>{logged.toFixed(2)} hrs</strong> of {expected.toFixed(2)} hrs expected
                    ({short.toFixed(2)} hrs short). How would you like to resolve this?
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 py-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto py-3 justify-start text-left whitespace-normal"
                    onClick={() => {
                      // Seed the split-shift row. Pre-fill time_in_2 with the first shift's
                      // time_out as a starting point; leave time_out_2 empty for the user to fill.
                      updateDay(k, {
                        shifts: (entry.shifts && entry.shifts.length > 0)
                          ? entry.shifts
                          : [{ time_in: entry.time_out || '', time_out: '' }],
                      });
                      setSplitDialogKey(null);
                    }}
                  >
                    <Split className="h-4 w-4 mt-0.5 text-teal-600 shrink-0" />
                    <div className="ml-2 min-w-0">
                      <div className="font-semibold text-sm">Add a split shift</div>
                      <div className="text-xs text-muted-foreground">
                        Log a second time-in / time-out for this day (e.g. 8–10 AM and 4–10 PM).
                      </div>
                    </div>
                  </Button>

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">Mark as undertime</div>
                        <div className="text-xs text-muted-foreground">
                          Keep the logged {logged.toFixed(2)} hrs and explain why you were short.
                        </div>
                      </div>
                    </div>
                    <Label htmlFor="undertime-reason" className="text-xs font-medium">Reason for undertime</Label>
                    <Input
                      id="undertime-reason"
                      placeholder="e.g. left early — doctor's appointment"
                      value={entry.reason || ''}
                      onChange={(e) => updateDay(k, { reason: e.target.value })}
                      autoFocus
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!days[k]?.reason?.trim()) {
                            toast({ title: 'Reason required', description: 'Please provide a reason for the undertime.', variant: 'destructive' });
                            return;
                          }
                          setSplitDialogKey(null);
                        }}
                      >
                        Save undertime
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setSplitDialogKey(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>


      {/* Submission confirmation */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (open) {
            setClientNotified(false);
            setInvoiceMatches(false);
            setExtraAmount('');
            setExtraReason('');
          }
        }}
      >
        <AlertDialogContent className="max-w-4xl sm:max-w-4xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">{editingId ? 'Save changes to this timesheet?' : 'Submit this timesheet?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-lg">
                <div className="text-lg">
                  Week of <strong>{weekStart && format(new Date(weekStart + 'T00:00:00'), 'MMM d')} – {weekEnding && format(new Date(weekEnding + 'T00:00:00'), 'MMM d, yyyy')}</strong> ·{' '}
                  <strong>{totalHours.toFixed(2)}</strong> total hours{excludedHours > 0 && <> (incl. <strong>{excludedHours.toFixed(2)}</strong> Sunday hrs not billed)</>}{otHours > 0 && <> · <strong>{otHours.toFixed(2)}</strong> OT hrs</>} · <strong>${parseFloat(overtimeHours || '0').toFixed(2)}</strong> incentives.
                  {info?.hourly_rate != null && (
                    <> · Invoice total <strong className="text-primary">${(billableHours * Number(info.hourly_rate) + (parseFloat(overtimeHours || '0') || 0)).toFixed(2)}</strong></>
                  )}
                </div>
                {hasPendingApproval && (
                  <div className="text-amber-600 font-medium">
                    ⚠ One or more days exceed 10 hours. This timesheet will be marked <strong>Pending approval</strong> until reviewed by an admin.
                  </div>
                )}
                <div className="space-y-4 pt-3 border-t">
                  <label className="flex items-start gap-3 cursor-pointer text-foreground">
                    <Checkbox
                      checked={clientNotified}
                      onCheckedChange={(v) => setClientNotified(v === true)}
                      className="mt-1 h-5 w-5"
                    />
                    <span className="text-base">
                      I confirm my client was <strong>notified and approved</strong> the hours in this timesheet.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer text-foreground">
                    <Checkbox
                      checked={invoiceMatches}
                      onCheckedChange={(v) => setInvoiceMatches(v === true)}
                      className="mt-1 h-5 w-5"
                    />
                    <span className="text-base">
                      The total amount{info?.hourly_rate != null && (
                        <> (<strong className="text-primary">${(billableHours * Number(info.hourly_rate) + (parseFloat(overtimeHours || '0') || 0)).toFixed(2)}</strong>)</>
                      )} <strong>matches my Payoneer invoice</strong> request.
                    </span>
                  </label>
                  {!invoiceMatches && (
                    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4">
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                        Invoice doesn't match? Please add the extra amount on top and explain the reason.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="extra-amt" className="text-sm">Extra amount on top ($)</Label>
                        <Input
                          id="extra-amt"
                          type="number"
                          step="0.01"
                          min="0"
                          value={extraAmount}
                          onChange={(e) => setExtraAmount(e.target.value)}
                          placeholder="0.00"
                          className="h-10 text-base"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="extra-reason" className="text-sm">Reason for the extra amount</Label>
                        <Textarea
                          id="extra-reason"
                          rows={3}
                          value={extraReason}
                          onChange={(e) => setExtraReason(e.target.value)}
                          placeholder="Explain why the invoice total differs (e.g. reimbursement, bonus, missed hours)"
                          className="text-base"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performSubmit(); }}
              disabled={
                submitting ||
                !clientNotified ||
                (!invoiceMatches && (!(parseFloat(extraAmount || '0') > 0) || !extraReason.trim()))
              }
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TimesheetTutorialDialog open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </div>
  );
};

export default PortalDashboard;
