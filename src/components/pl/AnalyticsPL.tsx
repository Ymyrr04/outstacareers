import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type HistRow, fetchYear, weekHeadcount, isContractorRow, rowHours, markupOf, num,
} from '@/lib/historicalData';

const COLOR_A = '#0ABEDF';
const COLOR_B = 'hsl(var(--muted-foreground))';

type Mode = 'all' | 'specific';
type Basis = 'gross' | 'after';
export type MetricKey = 'active' | 'on40' | 'on50' | 'income' | 'expense' | 'markup';

interface WeekFig {
  weekStart: string; label: string; woy: number;
  active: number; on40: number; on50: number; hours: number;
  incomeGross: number; expenseGross: number; incomeAfter: number; expenseAfter: number;
  markupSum: number; markupHours: number;
}

// Week of year from a plain YYYY-MM-DD string, no timezone conversion.
export function weekOfYear(ws: string): number {
  const [y, m, d] = ws.slice(0, 10).split('-').map(Number);
  const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  return Math.floor((doy - 1) / 7) + 1;
}

function buildWeeks(rows: HistRow[]): WeekFig[] {
  const by = new Map<string, HistRow[]>();
  for (const r of rows) {
    if (!r.week_start) continue;
    const k = r.week_start.slice(0, 10);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ws, all]) => {
    const cr = all.filter(isContractorRow);
    const n40 = new Set<string>(), n50 = new Set<string>();
    let hours = 0, ig = 0, eg = 0, ia = 0, ea = 0, ms = 0, mh = 0;
    for (const r of cr) {
      const h = rowHours(r);
      const name = (r.contractor_name ?? '').trim().toLowerCase();
      if (h === 40) n40.add(name);
      if (h === 50) n50.add(name);
      hours += h;
      ig += num(r.client_billing); eg += num(r.contractor_cost);
      ia += num(r.income_after_3_percent); ea += num(r.expense_after_1_percent);
      const mk = markupOf(r);
      if (mk != null && r.client_rate != null && r.contractor_rate != null && h > 0) { ms += mk * h; mh += h; }
    }
    return {
      weekStart: ws, label: all.find((r) => r.week_label)?.week_label ?? ws, woy: weekOfYear(ws),
      active: weekHeadcount(all), on40: n40.size, on50: n50.size, hours,
      incomeGross: ig, expenseGross: eg, incomeAfter: ia, expenseAfter: ea, markupSum: ms, markupHours: mh,
    };
  });
}

interface Agg { active: number; on40: number; on50: number; income: number; expense: number; markup: number | null }

function aggregate(weeks: WeekFig[], basis: Basis): Agg | null {
  if (weeks.length === 0) return null;
  const n = weeks.length;
  const s = (f: (w: WeekFig) => number) => weeks.reduce((a, w) => a + f(w), 0);
  const mh = s((w) => w.markupHours);
  return {
    active: s((w) => w.active) / n,
    on40: s((w) => w.on40) / n,
    on50: s((w) => w.on50) / n,
    income: s((w) => (basis === 'gross' ? w.incomeGross : w.incomeAfter)),
    expense: s((w) => (basis === 'gross' ? w.expenseGross : w.expenseAfter)),
    markup: mh > 0 ? s((w) => w.markupSum) / mh : null,
  };
}

const fmtMoney = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCount = (v: number, specific: boolean) => (specific ? v.toFixed(0) : v.toFixed(1));

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={cn('px-3 py-1 text-xs rounded transition-colors',
            value === o.v ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsPL() {
  const [years, setYears] = useState<number[]>([]);
  const [yearA, setYearA] = useState<number | null>(null);
  const [yearB, setYearB] = useState<number | null>(null);
  const [rowsByYear, setRowsByYear] = useState<Record<number, HistRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('all');
  const [basis, setBasis] = useState<Basis>('gross');
  const [weekA, setWeekA] = useState<string | null>(null);
  const [weekB, setWeekB] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('active');

  // Years with data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('historical_pl_batches').select('year');
      const ys = [...new Set((data ?? []).map((b: { year: number }) => b.year))].sort((a, b) => b - a);
      if (cancelled) return;
      setYears(ys);
      setYearA(ys[0] ?? null);
      setYearB(ys[1] ?? ys[0] ?? null);
      if (ys.length === 0) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const need = [yearA, yearB].filter((y): y is number => y != null && !rowsByYear[y]);
    if (need.length === 0) { if (yearA != null) setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await Promise.all([...new Set(need)].map(async (y) => [y, (await fetchYear(y))?.rows ?? []] as const));
      if (cancelled) return;
      setRowsByYear((p) => { const n = { ...p }; for (const [y, r] of res) n[y] = r; return n; });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [yearA, yearB, rowsByYear]);

  const weeksA = useMemo(() => (yearA != null ? buildWeeks(rowsByYear[yearA] ?? []) : []), [yearA, rowsByYear]);
  const weeksB = useMemo(() => (yearB != null ? buildWeeks(rowsByYear[yearB] ?? []) : []), [yearB, rowsByYear]);

  // Default specific weeks: week 3 (Year A) and week 5 (Year B)
  useEffect(() => {
    if (!weeksA.some((w) => w.weekStart === weekA)) setWeekA((weeksA.find((w) => w.woy === 3) ?? weeksA[0])?.weekStart ?? null);
  }, [weeksA]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!weeksB.some((w) => w.weekStart === weekB)) setWeekB((weeksB.find((w) => w.woy === 5) ?? weeksB[0])?.weekStart ?? null);
  }, [weeksB]); // eslint-disable-line react-hooks/exhaustive-deps

  const { aggA, aggB, labelA, labelB, sharedCount } = useMemo(() => {
    if (mode === 'specific') {
      const wa = weeksA.find((w) => w.weekStart === weekA);
      const wb = weeksB.find((w) => w.weekStart === weekB);
      return {
        aggA: wa ? aggregate([wa], basis) : null, aggB: wb ? aggregate([wb], basis) : null,
        labelA: wa?.label ?? '—', labelB: wb?.label ?? '—', sharedCount: 0,
      };
    }
    const wB = new Set(weeksB.map((w) => w.woy));
    const shared = new Set(weeksA.filter((w) => wB.has(w.woy)).map((w) => w.woy));
    return {
      aggA: aggregate(weeksA.filter((w) => shared.has(w.woy)), basis),
      aggB: aggregate(weeksB.filter((w) => shared.has(w.woy)), basis),
      labelA: String(yearA ?? ''), labelB: String(yearB ?? ''), sharedCount: shared.size,
    };
  }, [mode, basis, weeksA, weeksB, weekA, weekB, yearA, yearB]);

  const specific = mode === 'specific';
  const cards: { key: MetricKey; title: string; caption: string; fmt: (v: number) => string; money?: boolean }[] = [
    { key: 'active', title: 'Active contractors', caption: specific ? 'that week' : 'avg per week', fmt: (v) => fmtCount(v, specific) },
    { key: 'on40', title: 'On 40 hours', caption: specific ? 'that week' : 'avg per week', fmt: (v) => fmtCount(v, specific) },
    { key: 'on50', title: 'On 50 hours', caption: specific ? 'that week' : 'avg per week', fmt: (v) => fmtCount(v, specific) },
    { key: 'income', title: 'Income', caption: specific ? 'that week' : 'total', fmt: fmtMoney },
    { key: 'expense', title: 'Expense', caption: specific ? 'that week' : 'total', fmt: fmtMoney },
    { key: 'markup', title: 'Markup rate', caption: specific ? 'that week' : '$ per hour', fmt: fmtMoney, money: true },
  ];

  const footer = (key: MetricKey) => {
    const a = aggA?.[key], b = aggB?.[key];
    if (a == null || b == null) return null;
    const diff = a - b;
    const pct = b !== 0 ? (diff / Math.abs(b)) * 100 : null;
    if (diff === 0) return <span className="text-muted-foreground">No change</span>;
    const up = diff > 0;
    const who = up ? labelA : labelB;
    return (
      <span className={up ? 'text-emerald-600' : 'text-destructive'}>
        {up ? '▲' : '▼'} {pct != null ? `${Math.abs(pct).toFixed(1)}%` : ''}
        {key === 'markup' ? ` (${up ? '+' : '−'}${fmtMoney(Math.abs(diff))})` : ''} higher in {who}
      </span>
    );
  };

  if (!loading && years.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">No historical data yet.</Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_A }} />
          <Select value={yearA != null ? String(yearA) : undefined} onValueChange={(v) => setYearA(Number(v))}>
            <SelectTrigger className="h-8 w-24"><SelectValue placeholder="Year A" /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">vs</span>
          <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_B }} />
          <Select value={yearB != null ? String(yearB) : undefined} onValueChange={(v) => setYearB(Number(v))}>
            <SelectTrigger className="h-8 w-24"><SelectValue placeholder="Year B" /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ v: 'all', label: 'All weeks' }, { v: 'specific', label: 'Specific weeks' }]} />
        <Segmented value={basis} onChange={setBasis} options={[{ v: 'gross', label: 'Gross' }, { v: 'after', label: 'After fees' }]} />
        {specific ? (
          <div className="flex items-center gap-2">
            <Select value={weekA ?? undefined} onValueChange={setWeekA}>
              <SelectTrigger className="h-8 w-48"><SelectValue placeholder={`${yearA} week`} /></SelectTrigger>
              <SelectContent>{weeksA.map((w) => <SelectItem key={w.weekStart} value={w.weekStart}>{w.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={weekB ?? undefined} onValueChange={setWeekB}>
              <SelectTrigger className="h-8 w-48"><SelectValue placeholder={`${yearB} week`} /></SelectTrigger>
              <SelectContent>{weeksB.map((w) => <SelectItem key={w.weekStart} value={w.weekStart}>{w.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{sharedCount} shared weeks</span>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </Card>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {cards.map((c) => {
          const a = aggA?.[c.key], b = aggB?.[c.key];
          return (
            <Card key={c.key} role="button" tabIndex={0} onClick={() => setMetric(c.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMetric(c.key); } }}
              className={cn('p-4 cursor-pointer transition-shadow hover:shadow-md', metric === c.key && 'ring-2')}
              style={metric === c.key ? ({ '--tw-ring-color': COLOR_A } as React.CSSProperties) : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{c.title}</span>
                <span className="text-[11px] text-muted-foreground">{c.caption}</span>
              </div>
              <div className="mt-2 space-y-1">
                {[{ v: a, color: COLOR_A, label: labelA }, { v: b, color: COLOR_B, label: labelB }].map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                    <span className="text-lg font-semibold tabular-nums">{l.v == null ? '—' : c.fmt(l.v)}</span>
                    <span className="text-xs text-muted-foreground truncate">{l.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs">{footer(c.key)}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
