import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarAdmins, CalendarAdmin } from '@/hooks/useCalendarAdmins';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import AddActivityModal from './AddActivityModal';
import ActivityDetailPanel from './ActivityDetailPanel';
import {
  ET_LABEL,
  DAY_END_MIN,
  DAY_START_MIN,
  PX_PER_MIN,
  SLOT_HEIGHT,
  addDays,
  colorForIndex,
  colorForUserId,
  formatDateLong,
  formatMinutes,
  nowMinutesET,
  parseDateString,
  toDateString,
  todayET,
} from '@/lib/calendarTime';

const AdminDot = ({ admin, size = 18 }: { admin?: CalendarAdmin; size?: number }) => {
  const color = admin?.color ?? colorForIndex(99);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-medium shrink-0"
      style={{
        width: size,
        height: size,
        background: color.bg,
        color: color.text,
        border: `1px solid ${color.main}`,
        fontSize: Math.max(9, size * 0.45),
      }}
    >
      {admin?.initial ?? '?'}
    </span>
  );
};

const Legend = ({ admins }: { admins: CalendarAdmin[] }) => (
  <div className="flex items-center gap-3 flex-wrap">
    {admins.map((a) => (
      <span key={a.user_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <AdminDot admin={a} />
        {a.name}
      </span>
    ))}
  </div>
);

export const TeamCalendar = () => {
  const { user } = useAuth();
  const { admins } = useCalendarAdmins();
  const today = todayET();

  const [view, setView] = useState<'month' | 'day'>('month');
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = parseDateString(today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(today);
  const [modalStart, setModalStart] = useState(9 * 60);
  const [modalAdmin, setModalAdmin] = useState<string | undefined>();

  const monthStart = toDateString(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1));
  const monthEnd = toDateString(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0));

  const rangeStart = view === 'month' ? monthStart : selectedDate;
  const rangeEnd = view === 'month' ? monthEnd : selectedDate;
  const { eventsForDate, refetch } = useCalendarEvents(rangeStart, rangeEnd);

  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthCursor);

  const monthCells = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    const cells: Array<string | null> = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(toDateString(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const openModal = (date: string, start: number, adminId?: string) => {
    setModalDate(date);
    setModalStart(start);
    setModalAdmin(adminId);
    setModalOpen(true);
  };

  const handleSaved = (date: string) => {
    refetch();
    if (view === 'month') {
      setSelectedDate(date);
      setView('day');
    }
  };

  const goToDay = (date: string) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setView('day');
  };

  const shiftDay = (delta: number) => {
    const next = addDays(selectedDate, delta);
    setSelectedDate(next);
    setSelectedEvent(null);
    const d = parseDateString(next);
    setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  /* ---------------- Month view ---------------- */
  const renderMonth = () => (
    <Card className="p-4 border-[0.5px]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-medium min-w-[160px] text-center">{monthLabel}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Legend admins={admins} />
          <Button size="sm" onClick={() => openModal(today, 9 * 60)}>
            <Plus className="h-4 w-4 mr-1" /> Add activity
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border-[0.5px]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-muted/40 py-1.5 text-center text-xs text-muted-foreground">
            {d}
          </div>
        ))}
        {monthCells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="bg-background min-h-[96px]" />;
          const dayEvents = eventsForDate(date);
          const isToday = date === today;
          return (
            <button
              key={date}
              onClick={() => goToDay(date)}
              className={`bg-background min-h-[96px] p-1.5 text-left align-top hover:bg-muted/40 transition-colors ${
                isToday ? 'bg-primary/5' : ''
              }`}
            >
              <span className={`text-xs ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {parseDateString(date).getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 2).map((ev) => {
                  const admin = admins.find((a) => a.user_id === ev.created_by);
                  const color = admin?.color ?? colorForUserId(ev.created_by);
                  return (
                    <div
                      key={ev.id}
                      className="truncate rounded-[3px] px-1 py-0.5 text-[11px]"
                      style={{
                        background: color.bg,
                        color: color.text,
                        borderLeft: `3px solid ${color.main}`,
                        border: `0.5px solid ${color.main}55`,
                        borderLeftWidth: 3,
                      }}
                    >
                      {ev.title}
                    </div>
                  );
                })}
                {dayEvents.length > 2 && (
                  <div className="text-[11px] text-muted-foreground">+{dayEvents.length - 2} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );

  /* ---------------- Day view ---------------- */
  const renderDay = () => {
    const dayEvents = eventsForDate(selectedDate);
    const totalMinutes = DAY_END_MIN - DAY_START_MIN;
    const gridHeight = totalMinutes * PX_PER_MIN;
    const hours: number[] = [];
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) hours.push(m);
    const nowMin = nowMinutesET();
    const showNowLine = selectedDate === today && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;

    return (
      <Card className="p-4 border-[0.5px]">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => { setView('month'); setSelectedEvent(null); }}>
              ‹ Month
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-base font-medium">{formatDateLong(selectedDate)}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{ET_LABEL}</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Legend admins={admins} />
            <Button size="sm" onClick={() => openModal(selectedDate, 9 * 60)}>
              <Plus className="h-4 w-4 mr-1" /> Add activity
            </Button>
          </div>
        </div>

        <div className="flex gap-4 items-start">
        <div className="overflow-x-auto flex-1 min-w-0">
          <div className="flex w-full">
            {/* time column */}
            <div className="w-[52px] shrink-0">
              <div className="h-9 border-b-[0.5px] border-border" />
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                    style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}
                  >
                    {formatMinutes(m)}
                  </div>
                ))}
              </div>
            </div>

            {/* admin lanes */}
            {admins.map((admin) => {
              const laneEvents = dayEvents.filter((e) => e.created_by === admin.user_id);
              return (
                <div key={admin.user_id} className="flex-1 min-w-[120px] border-l-[0.5px] border-border">
                  <div
                    className="flex h-9 items-center gap-1.5 px-2 border-b-[0.5px] border-border"
                    style={{ background: admin.color.bg }}
                  >
                    <AdminDot admin={admin} size={24} />
                    <span className="truncate text-xs" style={{ color: admin.color.text }}>
                      {admin.name}
                    </span>
                  </div>
                  <div className="relative" style={{ height: gridHeight }}>
                    {/* slots */}
                    {Array.from({ length: totalMinutes / 30 }).map((_, i) => {
                      const slotStart = DAY_START_MIN + i * 30;
                      const isHour = slotStart % 60 === 0;
                      return (
                        <button
                          key={slotStart}
                          onClick={() => openModal(selectedDate, slotStart, admin.user_id)}
                          className="absolute left-0 right-0 hover:bg-muted/40"
                          style={{
                            top: i * SLOT_HEIGHT,
                            height: SLOT_HEIGHT,
                            borderTop: `${isHour ? 1 : 0.5}px solid hsl(var(--border))`,
                          }}
                        />
                      );
                    })}

                    {/* now line */}
                    {showNowLine && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-20"
                        style={{ top: (nowMin - DAY_START_MIN) * PX_PER_MIN }}
                      >
                        <div className="relative h-0 border-t border-red-500">
                          <span className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-red-500" />
                        </div>
                      </div>
                    )}

                    {/* events */}
                    {laneEvents.map((ev) => {
                      const top = (Math.max(ev.start_time, DAY_START_MIN) - DAY_START_MIN) * PX_PER_MIN;
                      const height = Math.max(
                        14,
                        (Math.min(ev.end_time, DAY_END_MIN) - Math.max(ev.start_time, DAY_START_MIN)) * PX_PER_MIN
                      );
                      const selected = selectedEvent?.id === ev.id;
                      const color = admin.color;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="absolute left-[2px] right-[2px] z-10 overflow-hidden px-1 py-0.5 text-left"
                          style={{
                            top,
                            height,
                            background: color.bg,
                            color: color.text,
                            borderLeft: `3px solid ${color.main}`,
                            border: selected ? `1.5px solid ${color.main}` : `0.5px solid ${color.main}55`,
                            borderLeftWidth: 3,
                            borderRadius: 5,
                          }}
                        >
                          {height <= 28 ? (
                            <span className="block truncate text-[10px] leading-[16px]">
                              {admin.initial} {ev.title}
                            </span>
                          ) : height <= 70 ? (
                            <>
                              <span className="block text-[10px] leading-tight line-clamp-2">{ev.title}</span>
                              <span className="block text-[9px] opacity-80">● {formatMinutes(ev.start_time)}</span>
                            </>
                          ) : (
                            <>
                              <span className="block text-[11px] leading-tight line-clamp-2">{ev.title}</span>
                              <span className="block text-[9px] opacity-80">● {admin.name}</span>
                              <span className="block text-[9px] opacity-80">
                                {formatMinutes(ev.start_time)} – {formatMinutes(ev.end_time)}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedEvent && (
          <div className="w-[340px] shrink-0 hidden lg:block sticky top-4">
            <ActivityDetailPanel
              event={dayEvents.find((e) => e.id === selectedEvent.id) ?? selectedEvent}
              admins={admins}
              currentUserId={user?.id}
              onClose={() => setSelectedEvent(null)}
              onChanged={refetch}
              className="mt-0 max-h-[70vh] overflow-y-auto"
            />
          </div>
        )}
        </div>

        {selectedEvent && (
          <div className="lg:hidden">
            <ActivityDetailPanel
              event={dayEvents.find((e) => e.id === selectedEvent.id) ?? selectedEvent}
              admins={admins}
              currentUserId={user?.id}
              onClose={() => setSelectedEvent(null)}
              onChanged={refetch}
            />
          </div>
        )}
      </Card>

    );
  };

  return (
    <div className="space-y-4">
      {view === 'month' ? renderMonth() : renderDay()}
      <AddActivityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={modalDate}
        defaultStart={modalStart}
        defaultAdminId={modalAdmin}
        admins={admins}
        currentUserId={user?.id}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default TeamCalendar;
