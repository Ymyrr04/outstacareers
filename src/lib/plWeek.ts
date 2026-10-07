import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_CLIENT_ID } from '@/lib/internalCompany';
import clientRateFallbackData from '@/data/clientRateFallback.json';

export const SYNC_START = '2026-09-21';

const clientRateFallback = clientRateFallbackData as Record<string, number>;
const normalizeName = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
export const lookupFallbackClientRate = (name: string | null | undefined): number => {
  if (!name) return 0;
  return clientRateFallback[normalizeName(name)] ?? 0;
};

export const mondayOf = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
};

export const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export interface PlAssignment {
  id: string;
  applicant_id: string | null;
  client_id: string | null;
  status: string;
  hourly_rate: number | null;
  client_deposit?: number | null;
  contractor_deposit?: number | null;
  client_deposit_text?: string | null;
  contractor_deposit_text?: string | null;
  client_rate: number | null;
  hours_per_week: number | null;
  start_date: string | null;
  end_date: string | null;
  sunday_hours_excluded: boolean | null;
  applicant: { full_name: string | null } | null;
  client: { company_name: string | null } | null;
}

export interface PlTimesheet {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  notes: string | null;
  incentive_amount: number | null;
  daily_hours: Record<string, { hours?: number; reason?: string }> | null;
}

export interface PlFees {
  expensePct: number;
  incomePct: number;
}

export interface PlWeekRow {
  assignment: PlAssignment;
  timesheet: PlTimesheet | null;
  actualHours: number;
  overtime: number;
  standardHours: number;
  hourlyRate: number;
  clientRate: number;
  expenses: number;
  expenseAfter: number;
  income: number;
  incomeAfter: number;
  grossProfit: number;
  grossAfter: number;
  clientDeposit: number | string | null;
  contractorDeposit: number | string | null;
  bonus: number | null;
}

export async function computePlWeek(
  weekMondayStr: string,
  fees: PlFees,
  { includeInternal = false }: { includeInternal?: boolean } = {},
): Promise<PlWeekRow[]> {
  const weekMonday = new Date(weekMondayStr + 'T00:00:00');
  const weekEnding = new Date(weekMonday);
  weekEnding.setDate(weekEnding.getDate() + 6);
  const weekEndingStr = ymd(weekEnding);

  // Active OR terminated whose end_date >= week start
  const { data: aData, error: aErr } = await supabase
    .from('contractor_assignments')
    .select(`id, applicant_id, client_id, status, hourly_rate, client_rate, client_deposit, contractor_deposit, client_deposit_text, contractor_deposit_text, hours_per_week, start_date, end_date, sunday_hours_excluded,
             applicant:applicants_prescreen(full_name),
             client:clients(company_name)`)
    .or(`status.eq.active,and(status.eq.terminated,end_date.gte.${weekMondayStr})`);
  if (aErr) throw aErr;

  // Skip contractors whose start date is after this week ends — they weren't working yet.
  const active = ((aData as any as PlAssignment[]) || []).filter(
    (a) => !a.start_date || String(a.start_date).slice(0, 10) <= weekEndingStr,
  );
  const ids = active.map((a) => a.id);
  let tsRows: PlTimesheet[] = [];
  if (ids.length) {
    const { data: tData, error: tErr } = await supabase
      .from('contractor_timesheets')
      .select('id, contractor_assignment_id, week_ending_date, total_hours, overtime_hours, notes, incentive_amount, daily_hours')
      .in('contractor_assignment_id', ids)
      .gte('week_ending_date', weekMondayStr)
      .lte('week_ending_date', weekEndingStr);
    if (tErr) throw tErr;
    tsRows = (tData as any as PlTimesheet[]) || [];
  }

  const tsMap = new Map<string, PlTimesheet>();
  // If a contractor has more than one submission in the week, keep the one
  // with the latest week-ending date (e.g. the resubmission that adds OT).
  tsRows.forEach((t) => {
    const prev = tsMap.get(t.contractor_assignment_id);
    if (!prev || String(t.week_ending_date) > String(prev.week_ending_date)) {
      tsMap.set(t.contractor_assignment_id, t);
    }
  });

  const expMul = 1 + fees.expensePct / 100;
  const incMul = 1 - fees.incomePct / 100;

  return active
    .filter((a) => includeInternal || a.client_id !== INTERNAL_CLIENT_ID)
    .map((a) => {
      const ts = tsMap.get(a.id) || null;
      let actualHours = Number(ts?.total_hours || 0);
      // Sunday exclusion (date keys parsed as UTC). The portal may already have
      // left Sunday out of total_hours, so use the sum of non-Sunday days
      // (capped at total_hours) instead of subtracting Sunday a second time.
      if (ts && a.sunday_hours_excluded && ts.daily_hours) {
        try {
          const dh = ts.daily_hours as Record<string, { hours?: number }>;
          let nonSun = 0;
          let any = false;
          Object.entries(dh).forEach(([date, v]) => {
            const d = new Date(date + 'T00:00:00Z');
            if (isNaN(d.getTime())) return;
            any = true;
            if (d.getUTCDay() !== 0) nonSun += Number(v?.hours || 0);
          });
          if (any) actualHours = Math.min(actualHours, nonSun);
        } catch {}
      }
      const hourlyRate = Number(a.hourly_rate || 0);
      const clientRate = Number(a.client_rate || 0) || lookupFallbackClientRate(a.applicant?.full_name);
      const standardHours = Number(a.hours_per_week || 0);
      const overtime = Number(ts?.overtime_hours || 0);
      const hasHours = actualHours > 0;

      const expenses = hasHours ? hourlyRate * actualHours : 0;
      const income = hasHours ? clientRate * actualHours : 0;
      const expenseAfter = hasHours ? expenses * expMul : 0;
      const incomeAfter = hasHours ? income * incMul : 0;
      const grossProfit = hasHours ? income - expenses : 0;
      const grossAfter = hasHours ? incomeAfter - expenseAfter : 0;

      const clientDeposit = a.client_deposit_text || (a.client_deposit != null ? Number(a.client_deposit) : null);
      const contractorDeposit = a.contractor_deposit_text || (a.contractor_deposit != null ? Number(a.contractor_deposit) : null);

      return {
        assignment: a,
        timesheet: ts,
        actualHours,
        overtime,
        standardHours,
        hourlyRate,
        clientRate,
        expenses,
        expenseAfter,
        income,
        incomeAfter,
        grossProfit,
        grossAfter,
        clientDeposit,
        contractorDeposit,
        bonus: ts?.incentive_amount != null ? Number(ts.incentive_amount) : null,
      };
    });
}
