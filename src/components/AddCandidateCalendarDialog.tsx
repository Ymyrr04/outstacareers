import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessageSync } from '@/lib/errors';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { Loader2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useCalendarAdmins } from '@/hooks/useCalendarAdmins';
import { EVENT_TYPES, inputToMinutes, todayET } from '@/lib/calendarTime';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
  jobId?: string | null;
}

export function AddCandidateCalendarDialog({
  open,
  onOpenChange,
  applicantId,
  applicantName,
  jobId,
}: Props) {
  const { admins } = useCalendarAdmins();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('followup');
  const [adminId, setAdminId] = useState('');
  const [date, setDate] = useState(todayET());
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(`Follow-up — ${applicantName}`);
    setType('followup');
    setDate(todayET());
    setStart('10:00');
    setEnd('11:00');
    setDescription('');
    setSaving(false);

    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let assignedAdmin = user?.id || '';
      if (jobId) {
        const { data: job } = await supabase
          .from('jobs')
          .select('assigned_admin_id')
          .eq('id', jobId)
          .maybeSingle();
        if (job?.assigned_admin_id) assignedAdmin = job.assigned_admin_id;
      }
      if (!cancelled) setAdminId(assignedAdmin || admins[0]?.user_id || '');
    })();
    return () => { cancelled = true; };
  }, [open, applicantName, jobId, admins]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Activity title is required');
      return;
    }
    const s = inputToMinutes(start);
    const e = inputToMinutes(end);
    if (e <= s) {
      toast.error('End time must be after start time');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const owner = adminId || user?.id;
    const { error } = await supabase.from('calendar_events').insert({
      title: title.trim(),
      description: description.trim() || null,
      event_date: date,
      start_time: s,
      end_time: e,
      event_type: type,
      created_by: owner,
      assigned_to: owner ? [owner] : [],
      is_recurring: false,
      recurrence_rule: null,
      pipeline_link: { type: 'applicant', id: applicantId, name: applicantName },
    });
    setSaving(false);
    if (error) {
      toast.error(getErrorMessageSync(error, 'Failed to create calendar activity'));
      return;
    }
    toast.success('Activity added to calendar');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add to calendar — {applicantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acc-title">Activity title</Label>
            <Input
              id="acc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Activity title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <Select value={adminId} onValueChange={setAdminId}>
                <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
                <SelectContent>
                  {admins.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="acc-date" className="text-xs">Date</Label>
              <Input id="acc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-start" className="text-xs">Start (ET)</Label>
              <Input id="acc-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-end" className="text-xs">End (ET)</Label>
              <Input id="acc-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-desc">Description</Label>
            <Textarea
              id="acc-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pipeline link</Label>
            <div>
              <Badge variant="secondary" className="gap-1">
                <CalendarPlus className="w-3 h-3" />
                {applicantName}
              </Badge>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">All times are in Eastern Time (ET)</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-2" />}
            Save to calendar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddCandidateCalendarDialog;
