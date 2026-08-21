import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  const [description, setDescription] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [pipelineLink, setPipelineLink] = useState<PipelineLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<{ value: string; label: string }[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [creatingType, setCreatingType] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setTitle('');
    setType('task');
    setAddingType(false);
    setNewType('');
    setDescription('');
    setRepeat('none');
    setPipelineLink(null);
    setError(null);
    setExtraAssignees(defaultAssignees ?? []);
    setAdminId(defaultAdminId || currentUserId || admins[0]?.user_id || '');
    setStart(minutesToInput(defaultStart));
    setEnd(minutesToInput(Math.min(defaultEnd ?? defaultStart + 60, 23 * 60 + 59)));
  }, [open, defaultStart, defaultEnd, defaultAdminId, defaultAssignees, currentUserId, admins]);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      titleRef.current?.focus();
      return;
    }
    const s = inputToMinutes(start);
    const e = inputToMinutes(end);
    if (e <= s) {
      setError('End time must be after start time');
      return;
    }
    setSaving(true);
    const owner = adminId || currentUserId;
    const assignedToIds = Array.from(new Set([...(owner ? [owner] : []), ...extraAssignees]));
    const { error: dbError } = await supabase.from('calendar_events').insert({
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
    });
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add activity</DialogTitle>
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
                  {admins.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.initial} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Also assign to</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setExtraAssignees(
                    extraAssignees.length === admins.length ? [] : admins.map((a) => a.user_id)
                  )
                }
              >
                {extraAssignees.length === admins.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1.5">
              {admins.map((a) => (
                <label key={a.user_id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={extraAssignees.includes(a.user_id)}
                    onCheckedChange={(v) =>
                      setExtraAssignees((prev) =>
                        v === true ? [...prev, a.user_id] : prev.filter((id) => id !== a.user_id)
                      )
                    }
                  />
                  <span className="font-normal">{a.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ce-start">Start (ET)</Label>
              <Input id="ce-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ce-end">End (ET)</Label>
              <Input id="ce-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
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
            <Button onClick={handleSave} disabled={saving}>Save activity</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddActivityModal;
