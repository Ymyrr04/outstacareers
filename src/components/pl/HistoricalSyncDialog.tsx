import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { computePlWeek, mondayOf, ymd, SYNC_START, type PlFees, type PlWeekRow } from '@/lib/plWeek';

export const SYNC_FILENAME = 'Timesheet sync';

/** Monday of the most recent fully completed (Mon–Sun) week. */
export const lastCompletedMonday = () => {
  const m = mondayOf(new Date());
  m.setDate(m.getDate() - 7);
  return ymd(m);
};

const parseYmd = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const weekLabelOf = (monday: string) =>
  `${format(parseYmd(monday), 'MMMM d')} - ${format(parseYmd(addDays(monday, 6)), 'MMMM d')}`;

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface MappedRow {
  week_label: string; week_start: string; week_end: string;
  contractor_name: string | null; company: string | null;
  hours: number | null; actual_hours: number | null; contractor_rate: number | null; client_rate: number | null;
  contractor_cost: number; client_billing: number;
  expense_after_1_percent: number; income_after_3_percent: number;
  margin: number | null; gross_after_deductions: number;
  client_deposit: number | null; contractor_deposit: number | null;
  bonus: number | null;
  raw: Record<string, unknown>;
}

function mapRow(r: PlWeekRow, monday: string, fees: PlFees): MappedRow {
  const numDep = (v: number | string | null) => (typeof v === 'number' ? v : null);
  const txtDep = (v: number | string | null) => (typeof v === 'string' ? v : null);
  return {
    week_label: weekLabelOf(monday),
    week_start: monday,
    week_end: addDays(monday, 6),
    contractor_name: r.assignment.applicant?.full_name ?? null,
    company: r.assignment.client?.company_name ?? null,
    hours: r.standardHours,
    actual_hours: r.actualHours,
    contractor_rate: r.hourlyRate,
    client_rate: r.clientRate,
    contractor_cost: r.expenses,
    client_billing: r.income,
    expense_after_1_percent: r.expenseAfter,
    income_after_3_percent: r.incomeAfter,
    margin: r.grossProfit,
    gross_after_deductions: r.grossAfter,
    client_deposit: numDep(r.clientDeposit),
    contractor_deposit: numDep(r.contractorDeposit),
    bonus: r.bonus,
    raw: {
      source: 'timesheet_sync',
      fees: { expense_pct: fees.expensePct, income_pct: fees.incomePct },
      assignment_id: r.assignment.id,
      timesheet_id: r.timesheet?.id ?? null,
      client_deposit_text: txtDep(r.clientDeposit),
      contractor_deposit_text: txtDep(r.contractorDeposit),
      bonus: r.bonus,
    },
  };
}

// Bonus goes on its own row (like the spreadsheet): expense = bonus, income = bonus x 1.2,
// with the same after-fee math, so it is included in every total.
export const BONUS_MARKUP = 1.2;
const r2 = (n: number) => Math.round(n * 100) / 100;
function bonusRow(base: MappedRow, bonus: number, fees: PlFees): MappedRow {
  const expenseAfter = r2(bonus * (1 + fees.expensePct / 100));
  const income = r2(bonus * BONUS_MARKUP);
  const incomeAfter = r2(income * (1 - fees.incomePct / 100));
  return {
    ...base,
    hours: null, actual_hours: null, contractor_rate: null, client_rate: null,
    contractor_cost: bonus, client_billing: income,
    expense_after_1_percent: expenseAfter, income_after_3_percent: incomeAfter,
    margin: null, gross_after_deductions: r2(incomeAfter - expenseAfter),
    client_deposit: null, contractor_deposit: null, bonus: null,
    raw: { ...base.raw, kind: 'bonus', bonus_amount: bonus, bonus_markup: BONUS_MARKUP, bonus: null },
  };
}
function mapWithBonus(r: PlWeekRow, monday: string, fees: PlFees): MappedRow[] {
  const base = { ...mapRow(r, monday, fees), bonus: null };
  base.raw = { ...base.raw, bonus: null };
  const b = r.bonus != null ? Number(r.bonus) : 0;
  return b > 0 ? [base, bonusRow(base, b, fees)] : [base];
}

type Col = { key: keyof MappedRow; label: string; kind?: 'hours' | 'money' | 'rate'; width: string };
const COLS: Col[] = [
  { key: 'contractor_name', label: 'Contractor', width: 'w-[220px] min-w-[220px] max-w-[220px]' },
  { key: 'company', label: 'Company', width: 'w-[180px] min-w-[180px] max-w-[180px]' },
  { key: 'hours', label: 'Standard hours', kind: 'hours', width: 'w-[130px] min-w-[130px]' },
  { key: 'actual_hours', label: 'Actual hours', kind: 'hours', width: 'w-[120px] min-w-[120px]' },
  { key: 'contractor_rate', label: 'Contractor rate', kind: 'rate', width: 'w-[140px] min-w-[140px]' },
  { key: 'client_rate', label: 'Client rate', kind: 'rate', width: 'w-[120px] min-w-[120px]' },
    { key: 'contractor_cost', label: 'Expense', kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'expense_after_1_percent', label: 'Expense after 1%', kind: 'money', width: 'w-[150px] min-w-[150px]' },
  { key: 'client_billing', label: 'Income', kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'income_after_3_percent', label: 'Income after 3%', kind: 'money', width: 'w-[150px] min-w-[150px]' },
  { key: 'margin', label: 'Gross profit', kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'gross_after_deductions', label: 'Gross after deductions', kind: 'money', width: 'w-[180px] min-w-[180px]' },
  { key: 'client_deposit', label: 'Client deposit', kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'contractor_deposit', label: 'Contractor deposit', kind: 'money', width: 'w-[160px] min-w-[160px]' },
];
const fmt = (c: Col, v: unknown) =>
  v == null || Number.isNaN(Number(v)) ? '—' : c.kind === 'hours' ? Number(v).toFixed(2) : money(Number(v));

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialWeek?: string;
  onSynced: (year: number) => void;
}

export function HistoricalSyncDialog({ open, onOpenChange, initialWeek, onSynced }: Props) {
  const maxWeek = lastCompletedMonday();
  const [week, setWeek] = useState(initialWeek ?? maxWeek);
  const [fees, setFees] = useState<PlFees | null>(null);
  const [rows, setRows] = useState<MappedRow[] | null>(null);
  const [noTimesheet, setNoTimesheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setWeek(initialWeek ?? lastCompletedMonday()); }, [open, initialWeek]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase.from('pl_fee_settings').select('expense_pct, income_pct').maybeSingle();
      setFees({ expensePct: data ? Number(data.expense_pct) : 1, incomePct: data ? Number(data.income_pct) : 3 });
    })();
  }, [open]);

  const weekError = useMemo(() => {
    if (!week) return 'Pick a week';
    if (mondayOf(parseYmd(week)).getTime() !== parseYmd(week).getTime()) return 'Pick a Monday';
    if (week < SYNC_START) return `Weeks before ${SYNC_START} cannot be synced`;
    if (week > maxWeek) return 'Only completed weeks can be synced';
    return null;
  }, [week, maxWeek]);

  useEffect(() => {
    if (!open || !fees) return;
    setRows(null); setError(null);
    if (weekError) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const y = Number(week.slice(0, 4));
        const { data: ub, error: ubErr } = await supabase
          .from('historical_pl_batches').select('id').eq('year', y).eq('source', 'upload');
        if (ubErr) throw ubErr;
        const ubIds = (ub ?? []).map((b) => b.id);
        if (ubIds.length) {
          const { count, error: cErr } = await supabase
            .from('historical_pl_rows').select('id', { count: 'exact', head: true })
            .in('batch_id', ubIds).eq('week_start', week);
          if (cErr) throw cErr;
          if ((count ?? 0) > 0) { if (!cancelled) setError('This week came from an upload'); return; }
        }
        const res = await computePlWeek(week, fees, { includeInternal: true });
        if (cancelled) return;
        setNoTimesheet(res.filter((r) => !r.timesheet).length);
        setHeadcount(res.length);
        setRows(res.flatMap((r) => mapWithBonus(r, week, fees)));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load the week');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fees, week, weekError]);

  const totals = useMemo(() => {
    const s = (k: keyof MappedRow) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      hours: s('actual_hours'), expense: s('expense_after_1_percent'),
      income: s('income_after_3_percent'), gross: s('gross_after_deductions'),
    };
  }, [rows]);

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    const y = Number(week.slice(0, 4));
    let insertedIds: string[] = [];
    try {
      // Find or create the year's sync batch.
      const { data: existing, error: fErr } = await supabase
        .from('historical_pl_batches').select('id').eq('year', y).eq('source', 'timesheet_sync')
        .order('created_at', { ascending: true }).limit(1);
      if (fErr) throw fErr;
      let batchId = existing?.[0]?.id as string | undefined;
      if (!batchId) {
        const { data: u } = await supabase.auth.getUser();
        const { data: nb, error: cErr } = await supabase.from('historical_pl_batches')
          .insert({ year: y, source: 'timesheet_sync', filename: SYNC_FILENAME, uploaded_by: u.user?.id ?? null } as any)
          .select('id').single();
        if (cErr) throw cErr;
        batchId = nb.id;
      }

      // Insert new rows first.
      if (rows.length) {
        const { data: ins, error: iErr } = await supabase.from('historical_pl_rows')
          .insert(rows.map(({ bonus, ...r }) => ({ ...r, batch_id: batchId })) as any).select('id');
        if (iErr) throw iErr;
        insertedIds = (ins ?? []).map((r) => r.id);
      }

      // Then remove the previous rows for this week in the batch.
      let del = supabase.from('historical_pl_rows').delete().eq('batch_id', batchId!).eq('week_start', week);
      if (insertedIds.length) del = del.not('id', 'in', `(${insertedIds.join(',')})`);
      const { error: dErr } = await del;
      if (dErr) throw dErr;

      const { error: upErr } = await supabase.from('historical_pl_batches')
        .update({ updated_at: new Date().toISOString() } as any).eq('id', batchId!);
      if (upErr) throw upErr;

      toast.success(`${weekLabelOf(week)} synced`);
      onSynced(y);
      onOpenChange(false);
    } catch (e: any) {
      if (insertedIds.length) {
        await supabase.from('historical_pl_rows').delete().in('id', insertedIds);
      }
      toast.error(e?.message || 'Sync failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-[95vw] max-h-[92vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Sync from timesheets</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Week starting (Monday)</span>
            <Input type="date" value={week} min={SYNC_START} max={maxWeek} step={7}
              onChange={(e) => setWeek(e.target.value)} className="h-9 w-[180px]" />
          </label>
          {!weekError && <div className="text-sm pb-2">{weekLabelOf(week)}</div>}
        </div>

        {weekError || error ? (
          <div className="text-sm text-destructive">{weekError || error}</div>
        ) : loading || !rows ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading week…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                ['Hours', totals.hours.toFixed(2), 'Actual hours'],
                ['Expense', money(totals.expense), 'Expense after 1%'],
                ['Income', money(totals.income), 'Income after 3%'],
                ['Gross', money(totals.gross), 'Gross after deductions'],
                ['Headcount', String(headcount), 'Contractors'],
                ['No timesheet', String(noTimesheet), 'Contractors'],
              ].map(([l, v, c]) => (
                <div key={l} className="border rounded-lg p-3">
                  <div className="text-xs uppercase text-muted-foreground">{l}</div>
                  <div className="text-lg font-semibold tabular-nums whitespace-nowrap">{v}</div>
                  <div className="text-xs text-muted-foreground">{c}</div>
                </div>
              ))}
            </div>
            <div className="border rounded-lg overflow-auto max-h-[50vh] min-h-0">
              <table className="w-max min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    {COLS.map((c, i) => (
                      <th key={c.key} className={cn('sticky top-0 bg-background border-b h-10 px-3 font-medium text-muted-foreground whitespace-nowrap',
                        i === 0 ? 'left-0 z-30 border-r' : 'z-20', c.width, c.kind ? 'text-right' : 'text-left')}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={COLS.length} className="text-center text-muted-foreground py-8">No contractors this week</td></tr>
                  ) : rows.map((r) => (
                    <tr key={String(r.raw.assignment_id)} className="group">
                      {COLS.map((c, i) => c.kind ? (
                        <td key={c.key} className={cn('px-3 py-2 border-b bg-background group-hover:bg-muted text-right tabular-nums whitespace-nowrap', c.width)}>
                          {c.key === 'client_deposit' && r.raw.client_deposit_text ? String(r.raw.client_deposit_text)
                            : c.key === 'contractor_deposit' && r.raw.contractor_deposit_text ? String(r.raw.contractor_deposit_text)
                            : fmt(c, r[c.key])}
                        </td>
                      ) : (
                        <td key={c.key} className={cn('px-3 py-2 border-b bg-background group-hover:bg-muted', c.width, i === 0 && 'sticky left-0 z-10 border-r font-medium')}>
                          <div className="truncate" title={(r[c.key] as string) || undefined}>{(r[c.key] as string) || '—'}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading || !rows || !!weekError || !!error}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
