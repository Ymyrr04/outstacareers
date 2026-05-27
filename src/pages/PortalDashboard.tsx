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
import { Loader2, LogOut, Pencil, CalendarIcon, UserCircle2, Check, ChevronsUpDown, HelpCircle } from 'lucide-react';
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
}

interface DayEntry {
  time_in: string;  // "HH:MM" 24h
  time_out: string; // "HH:MM" 24h
  hours: string;    // computed string e.g. "8.50"
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
  submitted_at: string;
  daily_hours: Record<string, { hours: number; time_in?: string; time_out?: string; reason?: string }> | null;
}

// Compute decimal hours between two "HH:MM" times. If time_out <= time_in, treat as overnight (+24h).
const computeHours = (timeIn: string, timeOut: string): number => {
  if (!timeIn || !timeOut) return 0;
  const [ih, im] = timeIn.split(':').map(Number);
  const [oh, om] = timeOut.split(':').map(Number);
  if ([ih, im, oh, om].some((n) => isNaN(n))) return 0;
  let start = ih * 60 + im;
  let end = oh * 60 + om;
  if (end <= start) end += 24 * 60; // overnight shift
  return Math.round(((end - start) / 60) * 100) / 100;
};

const formatHoursLabel = (h: number) => (h > 0 ? h.toFixed(2) : '0.00');

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Returns the Monday of the current week (week starts Monday)
const getDefaultWeekStart = () => {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return monday.toISOString().split('T')[0];
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

const emptyDaysFor = (keys: string[]): Record<string, DayEntry> =>
  Object.fromEntries(keys.map((k) => [k, { time_in: '', time_out: '', hours: '', reason: '' }]));


const ProfileField = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="text-sm mt-0.5 break-words">{value != null && value !== '' ? value : <span className="text-muted-foreground">—</span>}</div>
  </div>
);

const PortalDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<ContractorInfo | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientNotified, setClientNotified] = useState(false);
  const [invoiceMatches, setInvoiceMatches] = useState(false);
  const [missingReasonOpen, setMissingReasonOpen] = useState(false);
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const emptyProfileForm: ProfileForm = {
    full_name: '', phone: '', whatsapp: '', location: '', country: '',
    contact_number: '', emergency_number: '', hours_per_week: '',
    hourly_rate: '', regular_work_shift: '',
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

  const totalHours = useMemo(() => {
    return dateKeys.reduce((sum, k) => {
      const v = parseFloat(days[k]?.hours || '0');
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [days, dateKeys]);


  const loadAll = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      navigate('/portal/login');
      return;
    }

    const { data: portal } = await supabase
      .from('contractor_portal_users')
      .select('contractor_assignment_id, must_change_password')
      .eq('user_id', session.session.user.id)
      .maybeSingle();

    if (!portal) {
      await supabase.auth.signOut();
      navigate('/portal/login');
      return;
    }
    if (portal.must_change_password) {
      navigate('/portal/change-password');
      return;
    }

    const { data: assignment } = await supabase
      .from('contractor_assignments')
      .select('id, applicant_id, job_title, hourly_rate, hours_per_week, regular_work_shift, contact_number, emergency_number, country, applicant:applicants_prescreen(full_name, email, phone, whatsapp, location), client:clients(company_name)')
      .eq('id', portal.contractor_assignment_id)
      .maybeSingle();

    const applicant = (assignment?.applicant as any) || {};
    const nextInfo: ContractorInfo = {
      contractor_assignment_id: portal.contractor_assignment_id,
      applicant_id: assignment?.applicant_id || '',
      job_title: assignment?.job_title || null,
      company_name: (assignment?.client as any)?.company_name || null,
      full_name: applicant.full_name || null,
      hourly_rate: assignment?.hourly_rate ?? null,
      hours_per_week: assignment?.hours_per_week ?? null,
      regular_work_shift: assignment?.regular_work_shift || null,
      contact_number: assignment?.contact_number || null,
      emergency_number: assignment?.emergency_number || null,
      country: assignment?.country || null,
      email: applicant.email || null,
      phone: applicant.phone || null,
      whatsapp: applicant.whatsapp || null,
      location: applicant.location || null,
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

    const { data: ts } = await supabase
      .from('contractor_timesheets')
      .select('id, week_ending_date, total_hours, overtime_hours, incentive_amount, notes, status, submitted_at, daily_hours')
      .eq('contractor_assignment_id', portal.contractor_assignment_id)
      .order('week_ending_date', { ascending: false });

    setTimesheets((ts as any) || []);
    setLoading(false);
  };

  // Computed: profile is missing required fields
  const profileIncomplete = !info
    ? false
    : (!info.full_name ||
       !info.phone ||
       !info.regular_work_shift ||
       info.hours_per_week == null ||
       info.hourly_rate == null);

  useEffect(() => { loadAll(); }, []);

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

  // Returns list of day keys that are empty (no hours entered)
  const getEmptyDays = (): string[] =>
    dateKeys.filter((k) => {
      const raw = days[k]?.hours;
      return raw === '' || raw == null || parseFloat(raw) === 0;
    });

  // Returns list of day keys that exceed 10 hours (require overtime justification)
  const getOvertimeDays = (): string[] =>
    dateKeys.filter((k) => {
      const v = parseFloat(days[k]?.hours || '0');
      return !isNaN(v) && v > 10;
    });

  // Expected hours = the contractor's weekly target from their profile (always, regardless of date range)
  const expectedHours = useMemo(() => {
    const hpw = info?.hours_per_week ? Number(info.hours_per_week) : null;
    if (!hpw || dateKeys.length === 0) return null;
    return hpw;
  }, [info?.hours_per_week, dateKeys]);

  const hoursDiff = useMemo(() => {
    if (expectedHours == null) return 0;
    return Number((totalHours - expectedHours).toFixed(2));
  }, [totalHours, expectedHours]);

  // Tolerance: anything within ±0.25h is considered matching
  const hoursMatch = expectedHours == null ? true : Math.abs(hoursDiff) <= 0.25;

  // OT hours = anything worked beyond the weekly target
  const otHours = useMemo(() => {
    if (expectedHours == null) return 0;
    return Math.max(0, Number((totalHours - expectedHours).toFixed(2)));
  }, [totalHours, expectedHours]);

  // Per-day expected hours (e.g., 50hrs/week ÷ 5 = 10hrs/day)
  const perDayExpected = useMemo(() => {
    const hpw = info?.hours_per_week ? Number(info.hours_per_week) : null;
    if (!hpw) return null;
    return hpw / 5;
  }, [info?.hours_per_week]);

  // When over expected: days with > per-day target need a reason explaining the extra time
  const getOverHoursDays = (): string[] => {
    if (expectedHours == null || hoursDiff <= 0.25 || perDayExpected == null) return [];
    return dateKeys.filter((k) => {
      const v = parseFloat(days[k]?.hours || '0');
      return !isNaN(v) && v > 0 && v >= perDayExpected;
    });
  };

  // When under expected: days with hours entered but below per-day target need a reason
  const getUnderHoursDays = (): string[] => {
    if (expectedHours == null || hoursDiff >= -0.25 || perDayExpected == null) return [];
    return dateKeys.filter((k) => {
      const raw = days[k]?.hours;
      if (raw === '' || raw == null) return false;
      const v = parseFloat(raw);
      return !isNaN(v) && v > 0 && v < perDayExpected;
    });
  };

  const hasPendingApproval = useMemo(() => getOvertimeDays().length > 0, [days, dateKeys]);

  const handleSubmitClick = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!info) return;
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
    // Require Payoneer payment request link
    const trimmedNotes = notes.trim();
    const hasLink = /https?:\/\/\S+/i.test(trimmedNotes) || /payoneer\.com\/\S+/i.test(trimmedNotes);
    if (!hasLink) {
      toast({
        title: 'Payoneer link required',
        description: 'Please paste your Payoneer payment request link before submitting. Having issues? Contact admin via WhatsApp: +63 998 232 6001',
        variant: 'destructive',
      });
      return;
    }
    setConfirmOpen(true);
  };

  const performSubmit = async () => {
    if (!info) return;
    if (!validateNumbers()) return;
    const ot = parseFloat(overtimeHours || '0');

    const dailyPayload: Record<string, { hours: number; reason?: string; weekday?: string }> = {};
    dateKeys.forEach((k) => {
      const h = parseFloat(days[k]?.hours || '0') || 0;
      const reason = days[k]?.reason?.trim() || '';
      dailyPayload[k] = { hours: h, weekday: dayLabel(k), ...(reason ? { reason } : {}) };
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

      const { error } = await supabase.from('contractor_timesheets').upsert({
        contractor_assignment_id: info.contractor_assignment_id,
        week_ending_date: weekEnding,
        total_hours: totalHours,
        overtime_hours: otHours,
        incentive_amount: ot,
        notes: combinedNotes || null,
        daily_hours: dailyPayload,
        status: needsApproval ? 'pending_approval' : 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'contractor_assignment_id,week_ending_date' });
      if (error) throw error;
      toast({
        title: editingId ? 'Timesheet updated' : 'Timesheet submitted',
        description: needsApproval ? 'Days over 10 hours are pending admin approval.' : undefined,
      });
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
        if (d) next[k] = { hours: d.hours != null ? String(d.hours) : '', reason: d.reason || '' };
      });
    } else {
      // Legacy: map mon/tue/... in order onto the 7 generated keys
      const legacy = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      keys.forEach((k, i) => {
        const d = dh[legacy[i]];
        if (d) next[k] = { hours: d.hours != null ? String(d.hours) : '', reason: d.reason || '' };
      });
    }

    setDays(next);
    setOvertimeHours(String(t.incentive_amount ?? 0));
    setIncentiveNote('');
    setExtraAmount('');
    setExtraReason('');
    setNotes(t.notes || '');
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
    setProfileSaving(true);
    try {
      const { error: aErr } = await supabase
        .from('contractor_assignments')
        .update({
          hourly_rate: rate,
          hours_per_week: hpw,
          regular_work_shift: profileForm.regular_work_shift.trim() || null,
        })
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

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  const updateDay = (k: string, patch: Partial<DayEntry>) => {
    setDays((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet><title>My Timesheets | OutSta PL Portal</title></Helmet>
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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
                Required: Full name, Phone, Regular work shift, Hours per week, and Current rate.
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

        <Tabs defaultValue="timesheet" className="space-y-6">
          <TabsList>
            <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
            <TabsTrigger value="checkin">Check-in</TabsTrigger>
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
            <form onSubmit={handleSubmitClick} onKeyDown={handleFormKeyDown} className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Date range</Label>
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
                          'w-full justify-start text-left font-normal',
                          !weekStart && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
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
                  {weekStart && weekEnd && !dateRangeValid && (
                    <p className="text-xs text-destructive">"To" must be on or after "From".</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <Label htmlFor="ot" className="text-xs">Incentives ($)</Label>
                    <Input
                      id="ot"
                      type="number"
                      step="0.01"
                      min="0"
                      value={overtimeHours}
                      onChange={(e) => setOvertimeHours(e.target.value)}
                      placeholder="0.00"
                      className="h-9 w-28 text-base"
                    />
                  </div>
                  <div className="flex items-center gap-4 text-lg pb-1">
                    <div>
                      Total: <span className="font-semibold">{totalHours.toFixed(2)}</span> hrs
                    </div>
                    <div className="text-muted-foreground">|</div>
                    <div>
                      Invoice total:{' '}
                      <span className="font-semibold text-primary">
                        {info?.hourly_rate != null
                          ? `$${(totalHours * Number(info.hourly_rate) + (parseFloat(overtimeHours || '0') || 0)).toFixed(2)}`
                          : '—'}
                      </span>
                      {info?.hourly_rate != null && (
                        <span className="text-muted-foreground ml-1 text-sm">
                          (@ ${Number(info.hourly_rate).toFixed(2)}/hr{parseFloat(overtimeHours || '0') > 0 ? ` + $${parseFloat(overtimeHours).toFixed(2)} incentive` : ''})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {parseFloat(overtimeHours || '0') > 0 && (
                  <Textarea
                    rows={2}
                    value={incentiveNote}
                    onChange={(e) => setIncentiveNote(e.target.value)}
                    placeholder="Reason for incentive (e.g. performance bonus, project completion)"
                    className="text-sm"
                  />
                )}
                {expectedHours != null && dateKeys.length > 0 && (
                  hoursMatch ? (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 px-3 py-2 text-xs">
                      ✓ Matches your weekly target ({expectedHours.toFixed(2)} hrs/week from your profile).
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
                      <span className="font-semibold">
                        {hoursDiff < 0
                          ? `Missing ${Math.abs(hoursDiff).toFixed(2)} hrs`
                          : `Over by ${hoursDiff.toFixed(2)} hrs`}
                      </span>{' '}
                      — Expected {expectedHours.toFixed(2)} hrs/week (from your profile).{' '}
                      {hoursDiff < 0
                        ? 'Please add a Reason on the day(s) where hours are missing (e.g. day off, holiday, sick).'
                        : 'Please add a Reason on the day(s) where you worked extra hours.'}
                    </div>
                  )
                )}
                <Label className="block pt-1">Hours per day</Label>
                <div className="space-y-2">
                  {dateKeys.length === 0 && (
                    <p className="text-sm text-muted-foreground p-3 border rounded-md">
                      Select a valid date range to enter hours.
                    </p>
                  )}
                  {dateKeys.map((k) => {
                    const date = new Date(k + 'T00:00:00');
                    const entry = days[k] || { hours: '', reason: '' };
                    const hoursNum = parseFloat(entry.hours || '0');
                    const isOvertime = !isNaN(hoursNum) && hoursNum > 10;
                    const isOverTarget =
                      perDayExpected != null && !isNaN(hoursNum) && hoursNum > 0 && hoursNum >= perDayExpected && hoursDiff > 0.25;
                    const isUnderTarget =
                      perDayExpected != null &&
                      entry.hours !== '' &&
                      !isNaN(hoursNum) &&
                      hoursNum > 0 &&
                      hoursNum < perDayExpected &&
                      hoursDiff < -0.25;
                    const needsReason = isOvertime || isOverTarget || isUnderTarget;
                    const reasonLabel = isOvertime
                      ? '(required — overtime)'
                      : isOverTarget
                      ? '(required — over target)'
                      : isUnderTarget
                      ? '(required — under target)'
                      : '(only if no hours)';
                    const reasonPlaceholder = isOvertime
                      ? 'e.g. urgent deadline'
                      : isOverTarget
                      ? 'e.g. compensation, extra workload'
                      : isUnderTarget
                      ? 'e.g. half day, left early, sick'
                      : 'Optional — e.g. day off, holiday, sick';
                    const label = dayLabel(k);
                    return (
                      <div
                        key={k}
                        className={`grid grid-cols-1 md:grid-cols-[180px_180px_1fr] gap-4 p-4 items-center rounded-lg border-2 shadow-sm bg-background ${
                          needsReason
                            ? 'border-amber-500/50'
                            : 'border-blue-300/10 dark:border-blue-800/10'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-sm">{label}</div>
                          <div className="text-xs text-muted-foreground">{format(date, 'MMM d, yyyy')}</div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`hrs-${k}`} className="text-xs font-medium text-muted-foreground">Hours worked</Label>
                          <Input
                            id={`hrs-${k}`}
                            type="number"
                            step="0.25"
                            min="0"
                            max="24"
                            placeholder="0"
                            value={entry.hours}
                            onChange={(e) => updateDay(k, { hours: e.target.value })}
                            aria-label={`${label} ${format(date, 'MMM d')} hours`}
                            className={`bg-background border-2 ${needsReason ? 'border-amber-500 focus-visible:ring-amber-500' : 'border-blue-300 dark:border-blue-700 focus-visible:ring-blue-500'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`reason-${k}`} className="text-xs font-medium text-muted-foreground">
                            Reason {reasonLabel}
                          </Label>
                          <Input
                            id={`reason-${k}`}
                            placeholder={reasonPlaceholder}
                            value={entry.reason}
                            onChange={(e) => updateDay(k, { reason: e.target.value })}
                            className={`bg-background border-2 ${needsReason ? 'border-amber-500 focus-visible:ring-amber-500' : 'border-blue-300 dark:border-blue-700 focus-visible:ring-blue-500'}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Please attach your Payoneer request link here <span className="text-destructive">*</span></Label>
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
                  disabled={submitting || profileIncomplete}
                  title={profileIncomplete ? 'Complete your profile to enable submitting' : undefined}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week ending</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Incentives</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map((t) => (
                    <TableRow key={t.id} className={editingId === t.id ? 'bg-muted/40' : ''}>
                      <TableCell>{format(new Date(t.week_ending_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-medium">{Number(t.total_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{Number(t.overtime_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(t.incentive_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {t.status === 'pending_approval' ? (
                          <span className="inline-flex items-center rounded-full border border-amber-500 text-amber-600 px-2 py-0.5 text-xs font-medium">Pending approval</span>
                        ) : t.status === 'approved' ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-500 text-emerald-600 px-2 py-0.5 text-xs font-medium">Approved</span>
                        ) : t.status === 'rejected' ? (
                          <span className="inline-flex items-center rounded-full border border-destructive text-destructive px-2 py-0.5 text-xs font-medium">Rejected</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-muted-foreground/30 text-muted-foreground px-2 py-0.5 text-xs font-medium capitalize">{t.status}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{t.notes || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(t.submitted_at), 'MMM d, h:mm a')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(t)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
          </TabsContent>
          <TabsContent value="checkin" className="mt-0">
            {info && (
              <DailyCheckin
                contractorAssignmentId={info.contractor_assignment_id}
                contractorName={info.full_name || 'Contractor'}
                jobTitle={info.job_title}
                companyName={info.company_name}
              />
            )}
          </TabsContent>
          <TabsContent value="leave" className="mt-0">
            {info && <LeaveApplication contractorAssignmentId={info.contractor_assignment_id} />}
          </TabsContent>
        </Tabs>
      </main>

      {/* Missing reason prompt — collect reasons inline */}
      <AlertDialog open={missingReasonOpen} onOpenChange={setMissingReasonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reason required</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a short reason for the day(s) below. Empty days need a reason, and days over 10 hours require admin approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {missingDays.map((k, idx) => {
              const hoursNum = parseFloat(days[k]?.hours || '0');
              const isOvertime = !isNaN(hoursNum) && hoursNum > 10;
              return (
                <div key={k} className="space-y-1">
                  <Label className="text-sm">
                    {dayLabel(k)} <span className="text-xs text-muted-foreground">({format(new Date(k + 'T00:00:00'), 'MMM d')})</span>{' '}
                    <span className={`text-xs ${isOvertime ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      ({isOvertime ? `${hoursNum} hrs — needs approval` : 'no hours'})
                    </span>
                  </Label>
                  <Input
                    autoFocus={idx === 0}
                    placeholder={isOvertime ? 'Reason for overtime (e.g. urgent deadline)' : 'Reason (e.g. day off, holiday, sick)'}
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
                  <strong>{totalHours.toFixed(2)}</strong> total hours{otHours > 0 && <> (incl. <strong>{otHours.toFixed(2)}</strong> OT hrs)</>} · <strong>${parseFloat(overtimeHours || '0').toFixed(2)}</strong> incentives.
                  {info?.hourly_rate != null && (
                    <> · Invoice total <strong className="text-primary">${(totalHours * Number(info.hourly_rate) + (parseFloat(overtimeHours || '0') || 0)).toFixed(2)}</strong></>
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
                        <> (<strong className="text-primary">${(totalHours * Number(info.hourly_rate) + (parseFloat(overtimeHours || '0') || 0)).toFixed(2)}</strong>)</>
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
