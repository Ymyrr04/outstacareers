import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { weekdayOf } from '@/lib/calendarTime';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: number;
  end_time: number;
  event_type: string;
  created_by: string;
  assigned_to: string[];
  is_recurring: boolean;
  recurrence_rule: string | null;
}

/** Fetches events inside [start, end] plus every recurring event that started on/before end. */
export const useCalendarEvents = (rangeStart: string, rangeEnd: string) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .or(`and(event_date.gte.${rangeStart},event_date.lte.${rangeEnd}),is_recurring.eq.true`)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error loading calendar events:', error);
      setEvents([]);
    } else {
      setEvents((data || []) as CalendarEvent[]);
    }
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const eventsForDate = useCallback(
    (dateStr: string) => {
      const dow = weekdayOf(dateStr);
      return events
        .filter((e) => {
          if (e.event_date === dateStr) return true;
          if (e.is_recurring && e.recurrence_rule === 'weekly') {
            return e.event_date < dateStr && weekdayOf(e.event_date) === dow;
          }
          return false;
        })
        .sort((a, b) => a.start_time - b.start_time);
    },
    [events]
  );

  return { events, loading, eventsForDate, refetch: load };
};
