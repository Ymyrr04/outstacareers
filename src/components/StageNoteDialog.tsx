import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NotesEditor } from '@/components/NotesEditor';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessageSync } from '@/lib/errors';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { Loader2, Save, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useCalendarAdmins } from '@/hooks/useCalendarAdmins';
import { EVENT_TYPES, inputToMinutes, todayET } from '@/lib/calendarTime';

export interface PendingStageNote {
  applicantId: string;
  candidateName: string;
  newStatus: string;
}

interface Props {
  pending: PendingStageNote | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function StageNoteDialog({ pending, onOpenChange, onSaved }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const { admins } = useCalendarAdmins();
  const { notifyCalendarActivity } = useSlackNotifications();

  // Calendar section
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [calDate, setCalDate] = useState(todayET());
  const [calStart, setCalStart] = useState('10:00');
  const [calEnd, setCalEnd] = useState('11:00');
  const [calType, setCalType] = useState('task');
  const [calAdmin, setCalAdmin] = useState('');
  const [calDesc, setCalDesc] = useState('');
  const [calTitle, setCalTitle] = useState('');

  useEffect(() => {
    if (!pending) return;
    setContent('');
    setSaving(false);
    setAddToCalendar(false);
    setCalDate(todayET());
    setCalStart('10:00');
    setCalEnd('11:00');
    setCalType('task');
    setCalDesc(`Stage moved to ${pending.newStatus} — ${pending.candidateName}`);
    setCalTitle(`${pending.newStatus} — ${pending.candidateName}`);

    let cancelled = false;
    (async () => {
      const [{ data: { user } }, { data: applicant }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('applicants_prescreen').select('job_id').eq('id', pending.applicantId).maybeSingle(),
      ]);
      let adminId = user?.id || '';
      if (applicant?.job_id) {
        const { data: job } = await supabase
          .from('jobs')
          .select('assigned_admin_id')
          .eq('id', applicant.job_id)
          .maybeSingle();
        if (job?.assigned_admin_id) adminId = job.assigned_admin_id;
      }
      if (!cancelled) setCalAdmin(adminId);
    })();
    return () => { cancelled = true; };
  }, [pending]);

  if (!pending) return null;

  const createCalendarEvent = async (userId: string | undefined) => {
    const s = inputToMinutes(calStart);
    const e = inputToMinutes(calEnd);
    if (e <= s) {
      toast.error('Calendar end time must be after start time');
      return false;
    }
    const owner = calAdmin || userId;
    const assignedToIds = owner ? [owner] : [];
    const { error } = await supabase.from('calendar_events').insert({
      title: calTitle.trim() || `${pending.newStatus} — ${pending.candidateName}`,
      description: calDesc.trim() || null,
      event_date: calDate,
      start_time: s,
      end_time: e,
      event_type: calType,
      created_by: owner,
      assigned_to: assignedToIds,
      is_recurring: false,
      recurrence_rule: null,
      pipeline_link: { type: 'applicant', id: pending.applicantId, name: pending.candidateName },
    });
    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to create calendar activity'));
      return false;
    }
    // Slack notification is fired server-side by a database trigger on insert.

    return true;
  };

  const handleSave = async () => {
    if (!content || content === '<p></p>') {
      toast.error('Note cannot be empty');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('applicant_notes').insert({
      applicant_id: pending.applicantId,
      content,
      created_by: user?.id || null,
    });
    if (error) {
      setSaving(false);
      toast.error(getErrorMessageSync(error, 'Failed to save note'));
      return;
    }

    let calendarCreated = false;
    if (addToCalendar) calendarCreated = await createCalendarEvent(user?.id);
    setSaving(false);

    toast.success(calendarCreated ? 'Stage updated and calendar activity created' : 'Note added');
    onSaved?.();
    onOpenChange(false);
  };


  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !saving) onOpenChange(false); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto [&>button.absolute]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add a note</DialogTitle>
          <DialogDescription>
            {pending.candidateName} moved to <span className="font-medium">{pending.newStatus}</span>.
            Add a note — it will be saved to this candidate's notes.
          </DialogDescription>
        </DialogHeader>

        <NotesEditor
          value={content}
          onChange={setContent}
          placeholder="Write your note..."
          minHeight="140px"
          autoFocus
        />

        <div className="rounded-md border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={addToCalendar}
              onCheckedChange={(v) => setAddToCalendar(v === true)}
            />
            <CalendarPlus className="w-4 h-4 text-muted-foreground" />
            <span>Add to calendar</span>
          </label>

          {addToCalendar && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="sn-title" className="text-xs">Activity title</Label>
                <Input id="sn-title" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="Activity title" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sn-date" className="text-xs">Date</Label>
                  <Input id="sn-date" type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sn-start" className="text-xs">Start (ET)</Label>
                  <TimeSelect id="sn-start" value={calStart} onChange={setCalStart} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sn-end" className="text-xs">End (ET)</Label>
                  <TimeSelect id="sn-end" value={calEnd} onChange={setCalEnd} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Activity type</Label>
                  <Select value={calType} onValueChange={setCalType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned to</Label>
                  <Select value={calAdmin} onValueChange={setCalAdmin}>
                    <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
                    <SelectContent>
                      {admins.map((a) => (
                        <SelectItem key={a.user_id} value={a.user_id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sn-desc" className="text-xs">Description</Label>
                <Textarea id="sn-desc" rows={2} value={calDesc} onChange={(e) => setCalDesc(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Link</Label>
                <Input readOnly value={`Applicant · ${pending.candidateName}`} className="bg-muted" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
