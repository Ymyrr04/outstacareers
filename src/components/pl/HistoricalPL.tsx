import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronRight, Loader2, Upload, Trash2, Columns3, ArrowUpDown, Search, BarChart3, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HistoricalSyncDialog, lastCompletedMonday, weekLabelOf, loadInternalWeekRows } from './HistoricalSyncDialog';
import { SYNC_START } from '@/lib/plWeek';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HistoricalUploadDialog, HIST_YEARS } from './HistoricalUploadDialog';
import { HistoricalRemapDialog } from './HistoricalRemapDialog';
import { HEADCOUNT_EXCLUDED_NAMES } from '@/lib/internalCompany';


const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type NumKey = 'hours' | 'actual_hours' | 'contractor_rate' | 'client_rate' | 'contractor_cost' | 'expense_after_1_percent'
  | 'client_billing' | 'income_after_3_percent' | 'margin' | 'gross_after_deductions' | 'client_deposit' | 'contractor_deposit';

// Headline figures come from the after-fee columns.
const COST_KEY: NumKey = 'expense_after_1_percent';
const BILLING_KEY: NumKey = 'income_after_3_percent';
const MARGIN_KEY: NumKey = 'gross_after_deductions';

// Sum a field across rows; has=false when no row has a value (missing, not zero).
const sumField = (rows: HistRow[], key: NumKey) => {
  let total = 0, has = false;
  for (const r of rows) {
    const v = r[key];
    if (v != null && !Number.isNaN(Number(v))) { has = true; total += Number(v); }
  }
  return { total, has };
};
const fmtMaybe = (f: { total: number; has: boolean }) => (f.has ? money(f.total) : '—');
type SortKey = 'contractor_name' | 'company' | 'bonus' | 'markup' | NumKey;
interface SortState { key: SortKey; dir: 'asc' | 'desc' }
type Col = { key: SortKey; label: string; numeric?: boolean; kind?: 'hours' | 'money' | 'rate'; width?: string };
// Bonus from the timesheet submission lives in raw (synced weeks only); display-only.
// On a bonus row the amount itself is stored as raw.bonus_amount (same as the row's Expense).
const bonusOf = (r: HistRow): number | null => {
  const raw = r.raw as any;
  if (raw?.kind === 'bonus' && raw?.bonus_amount != null) return Number(raw.bonus_amount);
  const b = raw?.bonus;
  if (b != null && !Number.isNaN(Number(b))) return Number(b);
  // Row with an expense but no contractor/client rate = a bonus row (e.g. uploaded sheets)
  const exp = r.contractor_cost;
  if (exp != null && Number(exp) !== 0 && r.contractor_rate == null && r.client_rate == null) return Number(exp);
  return null;
};
const SORTABLE: Col[] = [
  { key: 'contractor_name', label: 'Contractor', width: 'w-[220px] min-w-[220px] max-w-[220px]' },
  { key: 'company', label: 'Company', width: 'w-[180px] min-w-[180px] max-w-[180px]' },
  { key: 'hours', label: 'Standard hours', numeric: true, kind: 'hours', width: 'w-[130px] min-w-[130px]' },
  { key: 'actual_hours', label: 'Actual hours', numeric: true, kind: 'hours', width: 'w-[120px] min-w-[120px]' },
  { key: 'contractor_rate', label: 'Contractor rate', numeric: true, kind: 'rate', width: 'w-[140px] min-w-[140px]' },
  { key: 'client_rate', label: 'Client rate', numeric: true, kind: 'rate', width: 'w-[120px] min-w-[120px]' },
  { key: 'bonus', label: 'Bonus', numeric: true, kind: 'money', width: 'w-[110px] min-w-[110px]' },
  { key: 'contractor_cost', label: 'Expense', numeric: true, kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'expense_after_1_percent', label: 'Expense after 1%', numeric: true, kind: 'money', width: 'w-[150px] min-w-[150px]' },
  { key: 'client_billing', label: 'Income', numeric: true, kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'income_after_3_percent', label: 'Income after 3%', numeric: true, kind: 'money', width: 'w-[150px] min-w-[150px]' },
  { key: 'margin', label: 'Gross profit', numeric: true, kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'gross_after_deductions', label: 'Gross after deductions', numeric: true, kind: 'money', width: 'w-[180px] min-w-[180px]' },
  { key: 'client_deposit', label: 'Client deposit', numeric: true, kind: 'money', width: 'w-[130px] min-w-[130px]' },
  { key: 'contractor_deposit', label: 'Contractor deposit', numeric: true, kind: 'money', width: 'w-[160px] min-w-[160px]' },
  { key: 'markup', label: 'Markup rate', numeric: true, kind: 'rate', width: 'w-[120px] min-w-[120px]' },
];
const NUM_COL = 'w-[56px] min-w-[56px] max-w-[56px]';
const STATUS_COL = 'w-[130px] min-w-[130px] max-w-[130px]';
const statusOf = (r: HistRow): string => String((r.raw as Record<string, unknown> | null)?.Status ?? '').trim();
const isRowExcluded = (r: HistRow) => !!(r.raw && (r.raw as Record<string, unknown>).__exclude_headcount);
const fmtCell = (c: Col, v: number | null | undefined) =>
  v == null || Number.isNaN(Number(v)) ? '—' : c.kind === 'hours' ? Number(v).toFixed(2) : money(Number(v));


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pct = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

interface Props { onUpload?: (year: number) => void }

export function HistoricalPL({ onUpload }: Props) {
  const [year, setYear] = useState(HIST_YEARS[HIST_YEARS.length - 1]);
  const [uploadIds, setUploadIds] = useState<string[]>([]);
  const [syncIds, setSyncIds] = useState<string[]>([]);
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openWeekKey, setOpenWeekKey] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [remapOpen, setRemapOpen] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const [query, setQuery] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncWeek, setSyncWeek] = useState<string | undefined>(undefined);
  const [readyWeek, setReadyWeek] = useState<string | null>(null);

  const checkReady = useCallback(async () => {
    const w = lastCompletedMonday();
    if (w < SYNC_START) { setReadyWeek(null); return; }
    const { count, error } = await supabase
      .from('historical_pl_rows').select('id', { count: 'exact', head: true }).eq('week_start', w);
    setReadyWeek(!error && (count ?? 0) === 0 ? w : null);
  }, []);
  useEffect(() => { void checkReady(); }, [checkReady]);

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareYears, setCompareYears] = useState<number[]>([]);
  const [compareData, setCompareData] = useState<Record<number, HistRow[]>>({});
  const [compareLoading, setCompareLoading] = useState(false);

  const load = useCallback(async () => {
    // Show cached rows instantly, then check whether anything changed.
    const cached = readCache(year);
    if (cached) { setUploadIds(cached.uploadIds ?? []); setSyncIds(cached.syncIds ?? []); setRows(cached.rows); setLoading(false); }
    else setLoading(true);

    const res = await fetchYear(year);
    if (!res) { if (!cached) toast.error('Failed to load historical data'); setLoading(false); return; }
    setUploadIds(res.uploadIds);
    setSyncIds(res.syncIds);
    setRows(res.rows);
    setLoading(false);
  }, [year]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOpenWeekKey(null); }, [year]);

  // On mount, jump to the most recent year that actually has an upload.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('historical_pl_batches').select('year').order('year', { ascending: false }).limit(1);
      const y = data?.[0]?.year as number | undefined;
      if (!cancelled && y && HIST_YEARS.includes(y)) setYear(y);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load every selected comparison year through the per-year cache.
  useEffect(() => {
    if (!compareOpen || compareYears.length === 0) return;
    let cancelled = false;
    void (async () => {
      setCompareLoading(true);
      const out: Record<number, HistRow[]> = {};
      for (const y of compareYears) {
        const res = await fetchYear(y);
        out[y] = res?.rows ?? [];
      }
      if (!cancelled) { setCompareData((p) => ({ ...p, ...out })); setCompareLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [compareOpen, compareYears]);

  const sortKey = (r: HistRow): string | number => {
    if (!sort) return '';
    if (sort.key === 'contractor_name' || sort.key === 'company') {
      return (r[sort.key] || '').trim().toLowerCase();
    }
    if (sort.key === 'bonus') return num(bonusOf(r));
    if (sort.key === 'markup') return num(markupOf(r));
    return num(r[sort.key as NumKey]);
  };
  const cmpRows = (a: HistRow, b: HistRow) => {
    const va = sortKey(a);
    const vb = sortKey(b);
    let c: number;
    if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
    else c = String(va).localeCompare(String(vb));
    return sort?.dir === 'desc' ? -c : c;
  };

  const weeks = useMemo(() => {
    const map = new Map<string, { label: string; rows: HistRow[] }>();
    for (const r of rows) {
      const key = r.week_start ?? r.week_label ?? 'Unknown week';
      if (!map.has(key)) map.set(key, { label: r.week_label || r.week_start || 'Unknown week', rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.entries()].map(([key, w]) => {
      const externalRows = w.rows.filter((r) => !isInternalRow(r));
      const t = externalRows.reduce((a, r) => ({
        hours: a.hours + rowHours(r),
        cost: a.cost + num(r[COST_KEY]),
        billing: a.billing + num(r[BILLING_KEY]),
        margin: a.margin + num(r[MARGIN_KEY]),
      }), { hours: 0, cost: 0, billing: 0, margin: 0 });
      const has = {
        cost: externalRows.some((r) => r[COST_KEY] != null),
        billing: externalRows.some((r) => r[BILLING_KEY] != null),
        margin: externalRows.some((r) => r[MARGIN_KEY] != null),
      };
      const headcount = weekHeadcount(w.rows);
      return { key, label: w.label, rows: w.rows, totals: t, has, headcount };
    });
  }, [rows]);

  // Year totals, from the rows already loaded.
  const yearSummary = useMemo(() => {
    const externalRows = rows.filter((r) => !isInternalRow(r));
    const t = externalRows.reduce((a, r) => ({
      hours: a.hours + rowHours(r),
      cost: a.cost + num(r[COST_KEY]),
      billing: a.billing + num(r[BILLING_KEY]),
      margin: a.margin + num(r[MARGIN_KEY]),
    }), { hours: 0, cost: 0, billing: 0, margin: 0 });
    const has = {
      cost: externalRows.some((r) => r[COST_KEY] != null),
      billing: externalRows.some((r) => r[BILLING_KEY] != null),
      margin: externalRows.some((r) => r[MARGIN_KEY] != null),
    };
    const avgHeadcount = weeks.length
      ? weeks.reduce((a, w) => a + w.headcount, 0) / weeks.length
      : 0;
    return { ...t, has, avgHeadcount };
  }, [rows, weeks]);

  // Month-by-month billing / cost / margin for each selected comparison year.
  const compare = useMemo(() => {
    const years = [...compareYears].sort((a, b) => a - b);
    const blank = () => ({
      billing: 0, cost: 0, margin: 0,
      has: { billing: false, cost: false, margin: false },
    });
    const byYear: Record<number, { months: ReturnType<typeof blank>[]; total: ReturnType<typeof blank> }> = {};
    for (const y of years) {
      const months = Array.from({ length: 12 }, blank);
      const total = blank();
      for (const r of compareData[y] ?? []) {
        if (isInternalRow(r) || !r.week_start) continue;
        const m = new Date(`${r.week_start}T00:00:00`).getMonth();
        if (Number.isNaN(m)) continue;
        const cell = months[m];
        const b = num(r[BILLING_KEY]), c = num(r[COST_KEY]), g = num(r[MARGIN_KEY]);
        cell.billing += b; cell.cost += c; cell.margin += g;
        total.billing += b; total.cost += c; total.margin += g;
        if (r[BILLING_KEY] != null) { cell.has.billing = true; total.has.billing = true; }
        if (r[COST_KEY] != null) { cell.has.cost = true; total.has.cost = true; }
        if (r[MARGIN_KEY] != null) { cell.has.margin = true; total.has.margin = true; }
      }
      byYear[y] = { months, total };
    }
    const latest = years[years.length - 1];
    const prev = years.length > 1 ? years[years.length - 2] : null;
    return { years, byYear, latest, prev };
  }, [compareYears, compareData]);

  const savedOpenWeek = openWeekKey ? weeks.find((w) => w.key === openWeekKey) ?? null : null;
  const [internalPreview, setInternalPreview] = useState<{ week: string; rows: HistRow[] } | null>(null);
  useEffect(() => {
    if (!savedOpenWeek || savedOpenWeek.rows.some(isInternalRow) || !savedOpenWeek.rows.some((r) => r.raw?.source === 'timesheet_sync')) return;
    let cancelled = false;
    void loadInternalWeekRows(savedOpenWeek.key).then((internal) => {
      if (!cancelled) setInternalPreview({ week: savedOpenWeek.key, rows: internal.map((r, i) => ({ ...r, id: `internal-preview-${savedOpenWeek.key}-${i}`, raw: { ...r.raw, display_only: true } })) });
    }).catch(() => { if (!cancelled) toast.error('Could not load internal team details'); });
    return () => { cancelled = true; };
  }, [savedOpenWeek]);
  const openWeek = savedOpenWeek && internalPreview?.week === savedOpenWeek.key && !savedOpenWeek.rows.some(isInternalRow)
    ? { ...savedOpenWeek, rows: [...savedOpenWeek.rows, ...internalPreview.rows] }
    : savedOpenWeek;

  // Running headcount number per row: only rows that count toward headcount get a
  // number, in sheet order; excluded/duplicate/blank-name rows get none.
  const headcountNumbers = useMemo(() => {
    const map = new Map<string, number>();
    if (!openWeek) return map;
    const seen = new Set<string>();
    let n = 0;
    for (const r of openWeek.rows) {
      const name = (r.contractor_name || '').trim().toLowerCase();
      const excluded =
        !name ||
        isInternalRow(r) ||
        HEADCOUNT_EXCLUDED_NAMES.has(name) ||
        !!(r.raw && (r.raw as Record<string, unknown>).__exclude_headcount);
      if (excluded || seen.has(name)) continue;
      seen.add(name);
      map.set(r.id, ++n);
    }
    return map;
  }, [openWeek]);

  // Statuses available in the open week (plus Rendering, always offered), and
  // which of them are excluded from headcount.
  const statusOptions = useMemo(() => {
    const set = new Set<string>(['Rendering']);
    if (openWeek) for (const r of openWeek.rows) { const s = statusOf(r); if (s) set.add(s); }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [openWeek]);
  const excludedStatuses = useMemo(() => {
    const set = new Set<string>();
    if (!openWeek) return set;
    for (const r of openWeek.rows) {
      const s = statusOf(r);
      if (s && isRowExcluded(r)) set.add(s.toLowerCase());
    }
    return set;
  }, [openWeek]);

  // Update a row's status in place; Rendering always keeps the row out of the
  // headcount, as does a status that is excluded elsewhere in the week; a
  // blank status clears the flag.
  const handleStatusChange = async (row: HistRow, newStatus: string) => {
    const raw = { ...((row.raw as Record<string, unknown>) ?? {}) };
    if (newStatus) raw.Status = newStatus; else delete raw.Status;
    const excludes = !!newStatus && (newStatus.toLowerCase() === 'rendering' || excludedStatuses.has(newStatus.toLowerCase()));
    if (excludes) raw.__exclude_headcount = true;
    else delete raw.__exclude_headcount;
    const prevRows = rows;
    const nextRows = rows.map((r) => (r.id === row.id ? { ...r, raw } : r));
    setRows(nextRows);
    const cached = readCache(year);
    if (cached) writeCache(year, { ...cached, rows: nextRows });
    const { error } = await supabase.from('historical_pl_rows').update({ raw: raw as never }).eq('id', row.id);
    if (error) {
      setRows(prevRows);
      if (cached) writeCache(year, { ...cached, rows: prevRows });
      toast.error('Failed to update status');
    }
  };

  // Reset the search whenever a different week is opened.
  useEffect(() => { setQuery(''); }, [openWeekKey]);

  const detailRows = useMemo(() => {
    if (!openWeek) return [];
    const q = query.trim().toLowerCase();
    const base = q
      ? openWeek.rows.filter((r) =>
          (r.contractor_name || '').toLowerCase().includes(q) || (r.company || '').toLowerCase().includes(q))
      : openWeek.rows;
    return [...base].sort((a, b) =>
      Number(isInternalRow(a)) - Number(isInternalRow(b)) || (sort ? cmpRows(a, b) : 0));
  }, [openWeek, query, sort]);

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('historical_pl_batches').delete().in('id', uploadIds).eq('source', 'upload');
    setDeleting(false);
    setConfirmOpen(false);
    if (error) { toast.error(`Failed to delete ${year} data`); return; }
    toast.success(`${year} historical data deleted`);
    void load();
  };

  const handleDeleteSynced = async () => {
    setDeleting(true);
    const { error } = await supabase.from('historical_pl_batches').delete().in('id', syncIds).eq('source', 'timesheet_sync');
    setDeleting(false);
    setConfirmSyncOpen(false);
    if (error) { toast.error(`Failed to clear ${year} synced data`); return; }
    toast.success(`${year} synced data cleared`);
    void load();
    void checkReady();
  };

  const handleUpload = () => {
    if (onUpload) onUpload(year);
    else setUploadOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {readyWeek && (
        <div className="flex items-center justify-between gap-3 border rounded-lg px-4 py-2 bg-muted/50 text-sm">
          <span>{weekLabelOf(readyWeek)} is ready to sync</span>
          <Button size="sm" className="gap-1" onClick={() => { setSyncWeek(readyWeek); setSyncOpen(true); }}>
            <RefreshCw className="h-4 w-4" /> Sync now
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {HIST_YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium border transition-colors',
                y === year
                  ? 'bg-[var(--brand)] border-[var(--brand)] text-primary-foreground'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleUpload}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => { setSyncWeek(undefined); setSyncOpen(true); }}>
            <RefreshCw className="h-4 w-4" /> Sync from timesheets
          </Button>
          {uploadIds.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setRemapOpen(true)}>
                <Columns3 className="h-4 w-4" /> Edit mapping
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete {year}
              </Button>
            </>
          )}
          {syncIds.length > 0 && (
            <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmSyncOpen(true)}>
              <Trash2 className="h-4 w-4" /> Clear synced {year}
            </Button>
          )}
          <Button
            variant={compareOpen ? 'default' : 'outline'}
            size="sm"
            className="gap-1"
            onClick={() => {
              setCompareOpen((o) => {
                if (!o && compareYears.length === 0) setCompareYears([year]);
                return !o;
              });
            }}
          >
            <BarChart3 className="h-4 w-4" /> Compare
          </Button>
        </div>
      </div>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total income', caption: 'Income after 3%', value: fmtMaybe({ total: yearSummary.billing, has: yearSummary.has.billing }) },
            { label: 'Total expense', caption: 'Expense after 1%', value: fmtMaybe({ total: yearSummary.cost, has: yearSummary.has.cost }) },
            { label: 'Total gross', caption: 'Gross after deductions', value: fmtMaybe({ total: yearSummary.margin, has: yearSummary.has.margin }) },
            { label: 'Total hours', value: yearSummary.hours.toFixed(2) },
            { label: 'Avg weekly headcount', value: yearSummary.avgHeadcount.toFixed(1) },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg p-3 bg-card">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {'caption' in s && s.caption && <p className="text-[10px] text-muted-foreground/80">{s.caption}</p>}
              <p className="text-lg font-semibold tabular-nums whitespace-nowrap mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {compareOpen && (
        <div className="border rounded-lg bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground mr-1">Years:</span>
            {HIST_YEARS.map((y) => {
              const on = compareYears.includes(y);
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setCompareYears((prev) => (on ? prev.filter((p) => p !== y) : [...prev, y]))}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    on
                      ? 'bg-[var(--brand)] border-[var(--brand)] text-primary-foreground'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {y}
                </button>
              );
            })}
            {compareLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {compare.years.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Select one or more years to compare.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-max min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Month</th>
                    {compare.years.map((y) => (
                      <th key={y} colSpan={3} className="text-center px-3 py-2 font-medium border-l">{y}</th>
                    ))}
                    {compare.prev != null && (
                      <th colSpan={2} className="text-center px-3 py-2 font-medium border-l whitespace-nowrap">
                        Gross change {compare.latest} vs {compare.prev}
                      </th>
                    )}
                  </tr>
                  <tr className="border-b">
                    <th />
                    {compare.years.map((y) => (
                      <Fragment key={y}>
                        <th className="text-right px-3 py-1.5 text-xs font-normal text-muted-foreground border-l">Income</th>
                        <th className="text-right px-3 py-1.5 text-xs font-normal text-muted-foreground">Expense</th>
                        <th className="text-right px-3 py-1.5 text-xs font-normal text-muted-foreground">Gross</th>
                      </Fragment>
                    ))}
                    {compare.prev != null && (
                      <>
                        <th className="text-right px-3 py-1.5 text-xs font-normal text-muted-foreground border-l">Amount</th>
                        <th className="text-right px-3 py-1.5 text-xs font-normal text-muted-foreground">%</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((mn, mi) => {
                    const curCell = compare.byYear[compare.latest].months[mi];
                    const prvCell = compare.prev != null ? compare.byYear[compare.prev].months[mi] : null;
                    const showChange = curCell.has.margin && !!prvCell?.has.margin;
                    const diff = showChange ? curCell.margin - prvCell!.margin : 0;
                    const p = showChange ? pct(curCell.margin, prvCell!.margin) : null;
                    return (
                      <tr key={mn} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{mn}</td>
                        {compare.years.map((y) => {
                          const c = compare.byYear[y].months[mi];
                          return (
                            <Fragment key={y}>
                              <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap border-l">{c.has.billing ? money(c.billing) : '—'}</td>
                              <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap">{c.has.cost ? money(c.cost) : '—'}</td>
                              <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap">{c.has.margin ? money(c.margin) : '—'}</td>
                            </Fragment>
                          );
                        })}
                        {compare.prev != null && (
                          <>
                            <td className={cn('text-right px-3 py-2 tabular-nums whitespace-nowrap border-l', !showChange ? '' : diff < 0 ? 'text-destructive' : diff > 0 ? 'text-emerald-600' : '')}>{showChange ? money(diff) : '—'}</td>
                            <td className={cn('text-right px-3 py-2 tabular-nums whitespace-nowrap', !showChange ? '' : diff < 0 ? 'text-destructive' : diff > 0 ? 'text-emerald-600' : '')}>{p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 font-bold">
                    <td className="px-3 py-2">Total</td>
                    {compare.years.map((y) => {
                      const t = compare.byYear[y].total;
                      return (
                        <Fragment key={y}>
                          <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap border-l">{t.has.billing ? money(t.billing) : '—'}</td>
                          <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap">{t.has.cost ? money(t.cost) : '—'}</td>
                          <td className="text-right px-3 py-2 tabular-nums whitespace-nowrap">{t.has.margin ? money(t.margin) : '—'}</td>
                        </Fragment>
                      );
                    })}
                    {compare.prev != null && (() => {
                      const curT = compare.byYear[compare.latest].total;
                      const prvT = compare.byYear[compare.prev].total;
                      const showChange = curT.has.margin && prvT.has.margin;
                      const diff = showChange ? curT.margin - prvT.margin : 0;
                      const p = showChange ? pct(curT.margin, prvT.margin) : null;
                      return (
                        <>
                          <td className={cn('text-right px-3 py-2 tabular-nums whitespace-nowrap border-l', !showChange ? '' : diff < 0 ? 'text-destructive' : diff > 0 ? 'text-emerald-600' : '')}>{showChange ? money(diff) : '—'}</td>
                          <td className={cn('text-right px-3 py-2 tabular-nums whitespace-nowrap', !showChange ? '' : diff < 0 ? 'text-destructive' : diff > 0 ? 'text-emerald-600' : '')}>{p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`}</td>
                        </>
                      );
                    })()}
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">Weeks are counted in the month they start</p>
            </div>
          )}
        </div>
      )}


      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 border rounded-lg bg-card">
          <p className="text-muted-foreground">No data uploaded for {year}</p>
          <Button onClick={handleUpload} className="gap-2"><Upload className="h-4 w-4" /> Upload</Button>
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right tabular-nums">Hours</TableHead>
                <TableHead className="text-right tabular-nums">Expense</TableHead>
                <TableHead className="text-right tabular-nums">Income</TableHead>
                <TableHead className="text-right tabular-nums">Gross</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w) => (
                <TableRow
                  key={w.key}
                  className="cursor-pointer select-none hover:bg-[#F0FFFE]"
                  onClick={() => setOpenWeekKey(w.key)}
                >
                  <TableCell>
                    <div className="font-medium">{w.label}</div>
                    <div className="text-xs text-muted-foreground">{w.headcount} contractors</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{w.totals.hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMaybe({ total: w.totals.cost, has: w.has.cost })}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMaybe({ total: w.totals.billing, has: w.has.billing })}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMaybe({ total: w.totals.margin, has: w.has.margin })}</TableCell>
                  <TableCell className="w-10 text-right pr-4">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!openWeek} onOpenChange={(o) => { if (!o) setOpenWeekKey(null); }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] flex flex-col gap-4 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-baseline gap-2 flex-wrap">
              <span>{openWeek?.label}</span>
              {openWeek && <span className="text-sm font-normal text-muted-foreground">· {openWeek.headcount} contractors</span>}
            </DialogTitle>
          </DialogHeader>

          {openWeek && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                {[
                  { label: 'Hours', value: openWeek.totals.hours.toFixed(2) },
                  { label: 'Expense', caption: 'Expense after 1%', value: fmtMaybe({ total: openWeek.totals.cost, has: openWeek.has.cost }) },
                  { label: 'Income', caption: 'Income after 3%', value: fmtMaybe({ total: openWeek.totals.billing, has: openWeek.has.billing }) },
                  { label: 'Gross', caption: 'Gross after deductions', value: fmtMaybe({ total: openWeek.totals.margin, has: openWeek.has.margin }) },
                ].map((s) => (
                  <div key={s.label} className="border rounded-lg p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    {'caption' in s && s.caption && <p className="text-[10px] text-muted-foreground/80">{s.caption}</p>}
                    <p className="text-lg font-semibold tabular-nums whitespace-nowrap mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contractor or company"
                  className="pl-8 h-9"
                />
              </div>

              <div className="border rounded-lg overflow-auto max-h-[60vh] min-h-0">
                <table className="w-max min-w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={cn('sticky top-0 left-0 z-40 bg-background border-b border-r h-10 px-2 font-medium text-muted-foreground whitespace-nowrap text-right', NUM_COL)}>#</th>
                    {SORTABLE.map((c, i) => {
                        const active = sort?.key === c.key;
                        return (
                          <Fragment key={c.key}>
                          <th
                            className={cn(
                              'sticky top-0 bg-background border-b h-10 px-3 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:bg-muted',
                              i === 0 ? 'left-[56px] z-30 border-r' : 'z-20',
                              c.width,
                              c.numeric ? 'text-right' : 'text-left',
                              active && 'text-foreground',
                            )}
                            onClick={() =>
                              setSort((s) =>
                                !s || s.key !== c.key ? { key: c.key, dir: c.numeric ? 'desc' : 'asc' }
                                  : s.dir === (c.numeric ? 'desc' : 'asc') ? { key: c.key, dir: c.numeric ? 'asc' : 'desc' }
                                  : null,
                              )
                            }
                          >
                            <span className="inline-flex items-center gap-1">
                              {c.label}
                              <ArrowUpDown className={cn('h-3 w-3', active ? 'text-foreground' : 'text-muted-foreground/50')} />
                              {active && <span className="text-xs">{sort?.dir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                          {c.key === 'company' && (
                            <th key="status" className={cn('sticky top-0 z-20 bg-background border-b h-10 px-3 font-medium text-muted-foreground whitespace-nowrap text-left', STATUS_COL)}>Status</th>
                          )}
                        </Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.length === 0 ? (
                      <tr>
                        <td colSpan={SORTABLE.length + 2} className="text-center text-muted-foreground py-8">
                          No contractors match "{query}"
                        </td>
                      </tr>
                    ) : detailRows.map((r) => (
                      <Fragment key={r.id}>
                      {isInternalRow(r) && r.id === detailRows.find((row) => isInternalRow(row))?.id && (
                        <tr><td colSpan={SORTABLE.length + 2} className="border-b bg-muted px-3 py-2 font-medium">OutSta · Internal team</td></tr>
                      )}
                      <tr className="group">
                        <td className={cn('sticky left-0 z-20 bg-background group-hover:bg-muted border-r border-b px-2 py-2 text-right tabular-nums text-muted-foreground', NUM_COL)}>{headcountNumbers.get(r.id) ?? ''}</td>
                        {SORTABLE.map((c, i) => (
                          <Fragment key={c.key}>
                          {!c.numeric ? (
                            <td className={cn('px-3 py-2 border-b bg-background group-hover:bg-muted', c.width, i === 0 && 'sticky left-[56px] z-10 border-r font-medium')}>
                              <div className="truncate" title={r[c.key as 'contractor_name' | 'company'] || undefined}>
                                {r[c.key as 'contractor_name' | 'company'] || '—'}
                              </div>
                            </td>
                          ) : (
                            <td className={cn('px-3 py-2 border-b bg-background group-hover:bg-muted text-right tabular-nums whitespace-nowrap', c.width)}>
                              {isInternalRow(r) && c.kind === 'hours' ? '—' : fmtCell(c, c.key === 'bonus' ? bonusOf(r) : c.key === 'markup' ? markupOf(r) : r[c.key as NumKey])}
                            </td>
                          )}
                          {c.key === 'company' && (
                            <td className={cn('px-2 py-1 border-b bg-background group-hover:bg-muted', STATUS_COL)}>
                              <Select
                                disabled={!!r.raw?.display_only}
                                value={statusOf(r) || '__blank__'}
                                onValueChange={(v) => void handleStatusChange(r, v === '__blank__' ? '' : v)}
                              >
                                <SelectTrigger className={cn('h-7 border-0 shadow-none bg-transparent px-1.5 text-xs focus:ring-0', !statusOf(r) && 'text-muted-foreground')}>
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__blank__">—</SelectItem>
                                  {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                          )}
                          </Fragment>
                        ))}
                      </tr>
                      </Fragment>
                    ))}
                  </tbody>
                  {detailRows.length > 0 && (
                    <tfoot>
                      <tr>
                        <td className={cn('sticky bottom-0 left-0 z-40 bg-background border-t-2 border-r px-2 py-2 font-bold whitespace-nowrap text-right tabular-nums', NUM_COL)}>{detailRows.filter((r) => headcountNumbers.has(r.id)).length || ''}</td>
                      {SORTABLE.map((c, i) => {
                          const base = 'sticky bottom-0 bg-background border-t-2 px-3 py-2 font-bold whitespace-nowrap';
                          const statusCell = c.key === 'company' ? <td key="status" className={cn(base, 'z-20', STATUS_COL)} /> : null;
                          if (i === 0) return <Fragment key={c.key}><td className={cn(base, 'left-[56px] z-30 border-r', c.width)}>Total</td>{statusCell}</Fragment>;
                          if (!c.numeric || c.kind === 'rate') return <Fragment key={c.key}><td className={cn(base, 'z-20', c.width)} />{statusCell}</Fragment>;
                          const vals = detailRows.filter((r) => !isInternalRow(r)).map((r) => (c.key === 'bonus' ? bonusOf(r) : r[c.key as NumKey])).filter((v) => v != null);
                          const sum = vals.reduce<number>((a, v) => a + Number(v), 0);
                          return (
                            <Fragment key={c.key}>
                            <td className={cn(base, 'z-20 text-right tabular-nums', c.width)}>
                              {vals.length ? fmtCell(c, sum) : '—'}
                            </td>
                            {statusCell}
                            </Fragment>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <HistoricalSyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        initialWeek={syncWeek}
        onSynced={(y) => { void checkReady(); if (y === year) void load(); else setYear(y); }}
      />

      <HistoricalUploadDialog
        key={uploadOpen ? `open-${year}` : 'closed'}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultYear={year}
        onImported={(y) => { if (y === year) void load(); else setYear(y); }}
      />

      <HistoricalRemapDialog
        open={remapOpen}
        onOpenChange={setRemapOpen}
        year={year}
        onApplied={() => void load()}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {year} historical data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every uploaded row for {year}. Live P&amp;L data is not affected. Weeks synced from timesheets are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting…' : `Delete ${year}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {year} synced data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every week synced from timesheets for {year}. Uploaded rows are kept. Live P&amp;L data and timesheets are not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleDeleteSynced(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Clearing…' : `Clear synced ${year}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
