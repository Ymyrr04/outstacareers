// Security deposit schedule.
// Required deposit = 2 x standard hours/week (in hours, valued at the hourly rate).
// Default: the full standard hours are held each week (done in 2 weeks).
// With an arrangement (deposit_per_week in hours or USD), only that much is held
// per week, so collection spreads over more weeks until the required total is met.

export type DepositUnit = 'hours' | 'amount';

export interface DepositAssignment {
  start_date: string | null;
  hours_per_week: number | null;
  hourly_rate: number | null;
  deposit_per_week?: number | null;
  deposit_per_week_unit?: string | null;
  deposit_target?: number | null;
  deposit_target_unit?: string | null;
}

export interface DepositTs { id: string; week_ending_date: string; total_hours: number }

export interface DepositWeek {
  depositHours: number; isDeposit: boolean; weekIndex: number | null;
  /** 'complete' = target reached this week; 'excess' = this week went over the target */
  targetStatus?: 'complete' | 'excess' | null;
  excessHours?: number;
  excessAmount?: number;
}

export const hasDepositTarget = (a: DepositAssignment) => a.deposit_target != null && Number(a.deposit_target) > 0;

export const requiredDepositHours = (a: DepositAssignment): number => {
  if (hasDepositTarget(a)) {
    if (a.deposit_target_unit === 'hours') return Number(a.deposit_target);
    const rate = Number(a.hourly_rate || 0);
    return rate > 0 ? Number(a.deposit_target) / rate : 0;
  }
  return 2 * Number(a.hours_per_week || 0);
};

export const weeklyDepositCapHours = (a: DepositAssignment): number => {
  const hpw = Number(a.hours_per_week || 0);
  const v = a.deposit_per_week;
  if (v == null || !(Number(v) > 0)) return hpw;
  if (a.deposit_per_week_unit === 'amount') {
    const rate = Number(a.hourly_rate || 0);
    return rate > 0 ? Number(v) / rate : hpw;
  }
  return Number(v);
};

/** Returns deposit info per timesheet id for one contractor. */
export const computeDepositSchedule = (a: DepositAssignment, timesheets: DepositTs[]): Map<string, DepositWeek> => {
  const out = new Map<string, DepositWeek>();
  const required = requiredDepositHours(a);
  if (!a.start_date || !required) return out;
  const start = new Date(a.start_date).getTime();
  const cap = weeklyDepositCapHours(a);
  let remaining = required;
  let n = 0;
  const sorted = [...timesheets]
    .filter((t) => new Date(t.week_ending_date).getTime() >= start)
    .sort((x, y) => x.week_ending_date.localeCompare(y.week_ending_date));
  for (const t of sorted) {
    if (remaining <= 0.0001) { out.set(t.id, { depositHours: 0, isDeposit: false, weekIndex: null }); continue; }
    if (hasDepositTarget(a)) {
      // With a threshold, the weekly arrangement is held in full; flag completion / excess.
      const take = Math.max(0, Math.min(Number(t.total_hours) || 0, cap));
      const before = remaining;
      remaining -= take;
      let targetStatus: DepositWeek['targetStatus'] = null;
      let excessHours = 0;
      if (remaining < -0.0001) { targetStatus = 'excess'; excessHours = take - before; }
      else if (remaining <= 0.0001) targetStatus = 'complete';
      out.set(t.id, { depositHours: take, isDeposit: true, weekIndex: n++, targetStatus, excessHours, excessAmount: excessHours * Number(a.hourly_rate || 0) });
      continue;
    }
    const take = Math.max(0, Math.min(Number(t.total_hours) || 0, cap, remaining));
    remaining -= take;
    out.set(t.id, { depositHours: take, isDeposit: true, weekIndex: n++ });
  }
  return out;
};

export const describeArrangement = (a: DepositAssignment): string => {
  const v = a.deposit_per_week;
  if (v == null || !(Number(v) > 0)) return 'Standard (full hours, 2 weeks)';
  return a.deposit_per_week_unit === 'amount' ? `$${Number(v).toFixed(2)}/week` : `${Number(v)}h/week`;
};
