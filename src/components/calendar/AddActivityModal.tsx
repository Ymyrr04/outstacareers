import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  PipelineLink,
} from '@/lib/calendarTime';
import PipelineLinkSelect from './PipelineLinkSelect';

const UNASSIGNED = '__unassigned__';



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

  /** When start changes, auto-adjust end to a 30-min interval 30 mins after start. */
  const handleStartChange = (val: string) => {
    setStart(val);
    const sMin = inputToMinutes(val);
    // Snap to the nearest 30-min interval, at least 30 mins after start.
    let eMin = Math.round((sMin + 30) / 30) * 30;
    if (eMin <= sMin) eMin = sMin + 30;
    if (eMin > 23 * 60 + 59) eMin = 23 * 60 + 59;
    setEnd(minutesToInput(eMin));
  };
  const [noTime, setNoTime] = useState(false);
  const [notifySlack, setNotifySlack] = useState(false);

  const [description, setDescription] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [pipelineLink, setPipelineLink] = useState<PipelineLink | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<{ value: string; label: string }[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [creatingType, setCreatingType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dayEvents, setDayEvents] = useState<
    { id: string; title: string; start_time: number; end_time: number; assigned_to: string[] | null; created_by: string | null }[]
  >([]);

  // Load events occurring on this date (including recurring ones) to detect conflicts
  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('id,title,event_date,start_time,end_time,assigned_to,created_by,is_recurring,recurrence_rule')
        .or(`event_date.eq.${date},is_recurring.eq.true`);
      if (cancelled) return;
      const dow = weekdayOf(date);
      const occurring = (data || []).filter((e: any) => {
        if (editEvent && e.id === editEvent.id) return false;
        if (e.event_date === date) return true;
        if (e.is_recurring && e.event_date < date) {
          const rule = e.recurrence_rule || 'weekly';
          if (rule === 'weekly') return weekdayOf(e.event_date) === dow;
          if (rule === 'biweekly')
            return weekdayOf(e.event_date) === dow && daysBetween(e.event_date, date) % 14 === 0;
          if (rule === 'monthly') return dayOfMonth(e.event_date) === dayOfMonth(date);
        }
        return false;
      });
      setDayEvents(occurring as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date, editEvent]);

  const isUnassigned = adminId === UNASSIGNED;
  const startMin = inputToMinutes(start);
  const endMin = inputToMinutes(end);


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

  const handleSave = async () => {
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
    if (!isUnassigned && !noTime) {
      if (owner && conflicts.has(owner)) {
        setError(`Owner is not available — ${conflictLabel(owner)}`);
        return;
      }
      const busyPicked = extraAssignees.filter((id) => conflicts.has(id));
      if (busyPicked.length) {
        setError('Some selected admins already have an activity at this time');
        return;
      }
    }
    setSaving(true);
    const assignedToIds = isUnassigned
      ? []
      : Array.from(new Set([...(owner ? [owner] : []), ...extraAssignees]));
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: date,
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
    onSaved(date);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{editEvent ? 'Edit activity' : 'Add activity'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
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
                <Select
                  value={type}
                  onValueChange={(v) => (v === '__new__' ? setAddingType(true) : setType(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Add new type…</SelectItem>
                  </SelectContent>
                </Select>
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
                      <SelectItem key={a.user_id} value={a.user_id} disabled={busy}>
                        {a.initial} — {a.name}{busy ? ' (busy)' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {!isUnassigned && conflicts.has(adminId) && (
                <p className="text-xs text-destructive">{conflictLabel(adminId)}</p>
              )}
            </div>

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
                {extraAssignees.length > 0 ? 'Clear all' : 'Select all available'}
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-md border p-2 space-y-1.5">
              {admins.map((a) => {
                const busy = conflicts.has(a.user_id);
                return (
                  <label
                    key={a.user_id}
                    className={`flex items-center gap-2 text-sm ${
                      busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    title={conflictLabel(a.user_id) ?? undefined}
                  >
                    <Checkbox
                      disabled={busy}
                      checked={!busy && extraAssignees.includes(a.user_id)}
                      onCheckedChange={(v) =>
                        setExtraAssignees((prev) =>
                          v === true ? [...prev, a.user_id] : prev.filter((id) => id !== a.user_id)
                        )
                      }
                    />
                    <span className="font-normal shrink-0">{a.name}</span>
                    {busy && (
                      <span className="ml-auto text-[11px] text-muted-foreground truncate">
                        {conflictLabel(a.user_id)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
          )}


          <label className="flex items-start gap-2 text-sm rounded-md border p-3 cursor-pointer">
            <Checkbox
              className="mt-0.5"
              checked={notifySlack}
              onCheckedChange={(v) => setNotifySlack(v === true)}
            />
            <span>
              Needs the team's attention
              <span className="block text-xs text-muted-foreground">
                Sends a Slack notification. Leave unchecked to save quietly.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={noTime} onCheckedChange={(v) => setNoTime(v === true)} />
              <span>No specific time yet (any admin can set it)</span>
            </label>
            {!noTime && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ce-start">Start (ET)</Label>
                  <TimeSelect id="ce-start" value={start} onChange={handleStartChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ce-end">End (ET)</Label>
                  <TimeSelect id="ce-end" value={end} onChange={setEnd} />
                </div>
              </div>
            )}
          </div>


          <div className="space-y-1.5">
            <Label htmlFor="ce-desc">Description</Label>
            <Textarea
              id="ce-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Link to pipeline (optional)</Label>
            <PipelineLinkSelect value={pipelineLink} onChange={setPipelineLink} />
          </div>

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

          <p className="text-xs text-muted-foreground">All times are in Eastern Time (ET)</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-muted-foreground self-center">{formatDateLong(date)}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{editEvent ? 'Save changes' : 'Save activity'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddActivityModal;
