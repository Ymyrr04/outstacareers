import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogOut, Pencil, CalendarIcon } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { addDays, format, startOfWeek } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

interface ContractorInfo {
  contractor_assignment_id: string;
  job_title: string | null;
  company_name: string | null;
  full_name: string | null;
  hourly_rate: number | null;
}

interface DayEntry {
  hours: string; // string for input control
  reason: string;
}

interface Timesheet {
  id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  notes: string | null;
  status: string;
  submitted_at: string;
  daily_hours: Record<string, { hours: number; reason?: string }> | null;
}

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
  Object.fromEntries(keys.map((k) => [k, { hours: '', reason: '' }]));


const PortalDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<ContractorInfo | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [missingReasonOpen, setMissingReasonOpen] = useState(false);
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [days, setDays] = useState<Record<string, DayEntry>>({});
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [notes, setNotes] = useState('');

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
        next[k] = prev[k] || { hours: '', reason: '' };
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
      .select('id, job_title, hourly_rate, applicant:applicants_prescreen(full_name), client:clients(company_name)')
      .eq('id', portal.contractor_assignment_id)
      .maybeSingle();

    setInfo({
      contractor_assignment_id: portal.contractor_assignment_id,
      job_title: assignment?.job_title || null,
      company_name: (assignment?.client as any)?.company_name || null,
      full_name: (assignment?.applicant as any)?.full_name || null,
      hourly_rate: assignment?.hourly_rate || null,
    });

    const { data: ts } = await supabase
      .from('contractor_timesheets')
      .select('id, week_ending_date, total_hours, overtime_hours, notes, status, submitted_at, daily_hours')
      .eq('contractor_assignment_id', portal.contractor_assignment_id)
      .order('week_ending_date', { ascending: false });

    setTimesheets((ts as any) || []);
    setLoading(false);
  };

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
    if (isNaN(ot) || ot < 0 || ot > totalHours) {
      toast({ title: 'Invalid overtime', description: 'Overtime cannot exceed total hours.', variant: 'destructive' });
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
    const missingReason = [...empties, ...overtimes].filter((k) => !days[k]?.reason?.trim());
    if (missingReason.length > 0) {
      setMissingDays(missingReason);
      setMissingReasonOpen(true);
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
      const { error } = await supabase.from('contractor_timesheets').upsert({
        contractor_assignment_id: info.contractor_assignment_id,
        week_ending_date: weekEnding,
        total_hours: totalHours,
        overtime_hours: ot,
        notes: notes.trim() || null,
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
    setOvertimeHours(String(t.overtime_hours));
    setNotes(t.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setWeekStart('');
    setWeekEnd('');
    setDateRange(undefined);
    setDays({});
    setOvertimeHours('0');
    setNotes('');
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
          <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Weekly Hours' : 'Submit Weekly Hours'}</CardTitle>
            <CardDescription>
              {editingId
                ? 'Update the entry below and click Save to confirm changes.'
                : 'Pick the date range (From – To) and enter the hours you worked each day.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitClick} onKeyDown={handleFormKeyDown} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date range</Label>
                  <Popover>
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
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        showOutsideDays={false}
                        defaultMonth={dateRange?.from ?? new Date()}
                        selected={dateRange}
                        onSelect={(range: DateRange | undefined) => {
                          setDateRange(range);
                          setWeekStart(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
                          setWeekEnd(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
                        }}
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
                    </PopoverContent>
                  </Popover>
                  {weekStart && weekEnd && !dateRangeValid && (
                    <p className="text-xs text-destructive">"To" must be on or after "From".</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ot">Overtime hours (within total)</Label>
                  <Input id="ot" type="number" step="0.25" min="0" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Hours per day</Label>
                  <div className="text-sm">
                    Total: <span className="font-semibold">{totalHours.toFixed(2)}</span> hrs
                  </div>
                </div>
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
                    const label = dayLabel(k);
                    return (
                      <div
                        key={k}
                        className={`grid grid-cols-1 md:grid-cols-[180px_180px_1fr] gap-4 p-4 items-center rounded-lg border-2 shadow-sm bg-background ${
                          isOvertime
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
                            className={`bg-background border-2 ${isOvertime ? 'border-amber-500 focus-visible:ring-amber-500' : 'border-blue-300 dark:border-blue-700 focus-visible:ring-blue-500'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`reason-${k}`} className="text-xs font-medium text-muted-foreground">
                            Reason {isOvertime ? '(required — overtime)' : '(only if no hours)'}
                          </Label>
                          <Input
                            id={`reason-${k}`}
                            placeholder={isOvertime ? 'e.g. urgent deadline' : 'Optional — e.g. day off, holiday, sick'}
                            value={entry.reason}
                            onChange={(e) => updateDay(k, { reason: e.target.value })}
                            className={`bg-background border-2 ${isOvertime ? 'border-amber-500 focus-visible:ring-amber-500' : 'border-blue-300 dark:border-blue-700 focus-visible:ring-blue-500'}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Holidays, leave, special tasks, etc." />
              </div>

              <div className="flex justify-end gap-2">
                {editingId && (
                  <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={submitting}>
                    Cancel
                  </Button>
                )}
                <Button type="button" onClick={() => handleSubmitClick()} disabled={submitting}>
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
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editingId ? 'Save changes to this timesheet?' : 'Submit this timesheet?'}</AlertDialogTitle>
            <AlertDialogDescription>
              Week of <strong>{weekStart && format(new Date(weekStart + 'T00:00:00'), 'MMM d')} – {weekEnding && format(new Date(weekEnding + 'T00:00:00'), 'MMM d, yyyy')}</strong> ·{' '}
              <strong>{totalHours.toFixed(2)}</strong> total hours · <strong>{overtimeHours || '0'}</strong> overtime.
              {hasPendingApproval && (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠ One or more days exceed 10 hours. This timesheet will be marked <strong>Pending approval</strong> until reviewed by an admin.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); performSubmit(); }} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PortalDashboard;
