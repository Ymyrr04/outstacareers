import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { CalendarAdmin } from '@/hooks/useCalendarAdmins';
import {
  EVENT_TYPES,
  RECURRENCE_OPTIONS,
  formatDateLong,
  formatMinutes,
  inputToMinutes,
  minutesToInput,
  weekdayOf,
  daysBetween,
  dayOfMonth,
  todayET,
  addDays,
  parseDateString,
  PipelineLink,
} from '@/lib/calendarTime';
import PipelineLinkSelect from './PipelineLinkSelect';
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

const UNASSIGNED = '__unassigned__';

/** Dot color per activity type chip (custom types cycle through a palette). */
const TYPE_DOT: Record<string, string> = {
  task: 'bg-brand',
  meeting: 'bg-brand',
  interview: 'bg-brand',
  followup: 'bg-amber-500',
  deadline: 'bg-red-500',
};
const CUSTOM_DOTS = ['bg-brand', 'bg-amber-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500', 'bg-sky-500'];




interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  defaultStart: number;
  defaultEnd?: number;
  defaultAdminId?: string;
  defaultAssignees?: string[];
  admins: CalendarAdmin[];
  currentUserId?: string;
  onSaved: (date: string) => void;
  /** When provided, the modal edits this existing activity instead of creating a new one. */
  editEvent?: import('@/hooks/useCalendarEvents').CalendarEvent | null;
}

export const AddActivityModal = ({
  open,
  onOpenChange,
  date,
  defaultStart,
  defaultEnd,
  defaultAdminId,
  defaultAssignees,
  admins,
  currentUserId,
  onSaved,
  editEvent,
}: Props) => {
  const { toast } = useToast();
  const { notifyCalendarActivity } = useSlackNotifications();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('task');
  const [adminId, setAdminId] = useState('');
  const [extraAssignees, setExtraAssignees] = useState<string[]>([]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [dateValue, setDateValue] = useState(date);

  /** When start changes, keep the current duration: new end = new start + (old end − old start). */
  const handleStartChange = (val: string) => {
    const oldS = inputToMinutes(start);
    const oldE = inputToMinutes(end);
    const dur = Math.max(30, oldE - oldS);
    setStart(val);
    const sMin = inputToMinutes(val);
    let eMin = sMin + dur;
    if (eMin > 23 * 60 + 59) eMin = 23 * 60 + 59;
    setEnd(minutesToInput(eMin));
  };
  const [noTime, setNoTime] = useState(false);
  const [showFreeTimes, setShowFreeTimes] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [notifySlack, setNotifySlack] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);


  const [description, setDescription] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [pipelineLink, setPipelineLink] = useState<PipelineLink | null>(null);
  const [showDesc, setShowDesc] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<{ value: string; label: string }[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [creatingType, setCreatingType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);
  const [dayEvents, setDayEvents] = useState<
    { id: string; title: string; start_time: number; end_time: number; assigned_to: string[] | null; created_by: string | null }[]
  >([]);

  // Load events occurring on this date (including recurring ones) to detect conflicts
  useEffect(() => {
    if (!open || !dateValue) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('id,title,event_date,start_time,end_time,assigned_to,created_by,is_recurring,recurrence_rule')
        .or(`event_date.eq.${dateValue},is_recurring.eq.true`);
      if (cancelled) return;
      const dow = weekdayOf(dateValue);
      const occurring = (data || []).filter((e: any) => {
        if (editEvent && e.id === editEvent.id) return false;
        if (e.event_date === dateValue) return true;
        if (e.is_recurring && e.event_date < dateValue) {
          const rule = e.recurrence_rule || 'weekly';
          if (rule === 'weekly') return weekdayOf(e.event_date) === dow;
          if (rule === 'biweekly')
            return weekdayOf(e.event_date) === dow && daysBetween(e.event_date, dateValue) % 14 === 0;
          if (rule === 'monthly') return dayOfMonth(e.event_date) === dayOfMonth(dateValue);
        }
        return false;
      });
      setDayEvents(occurring as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dateValue, editEvent]);

  const isUnassigned = adminId === UNASSIGNED;
  const startMin = inputToMinutes(start);
  const endMin = inputToMinutes(end);
  const durationMin = endMin - startMin;
  const durationLabel = (() => {
    if (durationMin <= 0) return null;
    const hrs = Math.floor(durationMin / 60);
    const mins = durationMin % 60;
    const hrText = hrs > 0 ? `${hrs} hr${hrs > 1 ? 's' : ''}` : null;
    const minText = mins > 0 ? `${mins} min` : null;
    return [hrText, minText].filter(Boolean).join(' ');
  })();


  /** admin user_id -> conflicting event (first overlap found) */
  const conflicts = new Map<string, { title: string; start_time: number; end_time: number }>();
  if (endMin > startMin) {
    for (const ev of dayEvents) {
      if (!(ev.start_time < endMin && ev.end_time > startMin)) continue;
      const people = new Set<string>([...(ev.assigned_to || []), ...(ev.created_by ? [ev.created_by] : [])]);
      for (const p of people) {
        if (!conflicts.has(p)) conflicts.set(p, ev);
      }
    }
  }

  const conflictLabel = (userId: string) => {
    const c = conflicts.get(userId);
    return c ? `Busy ${formatMinutes(c.start_time)}–${formatMinutes(c.end_time)} · ${c.title}` : null;
  };

  // Inline conflict alert: owner first, then extra assignees who are busy
  const ownerId = isUnassigned ? undefined : adminId || currentUserId;
  const conflictPeople: { id: string; name: string; ev: { title: string; start_time: number; end_time: number } }[] = [];
  if (!isUnassigned && !noTime && endMin > startMin) {
    if (ownerId && conflicts.has(ownerId)) {
      conflictPeople.push({
        id: ownerId,
        name: admins.find((a) => a.user_id === ownerId)?.name ?? 'Owner',
        ev: conflicts.get(ownerId)!,
      });
    }
    for (const id of extraAssignees) {
      if (id !== ownerId && conflicts.has(id)) {
        conflictPeople.push({
          id,
          name: admins.find((a) => a.user_id === id)?.name ?? 'Admin',
          ev: conflicts.get(id)!,
        });
      }
    }
  }

  /** Everyone (owner + extra assignees) free for [s, s + duration)? */
  const isFreeAt = (s: number) => {
    const dur = Math.max(30, durationMin);
    const e = s + dur;
    const people = new Set<string>([...(ownerId ? [ownerId] : []), ...extraAssignees]);
    for (const ev of dayEvents) {
      if (!(ev.start_time < e && ev.end_time > s)) continue;
      const evPeople = new Set<string>([...(ev.assigned_to || []), ...(ev.created_by ? [ev.created_by] : [])]);
      for (const p of people) if (evPeople.has(p)) return false;
    }
    return true;
  };

  // Earliest start after the current one where everyone is free (before 6:00 PM)
  let suggestedStart: number | null = null;
  if (conflictPeople.length > 0) {
    for (let s = startMin + 30; s < 18 * 60; s += 30) {
      if (isFreeAt(s)) { suggestedStart = s; break; }
    }
  }

  // Free 30-minute slots from 8:00 AM to 6:00 PM (up to six chips)
  const freeStarts: number[] = [];
  if (conflictPeople.length > 0) {
    for (let s = 8 * 60; s < 18 * 60 && freeStarts.length < 6; s += 30) {
      if (isFreeAt(s)) freeStarts.push(s);
    }
  }

  const allTypes = [
    ...EVENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
    ...customTypes.filter((c) => !EVENT_TYPES.some((t) => t.value === c.value)),
  ];

  const loadTypes = async () => {
    const { data } = await supabase
      .from('calendar_event_types')
      .select('value,label')
      .order('label', { ascending: true });
    setCustomTypes((data as { value: string; label: string }[]) || []);
  };

  useEffect(() => {
    if (open) loadTypes();
  }, [open]);

  const handleCreateType = async () => {
    const label = newType.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!value) return;
    setCreatingType(true);
    const { error: dbError } = await supabase
      .from('calendar_event_types')
      .insert({ label, value, created_by: currentUserId ?? null });
    setCreatingType(false);
    if (dbError && !dbError.message.includes('duplicate')) {
      toast({ title: 'Could not save type', description: dbError.message, variant: 'destructive' });
      return;
    }
    await loadTypes();
    setType(value);
    setNewType('');
    setAddingType(false);
  };

  useEffect(() => {
    if (!open) return;
    setAddingType(false);
    setNewType('');
    setError(null);
    setDetailsOpen(true);
    setShowFreeTimes(false);

    setDateValue(editEvent?.event_date ?? date);
    setShowDesc(!!editEvent?.description?.trim());
    setShowLink(!!editEvent?.pipeline_link);
    setShowRepeat(!!editEvent?.is_recurring);

    if (editEvent) {
      setTitle(editEvent.title);
      setType(editEvent.event_type);
      setDescription(editEvent.description ?? '');
      setRepeat(editEvent.is_recurring ? editEvent.recurrence_rule || 'weekly' : 'none');
      setPipelineLink(editEvent.pipeline_link ?? null);
      setNoTime(!!editEvent.time_tbd);
      setNotifySlack(false);
      setAdminId(editEvent.is_open_task ? UNASSIGNED : editEvent.created_by || '');
      setExtraAssignees((editEvent.assigned_to || []).filter((id) => id !== editEvent.created_by));
      setStart(minutesToInput(editEvent.start_time));
      setEnd(minutesToInput(editEvent.end_time));
      return;
    }

    setTitle('');
    setType('task');
    setDescription('');
    setRepeat('none');
    setPipelineLink(null);
    setNoTime(false);
    setNotifySlack(false);
    setExtraAssignees(defaultAssignees ?? []);

    setAdminId(defaultAdminId || currentUserId || admins[0]?.user_id || '');
    setStart(minutesToInput(defaultStart));
    setEnd(minutesToInput(Math.min(defaultEnd ?? defaultStart + 60, 23 * 60 + 59)));
  }, [open, editEvent, defaultStart, defaultEnd, defaultAdminId, defaultAssignees, currentUserId, admins]);

  const handleSave = async (force = false) => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      titleRef.current?.focus();
      return;
    }
    const s = noTime ? 9 * 60 : inputToMinutes(start);
    const e = noTime ? 10 * 60 : inputToMinutes(end);
    if (!noTime && e <= s) {
      setError('End time must be after start time');
      return;
    }
    const owner = isUnassigned ? currentUserId : adminId || currentUserId;
    if (!isUnassigned && !noTime && !force) {
      const warnings: string[] = [];
      if (owner && conflicts.has(owner)) {
        const name = admins.find((a) => a.user_id === owner)?.name ?? 'Owner';
        warnings.push(`${name} (owner) — ${conflictLabel(owner)}`);
      }
      extraAssignees
        .filter((id) => conflicts.has(id) && id !== owner)
        .forEach((id) => {
          const name = admins.find((a) => a.user_id === id)?.name ?? 'Admin';
          warnings.push(`${name} — ${conflictLabel(id)}`);
        });
      if (warnings.length) {
        setConflictWarnings(warnings);
        return;
      }
    }
    setConflictWarnings([]);

    setSaving(true);
    const assignedToIds = isUnassigned
      ? []
      : Array.from(new Set([...(owner ? [owner] : []), ...extraAssignees]));
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: dateValue,
      start_time: s,
      end_time: e,
      event_type: type,
      created_by: owner,
      assigned_to: assignedToIds,
      is_recurring: repeat !== 'none',
      recurrence_rule: repeat === 'none' ? null : repeat,
      pipeline_link: pipelineLink as unknown as Record<string, string> | null,
      is_open_task: isUnassigned,
      time_tbd: noTime,
      notify_slack: notifySlack,
    };
    const { error: dbError } = editEvent
      ? await supabase.from('calendar_events').update(payload as never).eq('id', editEvent.id)
      : await supabase.from('calendar_events').insert(payload as never);
    setSaving(false);
    if (dbError) {
      toast({ title: 'Could not save activity', description: dbError.message, variant: 'destructive' });
      return;
    }
    // Slack notification is fired server-side by a database trigger on insert.

    onOpenChange(false);
    onSaved(dateValue);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ce-light sm:max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editEvent ? 'Edit activity' : 'Add activity'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="ce-title">Title</Label>
            <Input
              id="ce-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is happening?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            {addingType ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  placeholder="New type name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleCreateType(); }
                    if (e.key === 'Escape') { setAddingType(false); setNewType(''); }
                  }}
                />
                <Button type="button" size="sm" onClick={handleCreateType} disabled={creatingType}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setAddingType(false); setNewType(''); }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allTypes.map((t) => {
                  const selected = type === t.value;
                  const red = t.value === 'deadline';
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setType(t.value)}
                      className={
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                        (selected
                          ? red
                            ? 'border-destructive bg-destructive/10 text-destructive'
                            : 'border-brand bg-brand/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:border-brand/50 hover:text-foreground')
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAddingType(true)}
                  className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
                >
                  + New type
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Select value={adminId} onValueChange={setAdminId}>
              <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>🙌 Unassigned — anyone can take it</SelectItem>
                {admins.map((a) => {
                  const busy = conflicts.has(a.user_id);
                  return (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.initial} — {a.name}{busy ? ' (busy)' : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {!isUnassigned && conflicts.has(adminId) && (
              <p className="text-xs text-destructive truncate" title={conflictLabel(adminId) ?? undefined}>{conflictLabel(adminId)}</p>
            )}
          </div>


          {isUnassigned ? (
            <p className="rounded-md border-[0.5px] border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
              This task will appear in the “Up for grabs” band on the calendar. Anyone on the team can take it
              and set a time.
            </p>
          ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Also assign to</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const free = admins.filter((a) => !conflicts.has(a.user_id)).map((a) => a.user_id);
                  setExtraAssignees(extraAssignees.length >= free.length && free.length > 0 ? [] : free);
                }}
              >
                {extraAssignees.length > 0 ? 'Clear all' : 'Add everyone available'}
              </button>
            </div>
            <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  Add people
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search people…" />
                  <CommandList>
                    <CommandEmpty>No one found.</CommandEmpty>
                    <CommandGroup>
                      {admins
                        .filter((a) => a.user_id !== adminId)
                        .map((a) => {
                          const busy = conflicts.has(a.user_id);
                          const selected = extraAssignees.includes(a.user_id);
                          return (
                            <CommandItem
                              key={a.user_id}
                              value={a.name}
                              onSelect={() =>
                                setExtraAssignees((prev) =>
                                  selected ? prev.filter((id) => id !== a.user_id) : [...prev, a.user_id]
                                )
                              }
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${busy ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              />
                              <span className="truncate">{a.name}</span>
                              <span className="ml-auto min-w-0 max-w-[50%] truncate text-[11px] text-muted-foreground">
                                {busy ? conflictLabel(a.user_id) : 'Free'}
                              </span>
                              {selected && <Check className="w-4 h-4 shrink-0 text-primary" />}
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {extraAssignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {extraAssignees.map((id) => {
                  const a = admins.find((x) => x.user_id === id);
                  if (!a) return null;
                  const busy = conflicts.has(id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs"
                      title={busy ? conflictLabel(id) ?? undefined : 'Free'}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${busy ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      {a.name}
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setExtraAssignees((prev) => prev.filter((x) => x !== id))}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          )}



          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <Label>When</Label>
              <span className="text-xs text-muted-foreground">Eastern Time (ET) for everyone</span>
            </div>
            <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Previous day"
                  onClick={() => setDateValue(addDays(dateValue, -1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Input
                  id="ce-date"
                  type="date"
                  value={dateValue}
                  onChange={(e) => { if (e.target.value) setDateValue(e.target.value); }}
                  className="w-auto flex-1 min-w-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Next day"
                  onClick={() => setDateValue(addDays(dateValue, 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground shrink-0">
                  {new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parseDateString(dateValue))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto shrink-0"
                  onClick={() => setDateValue(todayET())}
                >
                  Today
                </Button>
              </div>
              {repeat !== 'none' && dateValue !== (editEvent?.event_date ?? date) && (
                <p className="text-xs text-muted-foreground">
                  Moves the whole series. It repeats on {new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parseDateString(dateValue))} from {formatDateLong(dateValue)}; earlier dates won't show it.
                </p>
              )}
            <div className={`flex items-center gap-2 ${noTime ? 'opacity-50' : ''}`}>
              <TimeSelect value={start} onChange={handleStartChange} disabled={noTime} />
              <span className="text-sm text-muted-foreground shrink-0">to</span>
              <TimeSelect value={end} onChange={setEnd} disabled={noTime} />
              <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">ET</span>
              {durationLabel && (
                <span className="ml-auto text-xs text-muted-foreground shrink-0">{durationLabel}</span>
              )}
            </div>
            {conflictPeople.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {conflictPeople.length} {conflictPeople.length === 1 ? 'person is' : 'people are'} busy at this time
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {conflictPeople.map((p) => (
                    <li key={p.id}>
                      <span className="font-medium text-foreground">{p.name}</span>,{' '}
                      {formatMinutes(p.ev.start_time)} to {formatMinutes(p.ev.end_time)} ET · {p.ev.title}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {suggestedStart !== null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleStartChange(minutesToInput(suggestedStart))}
                    >
                      Use {formatMinutes(suggestedStart)}
                    </Button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={() => setShowFreeTimes((v) => !v)}
                  >
                    {showFreeTimes ? 'Hide free times' : 'See free times'}
                  </button>
                </div>
                {showFreeTimes && freeStarts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {freeStarts.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleStartChange(minutesToInput(s))}
                      >
                        {formatMinutes(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={noTime} onCheckedChange={(v) => setNoTime(v === true)} />
                <span>No specific time yet (any admin can set it)</span>
              </label>
            </div>
          </div>


          {showDesc ? (
            <div className="space-y-1.5">
              <Label htmlFor="ce-desc">Description</Label>
              <Textarea
                id="ce-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details"
                autoFocus={!description}
              />
            </div>
          ) : null}

          {showLink ? (
            <div className="space-y-1.5">
              <Label>Link to</Label>
              <PipelineLinkSelect value={pipelineLink} onChange={setPipelineLink} />
            </div>
          ) : null}

          {showRepeat ? (
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {(!showDesc || !showLink || !showRepeat) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {!showDesc && (
                <button type="button" onClick={() => setShowDesc(true)} className="text-sm font-medium text-brand hover:underline">
                  + Add description
                </button>
              )}
              {!showLink && (
                <button type="button" onClick={() => setShowLink(true)} className="text-sm font-medium text-brand hover:underline">
                  + Link to pipeline
                </button>
              )}
              {!showRepeat && (
                <button type="button" onClick={() => setShowRepeat(true)} className="text-sm font-medium text-brand hover:underline">
                  + Repeat
                </button>
              )}
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between shrink-0 pt-3 border-t">
          {!editEvent && (
            <label className="flex items-start gap-2 text-sm cursor-pointer self-center">
              <Checkbox
                id="ce-notify-slack"
                className="mt-0.5"
                checked={notifySlack}
                onCheckedChange={(v) => setNotifySlack(v === true)}
              />
              <span>
                Notify on Slack
                <span className="block text-xs text-muted-foreground">
                  Posts this activity to Slack when you save
                </span>
              </span>
            </label>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => handleSave()} disabled={saving}>{editEvent ? 'Save changes' : 'Save activity'}</Button>
          </div>
        </DialogFooter>

      </DialogContent>

      <AlertDialog open={conflictWarnings.length > 0} onOpenChange={(o) => !o && setConflictWarnings([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scheduling conflict</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>These people already have something booked at this time:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {conflictWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <p>You can still save this activity as a double-booking.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflictWarnings([]);
                handleSave(true);
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );

};

export default AddActivityModal;
