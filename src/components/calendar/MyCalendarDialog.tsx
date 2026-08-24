import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { useCalendarAdmins } from '@/hooks/useCalendarAdmins';
import { formatMinutes, eventTypeLabel } from '@/lib/calendarTime';
import { useToast } from '@/hooks/use-toast';
import ActivityDetailPanel from './ActivityDetailPanel';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId?: string;
}

const formatDate = (d: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${d}T12:00:00Z`));

export const MyCalendarDialog = ({ open, onOpenChange, currentUserId }: Props) => {
  const { toast } = useToast();
  const { admins } = useCalendarAdmins();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .contains('assigned_to', [currentUserId])
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) {
      toast({ title: 'Could not load your tasks', description: error.message, variant: 'destructive' });
      setEvents([]);
    } else {
      setEvents((data || []) as unknown as CalendarEvent[]);
    }
    setLoading(false);
  }, [currentUserId, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!selected) return;
    const fresh = events.find((e) => e.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [events, selected]);

  const toggleDone = async (ev: CalendarEvent, next: boolean) => {
    const { error } = await supabase.from('calendar_events').update({ is_done: next }).eq('id', ev.id);
    if (error) {
      toast({ title: 'Could not update task', description: error.message, variant: 'destructive' });
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, is_done: next } : e)));
  };

  const open_ = events.filter((e) => !e.is_done);
  const done = events.filter((e) => e.is_done);

  const row = (e: CalendarEvent) => (
    <div
      key={e.id}
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/50"
    >
      <Checkbox
        checked={!!e.is_done}
        onCheckedChange={(v) => toggleDone(e, !!v)}
        aria-label="Mark as done"
      />
      <button
        type="button"
        onClick={() => setSelected(e)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className={`truncate text-sm ${e.is_done ? 'line-through text-muted-foreground' : ''}`}>
          {e.title}
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {eventTypeLabel(e.event_type)}
        </Badge>
      </button>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatDate(e.event_date)}
        {!e.time_tbd && ` · ${formatMinutes(e.start_time)} ET`}
      </span>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Calendar</DialogTitle>
          </DialogHeader>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && events.length === 0 && (
            <p className="text-sm text-muted-foreground">No tasks assigned to you.</p>
          )}
          {open_.length > 0 && <div className="space-y-2">{open_.map(row)}</div>}
          {done.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">Completed</p>
              {done.map(row)}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Task details</DialogTitle>
          </DialogHeader>
          {selected && (
            <ActivityDetailPanel
              event={selected}
              admins={admins}
              currentUserId={currentUserId}
              onClose={() => setSelected(null)}
              onChanged={load}
              className="mt-0"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MyCalendarDialog;
