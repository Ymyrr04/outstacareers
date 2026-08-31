import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { todayET, nowMinutesET, formatMinutes } from '@/lib/calendarTime';

const REMINDER_LEAD_MINUTES = 10;
const POLL_MS = 30_000;
const DISMISS_KEY = 'activity-reminders-dismissed';

const loadDismissed = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const dismissReminder = (key: string) => {
  const dismissed = loadDismissed();
  dismissed.add(key);
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed]));
};

interface ReminderEvent {
  id: string;
  title: string;
  start_time: number | null;
  time_tbd: boolean | null;
  is_done: boolean | null;
  event_type: string;
}

/**
 * Shows a toast notification 10 minutes before the start time of any calendar
 * activity assigned to (or claimed by) the signed-in admin for today (ET).
 */
export const useActivityReminders = (currentUserId?: string) => {
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    const check = async () => {
      const day = todayET();
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, time_tbd, is_done, event_type, assigned_to, claimed_by')
        .eq('event_date', day)
        .or(`assigned_to.cs."{${currentUserId}}",claimed_by.eq."${currentUserId}"`);

      if (error) {
        console.error('Activity reminder query failed:', error);
        return;
      }
      if (cancelled || !data) return;

      const now = nowMinutesET();
      const dismissed = loadDismissed();
      (data as unknown as ReminderEvent[]).forEach((ev) => {
        if (ev.is_done || ev.time_tbd || ev.start_time == null) return;
        const key = `${day}:${ev.id}`;
        if (notified.current.has(key) || dismissed.has(key)) return;
        const diff = ev.start_time - now;
        if (diff > REMINDER_LEAD_MINUTES || diff < 0) return;
        notified.current.add(key);
        toast(`Starting in ${diff <= 0 ? 'a moment' : `${diff} min`}: ${ev.title}`, {
          description: `Scheduled at ${formatMinutes(ev.start_time)} ET`,
          duration: 15000,
          action: {
            label: "Don't show again",
            onClick: () => dismissReminder(key),
          },
        });
      });
    };

    check();
    const interval = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUserId]);
};

export default useActivityReminders;
