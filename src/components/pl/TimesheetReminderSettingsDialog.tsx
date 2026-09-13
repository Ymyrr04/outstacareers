import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { TimeSelect, formatTimeLabel } from '@/components/ui/time-select';
import { BellRing, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

interface ReminderSettings {
  day_of_week: number;
  reminder_time: string; // "HH:mm:ss" from DB
  enabled: boolean;
}

interface Props {
  /** Render inline summary text + edit button (for the Did Not Submit header). */
  variant?: 'inline' | 'button';
}

export function TimesheetReminderSettingsDialog({ variant = 'inline' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [day, setDay] = useState<number>(6);
  const [time, setTime] = useState<string>('09:00');
  const [enabled, setEnabled] = useState<boolean>(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('timesheet_reminder_settings')
      .select('day_of_week, reminder_time, enabled')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      setLoading(false);
      return;
    }
    const s: ReminderSettings = data ?? { day_of_week: 6, reminder_time: '09:00:00', enabled: true };
    setSettings(s);
    setDay(s.day_of_week);
    setTime(s.reminder_time.slice(0, 5));
    setEnabled(s.enabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dayLabel = DAYS.find((d) => d.value === (settings?.day_of_week ?? 6))?.label ?? 'Saturday';
  const timeLabel = formatTimeLabel((settings?.reminder_time ?? '09:00:00').slice(0, 5));
  const summary = loading
    ? 'Loading reminder schedule…'
    : settings?.enabled
      ? `Automatic reminders go out every ${dayLabel} at ${timeLabel} ET to anyone still missing.`
      : 'Automatic reminders are turned off.';

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_timesheet_reminder_schedule', {
      p_day_of_week: day,
      p_time: time,
      p_enabled: enabled,
    });
    setSaving(false);
    if (error) {
      toast.error('Could not save reminder schedule', { description: error.message });
      return;
    }
    toast.success(
      enabled
        ? `Reminders will go out every ${DAYS.find((d) => d.value === day)?.label} at ${formatTimeLabel(time)} ET.`
        : 'Automatic reminders turned off.'
    );
    await load();
    setOpen(false);
  };

  return (
    <>
      {variant === 'inline' ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BellRing className="h-3.5 w-3.5 shrink-0" />
          <span>{summary}</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            <Settings2 className="h-3 w-3" />
            Change
          </button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
          Reminder schedule
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Timesheet reminder schedule</DialogTitle>
            <DialogDescription>
              Contractors who haven't submitted their timesheet/invoice get an automatic email
              reminder at this time (Eastern Time).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="reminder-enabled" className="text-sm">
                Automatic reminders
              </Label>
              <Switch id="reminder-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-day" className="text-xs">
                  Day of week
                </Label>
                <Select
                  value={String(day)}
                  onValueChange={(v) => setDay(Number(v))}
                  disabled={!enabled}
                >
                  <SelectTrigger id="reminder-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-time" className="text-xs">
                  Time (ET)
                </Label>
                <TimeSelect id="reminder-time" value={time} onChange={setTime} disabled={!enabled} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Timesheets lock for editing on Sundays at 12:00 PM ET, so reminders are usually sent
              before that.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
