import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus, X, Flag, Link2, CheckCircle2 } from 'lucide-react';
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
  isDeadline,
  DEADLINE_COLOR,
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

  useEffect(() => {
    const up = () => { draggingRef.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

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
      selBounds.sMax + 30,
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
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 30) ticks.push(m);
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
        <div className="overflow-x-auto flex-1 min-w-0">
          <div className="flex w-full">
            {/* time column */}
            <div className="w-[52px] shrink-0">
              <div className="h-9 border-b-[0.5px] border-border" />
              <div className="relative" style={{ height: gridHeight }}>
                {ticks.map((m) => {
                  const isHour = m % 60 === 0;
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
                          : selectedHour === m
                            ? 'bg-primary text-primary-foreground text-[9px]'
                            : 'text-muted-foreground/50 hover:bg-muted hover:text-foreground text-[9px]'
                      }`}
                      style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}
                    >
                      {formatMinutes(m)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* admin lanes */}
            {admins.map((admin, adminIdx) => {
              const laneEvents = dayEvents.filter(
                (e) => e.created_by === admin.user_id || (e.assigned_to || []).includes(admin.user_id)
              );
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
                      const deadline = isDeadline(ev.event_type);
                      const color = deadline ? DEADLINE_COLOR : admin.color;
                      const done = !!ev.is_done;
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
