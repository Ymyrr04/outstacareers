import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus, X, Flag, Link2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarAdmins, CalendarAdmin } from '@/hooks/useCalendarAdmins';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import AddActivityModal from './AddActivityModal';
import ActivityDetailPanel from './ActivityDetailPanel';
import OpenTasksBar from './OpenTasksBar';

import {
  ET_LABEL,
  DAY_END_MIN,
  DAY_START_MIN,
  PX_PER_MIN,
  SLOT_HEIGHT,
  addDays,
  colorForIndex,
  colorForUserId,
  isDeadline,
  DEADLINE_COLOR,
  formatDateLong,
  formatMinutes,
  nowMinutesET,
  parseDateString,
  toDateString,
  todayET,
} from '@/lib/calendarTime';

/**
 * Compute a side-by-side column layout for overlapping calendar events so
 * they never stack on top of each other (each remains independently clickable).
 * Returns a map of event id -> { col (0-based), cols (total columns in its cluster) }.
 */
function computeOverlapLayout(events: { id: string; start_time: number; end_time: number }[]): Map<string, { col: number; cols: number }> {
  const result = new Map<string, { col: number; cols: number }>();
  if (events.length === 0) return result;
  const sorted = [...events].sort((a, b) => a.start_time - b.start_time || a.end_time - b.end_time);
  const colEnds: number[] = [];
  const colOf = new Map<string, number>();
  for (const ev of sorted) {
    let placed = false;
    for (let ci = 0; ci < colEnds.length; ci++) {
      if (colEnds[ci] <= ev.start_time) {
        colOf.set(ev.id, ci);
        colEnds[ci] = ev.end_time;
        placed = true;
        break;
      }
    }
    if (!placed) {
      colOf.set(ev.id, colEnds.length);
      colEnds.push(ev.end_time);
    }
  }
  let i = 0;
  while (i < sorted.length) {
    let clusterEnd = sorted[i].end_time;
    let maxCol = colOf.get(sorted[i].id)!;
    let j = i;
    while (j < sorted.length && sorted[j].start_time < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, sorted[j].end_time);
      maxCol = Math.max(maxCol, colOf.get(sorted[j].id)!);
      j++;
    }
    const cols = maxCol + 1;
    for (let k = i; k < j; k++) {
      result.set(sorted[k].id, { col: colOf.get(sorted[k].id)!, cols });
    }
    i = j;
  }
  return result;
}

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

const HourActivitiesPanel = ({
  hour,
  events,
  admins,
  currentUserId,
  onClose,
  onPick,
  onChanged,
}: {
  hour: number;
  events: CalendarEvent[];
  admins: CalendarAdmin[];
  currentUserId?: string;
  onClose: () => void;
  onPick: (ev: CalendarEvent) => void;
  onChanged: () => void;
}) => {
  const nextHour = hour + 60;
  const sorted = events.slice().sort((a, b) => a.start_time - b.start_time);
  const expanded = sorted.length > 0 && sorted.length <= 5;

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-2 sticky top-0 bg-background/95 backdrop-blur px-1 py-1 rounded">
        <div>
          <p className="text-xs text-muted-foreground">Activities</p>
          <p className="text-sm font-medium">
            {formatMinutes(hour)} – {formatMinutes(nextHour)} ET
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {events.length} {events.length === 1 ? 'activity' : 'activities'}
            {(() => {
              const people = new Set<string>();
              events.forEach((e) => {
                if (e.created_by) people.add(e.created_by);
                (e.assigned_to || []).forEach((id) => people.add(id));
              });
              return people.size > 0 ? ` · ${people.size} people` : '';
            })()}
          </span>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {events.length === 0 && (
        <Card className="p-4 border-[0.5px] text-center">
          <p className="text-xs text-muted-foreground">No activities scheduled this hour.</p>
        </Card>
      )}

      {expanded
        ? sorted.map((ev) => (
            <ActivityDetailPanel
              key={ev.id}
              event={ev}
              admins={admins}
              currentUserId={currentUserId}
              onClose={onClose}
              onChanged={onChanged}
              className="mt-0 mb-3"
            />
          ))
        : sorted.map((ev) => {
            const admin = admins.find((a) => a.user_id === ev.created_by);
            const color = admin?.color ?? colorForUserId(ev.created_by);
            return (
              <button
                key={ev.id}
                onClick={() => onPick(ev)}
                className="w-full text-left rounded-md p-2 mb-2 hover:bg-muted/60 transition-colors"
                style={{
                  background: color.bg,
                  borderLeft: `3px solid ${color.main}`,
                  border: `0.5px solid ${color.main}55`,
                  borderLeftWidth: 3,
                  borderRadius: 5,
                }}
              >
                <div className="flex items-center gap-2">
                  <AdminDot admin={admin} size={18} />
                  <span className="text-xs font-medium truncate" style={{ color: color.text }}>
                    {ev.title}
                  </span>
                </div>
                <p className="text-[10px] opacity-80 mt-0.5" style={{ color: color.text }}>
                  {admin?.name ?? 'Unassigned'} · {formatMinutes(ev.start_time)} – {formatMinutes(ev.end_time)}
                </p>
              </button>
            );
          })}
    </div>
  );
};

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
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(today);
  const [modalStart, setModalStart] = useState(9 * 60);
  const [modalAdmin, setModalAdmin] = useState<string | undefined>();
  const [modalEnd, setModalEnd] = useState<number | undefined>();
  const [modalAssignees, setModalAssignees] = useState<string[]>([]);

  // Drag-to-select cells in the day grid
  const [dragSel, setDragSel] = useState<{ a1: number; a2: number; s1: number; s2: number } | null>(null);
  const draggingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const up = () => { draggingRef.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // Pin the day-view header (open tasks + admin lane headers) to the top of the
  // viewport while scrolling. Done in JS because the header lives inside the
  // horizontal scroll wrapper (to stay aligned with the lanes), and CSS
  // position:sticky is trapped by the overflow-x container.
  useEffect(() => {
    if (view !== 'day') return;
    const wrapper = wrapperRef.current;
    const pinned = pinnedRef.current;
    if (!wrapper || !pinned) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const wTop = wrapper.getBoundingClientRect().top;
      const ph = pinned.offsetHeight;
      const max = wrapper.offsetHeight - ph;
      const ty = Math.max(0, Math.min(-wTop, max));
      pinned.style.transform = ty > 0 ? `translateY(${ty}px)` : '';
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(wrapper);
    ro.observe(pinned);
    update();
    return () => {
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [view]);

  const selBounds = dragSel
    ? {
        aMin: Math.min(dragSel.a1, dragSel.a2),
        aMax: Math.max(dragSel.a1, dragSel.a2),
        sMin: Math.min(dragSel.s1, dragSel.s2),
        sMax: Math.max(dragSel.s1, dragSel.s2),
      }
    : null;
  const selIsMulti = !!selBounds && (selBounds.aMax > selBounds.aMin || selBounds.sMax > selBounds.sMin);

  const monthStart = toDateString(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1));
  const monthEnd = toDateString(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0));

  const rangeStart = view === 'month' ? monthStart : selectedDate;
  const rangeEnd = view === 'month' ? monthEnd : selectedDate;
  const { events: rawEvents, refetch } = useCalendarEvents(rangeStart, rangeEnd);

  // The team calendar is shared: every admin sees all activities.
  // (Per-admin scoping lives in the hero banner stats, not here.)
  const events = rawEvents;

  const eventsForDate = useCallback(
    (dateStr: string) => {
      const dow = parseDateString(dateStr).getDay();
      return events
        .filter((e) => {
          if (e.event_date === dateStr) return true;
          if (e.is_recurring && e.event_date < dateStr) {
            const rule = e.recurrence_rule || 'weekly';
            const edow = parseDateString(e.event_date).getDay();
            if (rule === 'weekly') return edow === dow;
            if (rule === 'biweekly') {
              const diff = Math.round((parseDateString(dateStr).getTime() - parseDateString(e.event_date).getTime()) / 86400000);
              return edow === dow && diff % 14 === 0;
            }
            if (rule === 'monthly') return parseDateString(e.event_date).getDate() === parseDateString(dateStr).getDate();
          }
          return false;
        })
        .sort((a, b) => a.start_time - b.start_time);
    },
    [events]
  );

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

  const openModal = (
    date: string,
    start: number,
    adminId?: string,
    end?: number,
    assignees?: string[]
  ) => {
    setModalDate(date);
    setModalStart(start);
    setModalAdmin(adminId);
    setModalEnd(end);
    setModalAssignees(assignees ?? []);
    setModalOpen(true);
  };

  const openModalForSelection = () => {
    if (!selBounds) return;
    const laneAdmins = admins.slice(selBounds.aMin, selBounds.aMax + 1).map((a) => a.user_id);
    openModal(
      selectedDate,
      selBounds.sMin,
      laneAdmins[0],
      selBounds.sMax + 15,
      laneAdmins
    );
    setDragSel(null);
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
    setSelectedHour(null);
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

      <OpenTasksBar
        events={events.filter((e) => e.is_open_task || e.time_tbd)}
        admins={admins}
        currentUserId={user?.id}
        onChanged={refetch}
        onSelect={(ev) => goToDay(ev.event_date)}
      />

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
              <span className="flex items-center justify-between">
                <span className={`text-xs ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                  {parseDateString(date).getDate()}
                </span>
                {dayEvents.some((ev) => isDeadline(ev.event_type)) && (
                  <Flag className="h-3 w-3" style={{ color: DEADLINE_COLOR.main }} />
                )}
              </span>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 2).map((ev) => {
                  const admin = admins.find((a) => a.user_id === ev.created_by);
                  const deadline = isDeadline(ev.event_type);
                  const color = deadline ? DEADLINE_COLOR : admin?.color ?? colorForUserId(ev.created_by);
                  const done = !!ev.is_done;
                  return (
                    <div
                      key={ev.id}
                      className={`flex items-center gap-1 truncate rounded-[3px] px-1 py-0.5 text-[11px] ${
                        done ? 'line-through' : ''
                      }`}
                      style={{
                        background: color.bg,
                        color: color.text,
                        borderLeft: `3px solid ${color.main}`,
                        border: `0.5px solid ${color.main}55`,
                        borderLeftWidth: 3,
                        opacity: done ? 0.6 : 1,
                      }}
                    >
                      {deadline && <Flag className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{ev.title}</span>
                      {ev.pipeline_link && <Link2 className="h-2.5 w-2.5 shrink-0 opacity-70" />}
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
    const ticks: number[] = [];
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 15) ticks.push(m);
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
            {selIsMulti && (
              <span className="text-xs text-primary">Right-click the selection to add an activity</span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Legend admins={admins} />
            <Button size="sm" onClick={() => openModal(selectedDate, 9 * 60)}>
              <Plus className="h-4 w-4 mr-1" /> Add activity
            </Button>
          </div>
        </div>

        <div className="flex gap-4 items-start">

        <div ref={wrapperRef} className="overflow-x-auto overflow-y-hidden overscroll-y-auto flex-1 min-w-0">
          {/* Pinned header: open tasks + admin lane headers — stays at the top while scrolling */}
          <div ref={pinnedRef} data-calendar-pinned className="relative z-30 bg-background border-b border-border">
            <OpenTasksBar
              events={dayEvents.filter((e) => e.is_open_task || e.time_tbd)}
              admins={admins}
              currentUserId={user?.id}
              onChanged={refetch}
              onSelect={(ev) => setSelectedEvent(ev)}
            />
            <div className="flex w-full">
              <div className="w-[52px] shrink-0 h-9" />
              {admins.map((admin) => (
                <div
                  key={admin.user_id}
                  className="flex h-9 flex-1 min-w-[120px] items-center gap-1.5 border-l-[0.5px] border-border px-2"
                  style={{ background: admin.color.bg }}
                >
                  <AdminDot admin={admin} size={24} />
                  <span className="truncate text-xs" style={{ color: admin.color.text }}>
                    {admin.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex w-full">
            {/* time column */}
            <div className="w-[52px] shrink-0">
              <div className="relative" style={{ height: gridHeight }}>
                {ticks.map((m) => {
                  const isHour = m % 60 === 0;
                  const isHalf = m % 30 === 0;
                  return (
                    <button
                      key={m}
                      onClick={() => { setSelectedHour(m); setSelectedEvent(null); }}
                      title={`Show activities at ${formatMinutes(m)}`}
                      className={`absolute right-1 -translate-y-1/2 rounded px-1 py-0.5 transition-colors ${
                        isHour
                          ? selectedHour === m
                            ? 'bg-primary text-primary-foreground font-semibold text-[10px]'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground text-[10px] font-medium'
                          : isHalf
                            ? selectedHour === m
                              ? 'bg-primary text-primary-foreground text-[9px]'
                              : 'text-muted-foreground/50 hover:bg-muted hover:text-foreground text-[9px]'
                            : selectedHour === m
                              ? 'bg-primary text-primary-foreground text-[8px]'
                              : 'text-muted-foreground/25 hover:bg-muted hover:text-foreground text-[8px]'
                      }`}
                      style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}
                    >
                      {isHour || isHalf ? formatMinutes(m) : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* admin lanes */}
            {admins.map((admin, adminIdx) => {
              const laneEvents = dayEvents.filter(
                (e) =>
                  !e.is_open_task &&
                  !e.time_tbd &&
                  (e.created_by === admin.user_id || (e.assigned_to || []).includes(admin.user_id))
              );
              const laneLayout = computeOverlapLayout(laneEvents);

              return (
                <div key={admin.user_id} className="flex-1 min-w-[120px] border-l-[0.5px] border-border">
                  <div className="relative" style={{ height: gridHeight }}>
                    {/* slots */}
                    {Array.from({ length: totalMinutes / 15 }).map((_, i) => {
                      const slotStart = DAY_START_MIN + i * 15;
                      const isHour = slotStart % 60 === 0;
                      const isHalf = slotStart % 30 === 0;
                      const isSelected =
                        !!selBounds &&
                        adminIdx >= selBounds.aMin &&
                        adminIdx <= selBounds.aMax &&
                        slotStart >= selBounds.sMin &&
                        slotStart <= selBounds.sMax;
                      return (
                        <button
                          key={slotStart}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            draggingRef.current = true;
                            setSelectedEvent(null);
                            setDragSel({ a1: adminIdx, a2: adminIdx, s1: slotStart, s2: slotStart });
                          }}
                          onMouseEnter={() => {
                            if (!draggingRef.current) return;
                            setDragSel((prev) => (prev ? { ...prev, a2: adminIdx, s2: slotStart } : prev));
                          }}
                          onMouseUp={() => {
                            draggingRef.current = false;
                            if (!selIsMulti) {
                              setDragSel(null);
                              openModal(selectedDate, slotStart, admin.user_id);
                            }
                          }}
                          onContextMenu={(e) => {
                            if (!selIsMulti) return;
                            e.preventDefault();
                            openModalForSelection();
                          }}
                          className={`absolute left-0 right-0 ${isSelected ? 'bg-primary/20' : 'hover:bg-muted/40'}`}
                          style={{
                            top: i * SLOT_HEIGHT,
                            height: SLOT_HEIGHT,
                            borderTop: `${isHour ? 1 : isHalf ? 0.5 : 0.5}px solid ${isHour ? 'hsl(var(--border))' : isHalf ? 'hsl(var(--border) / 0.5)' : 'hsl(var(--border) / 0.25)'}`,
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
                      const deadline = isDeadline(ev.event_type);
                      const color = deadline ? DEADLINE_COLOR : admin.color;
                      const done = !!ev.is_done;
                      const lay = laneLayout.get(ev.id) ?? { col: 0, cols: 1 };
                      const leftPct = (lay.col / lay.cols) * 100;
                      const widthPct = (1 / lay.cols) * 100;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="absolute z-10 overflow-hidden px-1 py-0.5 text-left"
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                            background: color.bg,
                            color: color.text,
                            borderLeft: `3px solid ${color.main}`,
                            border: selected ? `1.5px solid ${color.main}` : `0.5px solid ${color.main}55`,
                            borderLeftWidth: 3,
                            borderRadius: 5,
                            opacity: done ? 0.6 : 1,
                            textDecoration: done ? 'line-through' : undefined,
                          }}
                        >
                          {done && (
                            <CheckCircle2 className="absolute right-1 top-0.5 h-3 w-3 text-emerald-600" />
                          )}
                          {height <= 28 ? (
                            <span className="flex items-center gap-1 truncate text-[10px] leading-[16px]">
                              {deadline ? <Flag className="h-2.5 w-2.5 shrink-0" /> : <span>{admin.initial}</span>}
                              <span className="truncate">{ev.title}</span>
                              {ev.pipeline_link && <Link2 className="h-2.5 w-2.5 shrink-0 opacity-70" />}
                            </span>
                          ) : height <= 70 ? (
                            <>
                              <span className="flex items-center gap-1 text-[10px] leading-tight">
                                {deadline && <Flag className="h-2.5 w-2.5 shrink-0" />}
                                <span className="truncate">{ev.title}</span>
                                {ev.pipeline_link && <Link2 className="h-2.5 w-2.5 shrink-0 opacity-70" />}
                              </span>
                              <span className="block text-[9px] opacity-80">● {formatMinutes(ev.start_time)}</span>
                            </>
                          ) : (
                            <>
                              <span className="flex items-center gap-1 text-[11px] leading-tight">
                                {deadline && <Flag className="h-3 w-3 shrink-0" />}
                                <span className="truncate">{ev.title}</span>
                                {ev.pipeline_link && <Link2 className="h-3 w-3 shrink-0 opacity-70" />}
                              </span>
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
        {!selectedEvent && selectedHour !== null && (
          <div className="w-[340px] shrink-0 hidden lg:block sticky top-4">
            <HourActivitiesPanel
              hour={selectedHour}
              events={dayEvents.filter(
                (e) => e.start_time < selectedHour + 60 && e.end_time > selectedHour
              )}
              admins={admins}
              currentUserId={user?.id}
              onClose={() => setSelectedHour(null)}
              onPick={(ev) => setSelectedEvent(ev)}
              onChanged={refetch}
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
        defaultEnd={modalEnd}
        defaultAdminId={modalAdmin}
        defaultAssignees={modalAssignees}
        admins={admins}
        currentUserId={user?.id}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default TeamCalendar;
