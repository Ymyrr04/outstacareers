import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { todayET, formatMinutes } from '@/lib/calendarTime';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { useCalendarAdmins } from '@/hooks/useCalendarAdmins';



interface TodayEvent {
  id: string;
  title: string;
  start_time: number | null;
  time_tbd: boolean | null;
  assigned_to: string[] | null;
  claimed_by: string | null;
}

/** Right-hand sidebar for the Jobs tab: today's activities. */
export const JobsTabSidebar = () => {
  const { getAdmin } = useCalendarAdmins();
  const [events, setEvents] = useState<TodayEvent[]>([]);

  useEffect(() => {
    const load = async () => {
      const today = todayET();
      const { data } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, time_tbd, assigned_to, claimed_by, event_date')
        .eq('event_date', today)
        .order('start_time', { ascending: true });
      setEvents((data || []) as unknown as TodayEvent[]);
    };
    load().catch((e) => console.error('Jobs sidebar load failed:', e));
  }, []);

  const ownerInfo = (ev: TodayEvent) => {
    const owners = [
      ...(Array.isArray(ev.assigned_to) ? ev.assigned_to : []),
      ...(ev.claimed_by ? [ev.claimed_by] : []),
    ];
    const first = owners[0];
    if (!first) return { name: 'Up for grabs', color: '#6B7280' };
    const admin = getAdmin(first);
    return {
      name: admin?.name ?? getAdminDisplayName(first, first),
      color: admin?.color.main ?? '#6B7280',
    };
  };

  return (
    <div className="w-[200px] flex-shrink-0">
      {/* Today's activities */}
      <div className="bg-white border-[0.5px] border-[#C8F0F8] rounded-[10px] p-3">
        <h3 className="text-[11px] font-medium mb-2">Today's activities</h3>
        {events.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No activities today</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((ev) => {
              const owner = ownerInfo(ev);
              return (
                <div key={ev.id} className="flex items-start gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0"
                    style={{ backgroundColor: owner.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight truncate">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {ev.time_tbd ? 'Time TBD' : formatMinutes(ev.start_time ?? 0)} · {owner.name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
