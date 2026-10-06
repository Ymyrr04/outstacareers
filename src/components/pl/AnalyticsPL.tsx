import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend, LabelList, CartesianGrid,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { todayET } from '@/lib/calendarTime';
import { PieChart, Pie } from 'recharts';
import { summaryDatasets } from '@/lib/plSummaryFacts';
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
  markupSum: number; markupHours: number; clientRateSum: number; contractorRateSum: number;
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
    let hours = 0, ig = 0, eg = 0, ia = 0, ea = 0, ms = 0, mh = 0, crs = 0, kts = 0;
    for (const r of cr) {
      const h = rowHours(r);
      const name = (r.contractor_name ?? '').trim().toLowerCase();
      if (h === 40) n40.add(name);
      if (h === 50) n50.add(name);
      hours += h;
      ig += num(r.client_billing); eg += num(r.contractor_cost);
      ia += num(r.income_after_3_percent); ea += num(r.expense_after_1_percent);
      const mk = markupOf(r);
      if (mk != null && r.client_rate != null && r.contractor_rate != null && h > 0) { ms += mk * h; mh += h; crs += num(r.client_rate) * h; kts += num(r.contractor_rate) * h; }
    }
    return {
      weekStart: ws, label: all.find((r) => r.week_label)?.week_label ?? ws, woy: weekOfYear(ws),
      active: weekHeadcount(all), on40: n40.size, on50: n50.size, hours,
      incomeGross: ig, expenseGross: eg, incomeAfter: ia, expenseAfter: ea, markupSum: ms, markupHours: mh, clientRateSum: crs, contractorRateSum: kts,
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

const METRIC_TITLES: Record<MetricKey, string> = {
  active: 'Active contractors', on40: 'On 40 hours', on50: 'On 50 hours',
  income: 'Income', expense: 'Expense', markup: 'Markup rate',
};

// Per-week value for a metric, respecting the gross/after-fees switch.
function weekValue(w: WeekFig, key: MetricKey, basis: Basis): number | null {
  switch (key) {
    case 'active': return w.active;
    case 'on40': return w.on40;
    case 'on50': return w.on50;
    case 'income': return basis === 'gross' ? w.incomeGross : w.incomeAfter;
    case 'expense': return basis === 'gross' ? w.expenseGross : w.expenseAfter;
    case 'markup': return w.markupHours > 0 ? w.markupSum / w.markupHours : null;
  }
}

const chartFmt = (key: MetricKey, v: number) =>
  key === 'income' || key === 'expense' || key === 'markup' ? fmtMoney(v) : v.toFixed(0);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (ws: string) => MONTHS[Number(ws.slice(5, 7)) - 1];

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

  const selA = useMemo(() => {
    if (mode === 'specific') return weeksA.filter((w) => w.weekStart === weekA);
    const wB = new Set(weeksB.map((w) => w.woy));
    return weeksA.filter((w) => wB.has(w.woy));
  }, [mode, weeksA, weeksB, weekA]);
  const selB = useMemo(() => {
    if (mode === 'specific') return weeksB.filter((w) => w.weekStart === weekB);
    const wA = new Set(weeksA.map((w) => w.woy));
    return weeksB.filter((w) => wA.has(w.woy));
  }, [mode, weeksA, weeksB, weekB]);
  const weekRowsA = useMemo(() => {
    if (yearA == null || !rowsByYear[yearA]) return null;
    const s = new Set(selA.map((w) => w.weekStart));
    return rowsByYear[yearA].filter((r) => r.week_start && s.has(r.week_start.slice(0, 10)));
  }, [yearA, rowsByYear, selA]);
  const weekRowsB = useMemo(() => {
    if (yearB == null || !rowsByYear[yearB]) return null;
    const s = new Set(selB.map((w) => w.weekStart));
    return rowsByYear[yearB].filter((r) => r.week_start && s.has(r.week_start.slice(0, 10)));
  }, [yearB, rowsByYear, selB]);

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
      <span style={{ color: COLOR_A }}>
        {up ? '▲' : '▼'} {pct != null ? `${Math.abs(pct).toFixed(1)}%` : ''}
        {key === 'markup' ? ` (${up ? '+' : '−'}${fmtMoney(Math.abs(diff))})` : ''} higher in {who}
      </span>
    );
  };

  if (!loading && years.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">No historical data yet.</Card>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_236px] items-start">
    <div className="flex flex-col gap-4 min-w-0">
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
        <Segmented value={mode} onChange={(v) => setMode(v as Mode)} options={[{ v: 'all', label: 'All weeks' }, { v: 'specific', label: 'Specific weeks' }]} />
        <Segmented value={basis} onChange={(v) => setBasis(v as Basis)} options={[{ v: 'gross', label: 'Gross' }, { v: 'after', label: 'After fees' }]} />
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
                {[{ v: a, color: COLOR_A, label: labelA }, { v: b, color: COLOR_A, label: labelB }].map((l, i) => (
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

      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">
          {METRIC_TITLES[metric]} {specific ? '— selected weeks' : 'per week'} · {labelA} vs {labelB}
        </div>
        <div className="h-72">
          {specific ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: labelA, value: aggA?.[metric] ?? 0 },
                { name: labelB, value: aggB?.[metric] ?? 0 },
              ]} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 12 }} width={70}
                  tickFormatter={(v: number) => (metric === 'income' || metric === 'expense' || metric === 'markup' ? `$${v.toLocaleString()}` : String(v))} />
                <Tooltip formatter={(v: number) => chartFmt(metric, v)} />
                <Legend content={() => (
                  <div className="flex justify-center gap-6 text-xs text-muted-foreground pt-2">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_A }} />{yearA}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_B }} />{yearB}</span>
                  </div>
                )} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill={COLOR_A} />
                  <Cell fill={COLOR_B} />
                  <LabelList dataKey="value" position="top" formatter={(v: number) => chartFmt(metric, v)} fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(() => {
                const byA = new Map(weeksA.map((w) => [w.woy, w]));
                const byB = new Map(weeksB.map((w) => [w.woy, w]));
                const woys = [...new Set([...byA.keys()].filter((k) => byB.has(k)))].sort((a, b) => a - b);
                return woys.map((k) => {
                  const wa = byA.get(k)!, wb = byB.get(k)!;
                  return {
                    woy: k, month: monthOf(wa.weekStart),
                    a: weekValue(wa, metric, basis), b: weekValue(wb, metric, basis),
                    labelA: wa.label, labelB: wb.label,
                  };
                });
              })()} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }}
                  ticks={(() => {
                    const seen = new Set<string>(); const out: string[] = [];
                    for (const w of weeksA) { const m = monthOf(w.weekStart); if (!seen.has(m)) { seen.add(m); out.push(m); } }
                    return out;
                  })()} />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 12 }} width={70}
                  tickFormatter={(v: number) => (metric === 'income' || metric === 'expense' || metric === 'markup' ? `$${v.toLocaleString()}` : String(v))} />
                <Tooltip
                  formatter={(v: number, name: string) => chartFmt(metric, v)}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { labelA?: string; labelB?: string } | undefined;
                    return p ? `${p.labelA} · ${p.labelB}` : '';
                  }} />
                <Legend />
                <Line type="monotone" dataKey="a" name={String(yearA ?? '')} stroke={COLOR_A} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="b" name={String(yearB ?? '')} stroke={COLOR_B} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <DriversPanel selA={selA} selB={selB} basis={basis} labelA={labelA} labelB={labelB} rowsA={weekRowsA ?? []} rowsB={weekRowsB ?? []} />
    </div>
    <div className="flex flex-col gap-4">
      <MixPanel years={years} weekRows={weekRowsA} swatch={COLOR_A}
        title={`Markup rate mix · ${yearA ?? ''}`} subtitle={mixSub(selA)} />
      <MixPanel years={years} weekRows={weekRowsB} swatch={COLOR_B}
        title={`Markup rate mix · ${yearB ?? ''}`} subtitle={mixSub(selB)} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
      <MixPanel years={years} />
      <MixPanel years={years} fixedYear={Number(todayET().slice(0, 4))} />
    </div>
    </div>
  );
}

function mixSub(sel: WeekFig[]) {
  if (sel.length === 0) return 'No matching week';
  if (sel.length === 1) return sel[0].label;
  return `${sel.length} weeks · ${sel[0].label} to ${sel[sel.length - 1].label}`;
}

const COLOR_POS = '#0ABEDF';
const COLOR_NEG = '#EF9F27';
const fmtSigned = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtRate = (v: number) => `$${v.toFixed(2)}`;
const fmtRateSigned = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

function totals(weeks: WeekFig[], basis: Basis, kind: 'income' | 'expense') {
  let c = 0, hours = 0, amount = 0;
  for (const w of weeks) {
    c += w.active; hours += w.hours;
    amount += kind === 'income' ? (basis === 'gross' ? w.incomeGross : w.incomeAfter) : (basis === 'gross' ? w.expenseGross : w.expenseAfter);
  }
  return { c, hours, amount, h: c > 0 ? hours / c : 0, r: hours > 0 ? amount / hours : 0 };
}

function DriverBlock({ title, selA, selB, basis, kind, labelA, labelB }: {
  title: string; selA: WeekFig[]; selB: WeekFig[]; basis: Basis; kind: 'income' | 'expense'; labelA: string; labelB: string;
}) {
  const A = totals(selA, basis, kind), B = totals(selB, basis, kind);
  const total = A.amount - B.amount;
  const pct = B.amount !== 0 ? (total / Math.abs(B.amount)) * 100 : null;
  const parts: { label: string; v: number; detail: string; hidden?: boolean }[] = [
    { label: 'Contractor count', v: (A.c - B.c) * B.h * B.r, detail: `${A.c.toFixed(1)} in ${labelA} vs ${B.c.toFixed(1)} in ${labelB}` },
    { label: 'Hours per contractor', v: A.c * (A.h - B.h) * B.r, detail: `${A.h.toFixed(1)} in ${labelA} vs ${B.h.toFixed(1)} in ${labelB}` },
    { label: kind === 'income' ? 'Rate (client)' : 'Rate (contractor)', v: A.c * A.h * (A.r - B.r), detail: `${fmtRate(A.r)}/h in ${labelA} vs ${fmtRate(B.r)}/h in ${labelB}`, hidden: true },
  ];
  // Residual only appears when one side has no contractors/hours; fold it into rate so parts always sum to total.
  const residual = total - parts.reduce((a, p) => a + p.v, 0);
  if (Math.abs(residual) > 0.005) parts[2].v += residual;
  const shown = parts.filter((p) => !p.hidden);
  const maxAbs = Math.max(1, ...shown.map((p) => Math.abs(p.v)));
  const biggest = shown.reduce((a, p) => (Math.abs(p.v) > Math.abs(a.v) ? p : a), shown[0]);
  return (
    <div className="space-y-3">
      <div>
        <div className="text-base font-semibold">
          {title} {fmtSigned(total)}{pct != null && ` (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)`} <span className="text-muted-foreground font-normal">vs {labelB}</span>
        </div>
        <div className="text-xs text-muted-foreground">Biggest driver: {biggest.label.toLowerCase()} ({fmtSigned(biggest.v)})</div>
      </div>
      {shown.map((p) => {
        const w = (Math.abs(p.v) / maxAbs) * 50;
        return (
          <div key={p.label} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
            <div>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.detail}</div>
            </div>
            <div className="text-sm font-semibold tabular-nums text-right" style={{ color: p.v >= 0 ? COLOR_POS : COLOR_NEG }}>{fmtSigned(p.v)}</div>
            <div className="col-span-2 relative h-2 rounded bg-muted">
              <div className="absolute top-0 bottom-0 w-px bg-border" style={{ left: '50%' }} />
              <div className="absolute top-0 bottom-0 rounded" style={{ background: p.v >= 0 ? COLOR_POS : COLOR_NEG, width: `${w}%`, left: p.v >= 0 ? '50%' : `${50 - w}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DriversPanel({ selA, selB, basis, labelA, labelB, rowsA, rowsB }: { selA: WeekFig[]; selB: WeekFig[]; basis: Basis; labelA: string; labelB: string; rowsA: HistRow[]; rowsB: HistRow[] }) {
  if (selA.length === 0 || selB.length === 0) return null;
  const rates = (ws: WeekFig[]) => {
    const mh = ws.reduce((a, w) => a + w.markupHours, 0);
    if (mh <= 0) return null;
    return {
      markup: ws.reduce((a, w) => a + w.markupSum, 0) / mh,
      client: ws.reduce((a, w) => a + w.clientRateSum, 0) / mh,
      contractor: ws.reduce((a, w) => a + w.contractorRateSum, 0) / mh,
    };
  };
  const ra = rates(selA), rb = rates(selB);
  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm font-semibold">What made the difference</div>
      <SafeSection>
        <AiSummary facts={{ ...buildFacts(selA, selB, basis, labelA, labelB, ra, rb), ...summaryDatasets(rowsA, rowsB, basis) }} />
      </SafeSection>
    </Card>
  );
}

function driverFacts(selA: WeekFig[], selB: WeekFig[], basis: Basis, kind: 'income' | 'expense') {
  const A = totals(selA, basis, kind), B = totals(selB, basis, kind);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const total = A.amount - B.amount;
  const count = (A.c - B.c) * B.h * B.r, hours = A.c * (A.h - B.h) * B.r;
  return {
    amountA: r2(A.amount), amountB: r2(B.amount), change: r2(total),
    changePct: B.amount !== 0 ? r2((total / Math.abs(B.amount)) * 100) : null,
    contractorWeeksA: r2(A.c), contractorWeeksB: r2(B.c),
    avgActiveContractorsA: r2(A.c / selA.length), avgActiveContractorsB: r2(B.c / selB.length),
    hoursPerContractorA: r2(A.h), hoursPerContractorB: r2(B.h),
    effectOfContractorCount: r2(count), effectOfHoursPerContractor: r2(hours), effectOfRate: r2(total - count - hours),
  };
}

function buildFacts(selA: WeekFig[], selB: WeekFig[], basis: Basis, labelA: string, labelB: string,
  ra: { markup: number; client: number; contractor: number } | null, rb: { markup: number; client: number; contractor: number } | null) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    periodA: labelA, periodB: labelB, weeksCompared: selA.length,
    basis: basis === 'gross' ? 'gross (before fees)' : 'after fees',
    weeklyDatasetA: selA.map((w) => ({ weekStart: w.weekStart, label: w.label, weekOfYear: w.woy, active: w.active, hours: r2(w.hours), income: r2(basis === 'gross' ? w.incomeGross : w.incomeAfter), expense: r2(basis === 'gross' ? w.expenseGross : w.expenseAfter), markup: w.markupHours > 0 ? r2(w.markupSum / w.markupHours) : null })),
    weeklyDatasetB: selB.map((w) => ({ weekStart: w.weekStart, label: w.label, weekOfYear: w.woy, active: w.active, hours: r2(w.hours), income: r2(basis === 'gross' ? w.incomeGross : w.incomeAfter), expense: r2(basis === 'gross' ? w.expenseGross : w.expenseAfter), markup: w.markupHours > 0 ? r2(w.markupSum / w.markupHours) : null })),
    income: driverFacts(selA, selB, basis, 'income'),
    expense: driverFacts(selA, selB, basis, 'expense'),
    markupPerHour: ra && rb ? { A: r2(ra.markup), B: r2(rb.markup), clientRateA: r2(ra.client), clientRateB: r2(rb.client), contractorRateA: r2(ra.contractor), contractorRateB: r2(rb.contractor), note: 'markup is before fees' } : null,
  };
}

// Keeps a failed summary (or any unexpected error inside it) from taking the whole page down.
class SafeSection extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('Summary section failed:', err); }
  render() {
    if (this.state.failed) {
      return <p className="text-xs text-muted-foreground">The summary could not be shown right now. The figures above are unaffected.</p>;
    }
    return this.props.children;
  }
}

function AiSummary({ facts }: { facts: Record<string, unknown> }) {
  const key = JSON.stringify(facts);
  const [summary, setSummary] = useState<string | null>(null);
  const [state, setState] = useState<'checking' | 'idle' | 'loading'>('checking');
  const [error, setError] = useState<string | null>(null);
  const call = async (cacheOnly: boolean) => {
    const { data, error: err } = await supabase.functions.invoke('pl-analytics-summary', { body: { facts: JSON.parse(key), cacheOnly } });
    if (err) {
      let msg = err.message;
      try { const b = await (err as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data as { summary: string | null; cached?: boolean };
  };
  useEffect(() => {
    let off = false;
    setSummary(null); setError(null); setState('checking');
    call(true).then((d) => { if (!off) { setSummary(d.summary); setState('idle'); } })
      .catch(() => { if (!off) setState('idle'); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const generate = async () => {
    setState('loading'); setError(null);
    try { const d = await call(false); setSummary(d.summary); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not generate summary'); }
    finally { setState('idle'); }
  };
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" style={{ color: COLOR_A }} /> Analyst summary</div>
        {state !== 'checking' && !summary && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={generate} disabled={state === 'loading'}>
            {state === 'loading' ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Writing…</> : 'Generate summary'}
          </Button>
        )}
      </div>
      {state === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        : summary ? (
          <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed marker:text-primary">
            {summary.trim().split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map((point, index) => (
              <li key={index}>{point.replace(/^\s*[-•]\s*/, '').trim()}</li>
            ))}
          </ul>
        )
        : <p className="text-xs text-muted-foreground">Uses a small amount of AI credit. Saved once written — reopening this same comparison is free.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const MIX_COLORS = ['#0ABEDF', '#534AB7', '#185FA5', '#EF9F27', '#1D9E75', '#D85A30'];
const MIX_OTHER = 'hsl(var(--muted-foreground))';

function buildMix(rows: HistRow[]) {
  // Latest week per contractor with both rates; ties broken by most hours.
  const best = new Map<string, { ws: string; h: number; mk: number }>();
  const all = new Set<string>();
  let lastWeek: { ws: string; label: string } | null = null;
  for (const r of rows) {
    if (r.week_start && (!lastWeek || r.week_start > lastWeek.ws)) lastWeek = { ws: r.week_start, label: r.week_label ?? r.week_start.slice(0, 10) };
    if (!isContractorRow(r)) continue;
    const name = (r.contractor_name ?? '').trim().toLowerCase();
    if (!name) continue;
    all.add(name);
    const mk = markupOf(r);
    if (mk == null || r.client_rate == null || r.contractor_rate == null || !r.week_start) continue;
    const ws = r.week_start.slice(0, 10), h = rowHours(r), cur = best.get(name);
    if (!cur || ws > cur.ws || (ws === cur.ws && h > cur.h)) best.set(name, { ws, h, mk: Math.round(mk * 100) / 100 });
  }
  const counts = new Map<number, number>();
  for (const b of best.values()) counts.set(b.mk, (counts.get(b.mk) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const total = best.size;
  const slices: { name: string; rate: number | null; count: number; color: string; other?: number }[] =
    sorted.slice(0, 6).map(([rate, count], i) => ({ name: `$${rate.toFixed(2)}`, rate, count, color: MIX_COLORS[i] }));
  const rest = sorted.slice(6);
  if (rest.length) slices.push({ name: `Other (${rest.length} rates)`, rate: null, count: rest.reduce((a, [, c]) => a + c, 0), color: MIX_OTHER, other: rest.length });
  return { slices, total, noRate: all.size - total, lastLabel: lastWeek?.label ?? null, rest };

}

function MixPanel({ years, fixedYear, weekRows, title, subtitle, swatch }: {
  years: number[]; fixedYear?: number; weekRows?: HistRow[] | null; title?: string; subtitle?: string; swatch?: string;
}) {
  const isWeek = weekRows !== undefined;
  const [year, setYear] = useState<number | null>(fixedYear ?? null);
  const [yearRows, setRows] = useState<HistRow[] | null>(null);
  const [showOther, setShowOther] = useState(false);
  useEffect(() => {
    if (isWeek || fixedYear != null || year != null || years.length === 0) return;
    const prev = Number(todayET().slice(0, 4)) - 1;
    setYear(years.includes(prev) ? prev : years[0]);
  }, [years, fixedYear, year, isWeek]);
  useEffect(() => {
    if (isWeek || year == null) return;
    let cancelled = false;
    setRows(null);
    fetchYear(year).then((d) => { if (!cancelled) setRows(d?.rows ?? []); });
    return () => { cancelled = true; };
  }, [year, isWeek]);
  const rows = isWeek ? weekRows ?? null : yearRows;
  const mix = useMemo(() => (rows ? buildMix(rows) : null), [rows]);
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          {swatch && <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: swatch }} />}
          {title ?? (fixedYear != null ? `Markup rate mix · ${fixedYear}` : 'Markup rate mix')}
        </div>
        {isWeek ? null : fixedYear != null ? (
          <Badge variant="secondary" className="text-[10px]">Current year</Badge>
        ) : (
          <Select value={year != null ? String(year) : undefined} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-7 w-[84px] text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      {!isWeek && fixedYear != null && mix?.lastLabel && <div className="text-xs text-muted-foreground">As of the last synced week, {mix.lastLabel}</div>}
      {!mix ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : mix.total === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">No markup data for this year.</div>
      ) : (
        <>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mix.slices} dataKey="count" nameKey="name" innerRadius={40} outerRadius={70} stroke="none" isAnimationActive={false}>
                  {mix.slices.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={((v: number, n: string) => [`${v} contractors`, n]) as any} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1">
            {mix.slices.map((s) => {
              const pct = Math.round((s.count / mix.total) * 100);
              const tip = s.rate != null ? `${s.count} contractor${s.count === 1 ? ' has' : 's have'} a $${s.rate.toFixed(2)} markup rate` : `${s.count} contractors across ${s.other} other rates`;
              if (s.other != null && s.other > 0) {
                return (
                  <div key={s.name}>
                    <button type="button" title={tip} onClick={() => setShowOther((v) => !v)}
                      className="flex items-center gap-2 text-xs tabular-nums w-full text-left rounded hover:bg-muted/50 -mx-1 px-1 py-0.5">
                      {showOther ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                      <span>{s.name} · {s.count} · {pct}%</span>
                    </button>
                    {showOther && mix.rest.map(([rate, cnt]) => {
                      const opct = Math.round((cnt / mix.total) * 100);
                      return (
                        <div key={rate} title={`${cnt} contractor${cnt === 1 ? ' has' : 's have'} a $${rate.toFixed(2)} markup rate`} className="flex items-center gap-2 text-xs tabular-nums pl-[26px] pr-1 py-0.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: s.color }} />
                          <span>${rate.toFixed(2)} · {cnt} · {opct}%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div key={s.name} title={tip} className="flex items-center gap-2 text-xs tabular-nums">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span>{s.name} · {s.count} · {pct}%</span>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground border-t pt-2">{mix.total} contractors · {mix.noRate} with no rate on file</div>
        </>
      )}
    </Card>
  );
}
