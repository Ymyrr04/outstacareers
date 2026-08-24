import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TimeSelect } from '@/components/ui/time-select';
import { HandHeart, Loader2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSlackNotifications } from '@/hooks/useSlackNotifications';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { CalendarAdmin } from '@/hooks/useCalendarAdmins';
import { formatMinutes, inputToMinutes, minutesToInput } from '@/lib/calendarTime';

interface Props {
  events: CalendarEvent[];
  admins: CalendarAdmin[];
  currentUserId?: string;
  onChanged: () => void;
  onSelect?: (ev: CalendarEvent) => void;
}

/** "Up for grabs" band — unassigned tasks anyone on the team can claim. */
export const OpenTasksBar = ({ events, admins, currentUserId, onChanged, onSelect }: Props) => {
  const { toast } = useToast();
  const { notifyCalendarUpdate } = useSlackNotifications();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [times, setTimes] = useState<Record<string, { start: string; end: string }>>({});

  if (events.length === 0) return null;

  const timeFor = (ev: CalendarEvent) =>
    times[ev.id] ?? {
      start: minutesToInput(ev.time_tbd ? 9 * 60 : ev.start_time),
      end: minutesToInput(ev.time_tbd ? 10 * 60 : ev.end_time),
    };

  const setTime = (id: string, patch: Partial<{ start: string; end: string }>) =>
    setTimes((prev) => ({ ...prev, [id]: { ...timeFor(events.find((e) => e.id === id)!), ...patch } }));

  const claim = async (ev: CalendarEvent) => {
    if (!currentUserId) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    const { start, end } = timeFor(ev);
    const s = inputToMinutes(start);
    const e = inputToMinutes(end);
    if (ev.time_tbd && e <= s) {
      toast({ title: 'End time must be after start time', variant: 'destructive' });
      return;
    }
    setBusyId(ev.id);
    const { error } = await supabase
      .from('calendar_events')
      .update({
        assigned_to: Array.from(new Set([...(ev.assigned_to || []), currentUserId])),
        is_open_task: false,
        time_tbd: false,
        claimed_by: currentUserId,
        claimed_at: new Date().toISOString(),
        start_time: ev.time_tbd ? s : ev.start_time,
        end_time: ev.time_tbd ? e : ev.end_time,
      } as never)
      .eq('id', ev.id);
    setBusyId(null);
    if (error) {
      toast({ title: 'Could not take this task', description: error.message, variant: 'destructive' });
      return;
    }
    const me = admins.find((a) => a.user_id === currentUserId);
    const startMin = ev.time_tbd ? s : ev.start_time;
    const endMin = ev.time_tbd ? e : ev.end_time;
    if (me?.email) {
      void notifyCalendarUpdate({
        updatedByEmail: me.email,
        activityTitle: ev.title,
        eventDate: ev.event_date,
        updateType: 'assigned',
        updateDetail: `${me.name} took an open task — added to their calendar for ${formatMinutes(startMin)} – ${formatMinutes(endMin)}`,
      });
    }
    toast({ title: 'Added to your calendar', description: `${ev.title} · ${formatMinutes(startMin)} – ${formatMinutes(endMin)}` });
    onChanged();
    window.dispatchEvent(new CustomEvent('open-tasks-changed'));
  };

  return (
    <Card className="mb-4 border-[0.5px] border-dashed p-3">
      <div className="mb-2 flex items-center gap-2">
        <HandHeart className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Up for grabs</span>
        <Badge variant="secondary" className="text-[10px]">{events.length}</Badge>
        <span className="text-xs text-muted-foreground">Unassigned tasks — anyone can take one</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {events.map((ev) => {
          const creator = admins.find((a) => a.user_id === ev.created_by);
          const t = timeFor(ev);
          return (
            <div
              key={ev.id}
              className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-md border-[0.5px] bg-muted/30 p-2"
            >
              <button
                type="button"
                className="text-left"
                onClick={() => onSelect?.(ev)}
              >
                <p className="truncate text-xs font-medium">{ev.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {ev.time_tbd ? 'No time set' : `${formatMinutes(ev.start_time)} – ${formatMinutes(ev.end_time)}`}
                  {creator ? ` · posted by ${creator.name}` : ''}
                </p>
              </button>

              {ev.time_tbd && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <TimeSelect value={t.start} onChange={(v) => setTime(ev.id, { start: v })} />
                  <span className="text-[10px] text-muted-foreground">–</span>
                  <TimeSelect value={t.end} onChange={(v) => setTime(ev.id, { end: v })} />
                </div>
              )}

              <Button size="sm" className="h-7 text-xs" disabled={busyId === ev.id} onClick={() => claim(ev)}>
                {busyId === ev.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Take this task
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default OpenTasksBar;
