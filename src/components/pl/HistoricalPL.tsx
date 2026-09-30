import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, Loader2, Upload, Trash2, Columns3, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HistoricalUploadDialog, HIST_YEARS } from './HistoricalUploadDialog';
import { HistoricalRemapDialog } from './HistoricalRemapDialog';

interface HistRow {
  id: string;
  week_label: string | null;
  week_start: string | null;
  contractor_name: string | null;
  company: string | null;
  hours: number | null;
  contractor_rate: number | null;
  client_rate: number | null;
  contractor_cost: number | null;
  client_billing: number | null;
  margin: number | null;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined) => Number(n ?? 0);

// ---- Per-year cache (memory + localStorage), invalidated when batches or their mapping change ----
interface CacheEntry { sig: string; ids: string[]; rows: HistRow[] }
const memCache = new Map<number, CacheEntry>();
const CACHE_KEY = (y: number) => `hist-pl-cache-v1-${y}`;
function readCache(y: number): CacheEntry | null {
  if (memCache.has(y)) return memCache.get(y)!;
  try {
    const s = localStorage.getItem(CACHE_KEY(y));
    if (!s) return null;
    const e = JSON.parse(s) as CacheEntry;
    memCache.set(y, e);
    return e;
  } catch { return null; }
}
function writeCache(y: number, e: CacheEntry) {
  memCache.set(y, e);
  try { localStorage.setItem(CACHE_KEY(y), JSON.stringify(e)); } catch { /* storage full — memory only */ }
}
function signature(batches: { id: string; created_at: string; column_map: unknown }[]) {
  const str = [...batches].sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => `${b.id}|${b.created_at}|${JSON.stringify(b.column_map ?? null)}`).join('#');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return `${batches.length}:${h}`;
}

interface SortState { key: SortKey; dir: 'asc' | 'desc' }
type SortKey = 'contractor_name' | 'company' | 'hours' | 'contractor_rate' | 'client_rate' | 'contractor_cost' | 'client_billing' | 'margin';
const SORTABLE: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'contractor_name', label: 'Contractor' },
  { key: 'company', label: 'Company' },
  { key: 'hours', label: 'Hours', numeric: true },
  { key: 'contractor_rate', label: 'Contractor rate', numeric: true },
  { key: 'client_rate', label: 'Client rate', numeric: true },
  { key: 'contractor_cost', label: 'Cost', numeric: true },
  { key: 'client_billing', label: 'Billing', numeric: true },
  { key: 'margin', label: 'Margin', numeric: true },
];

interface Props { onUpload?: (year: number) => void }

export function HistoricalPL({ onUpload }: Props) {
  const [year, setYear] = useState(HIST_YEARS[HIST_YEARS.length - 1]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [remapOpen, setRemapOpen] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  const load = useCallback(async () => {
    // Show cached rows instantly, then check whether anything changed.
    const cached = readCache(year);
    if (cached) { setBatchIds(cached.ids); setRows(cached.rows); setLoading(false); }
    else setLoading(true);

    const { data: batches, error: bErr } = await supabase
      .from('historical_pl_batches').select('id, created_at, column_map').eq('year', year);
    if (bErr) { if (!cached) toast.error('Failed to load historical data'); setLoading(false); return; }
    const ids = (batches ?? []).map((b) => b.id);
    const sig = signature(batches ?? []);
    setBatchIds(ids);
    if (cached && cached.sig === sig) { setLoading(false); return; }
    if (ids.length === 0) { setRows([]); writeCache(year, { sig, ids, rows: [] }); setLoading(false); return; }

    const all: HistRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('historical_pl_rows')
        .select('id, week_label, week_start, contractor_name, company, hours, contractor_rate, client_rate, contractor_cost, client_billing, margin')
        .in('batch_id', ids)
        .order('week_start', { ascending: true, nullsFirst: false })
        .order('contractor_name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { toast.error('Failed to load historical rows'); setLoading(false); return; }
      all.push(...((data ?? []) as HistRow[]));
      if (!data || data.length < PAGE) break;
    }
    setRows(all);
    writeCache(year, { sig, ids, rows: all });
    setLoading(false);
  }, [year]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOpenWeeks(new Set()); }, [year]);

  const toggleWeek = (key: string) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const sortKey = (r: HistRow): string | number => {
    if (!sort) return '';
    if (sort.key === 'contractor_name' || sort.key === 'company') {
      return (r[sort.key] || '').trim().toLowerCase();
    }
    return num(r[sort.key]);
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
      const sorted = sort ? [...w.rows].sort(cmpRows) : w.rows;
      const t = w.rows.reduce((a, r) => ({
        hours: a.hours + num(r.hours), cost: a.cost + num(r.contractor_cost),
        billing: a.billing + num(r.client_billing), margin: a.margin + num(r.margin),
      }), { hours: 0, cost: 0, billing: 0, margin: 0 });
      const headcount = new Set(w.rows.map((r) => (r.contractor_name || '').trim().toLowerCase()).filter(Boolean)).size;
      return { key, label: w.label, rows: sorted, totals: t, headcount };
    });
  }, [rows, sort]);


  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('historical_pl_batches').delete().in('id', batchIds);
    setDeleting(false);
    setConfirmOpen(false);
    if (error) { toast.error(`Failed to delete ${year} data`); return; }
    toast.success(`${year} historical data deleted`);
    void load();
  };

  const handleUpload = () => {
    if (onUpload) onUpload(year);
    else setUploadOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
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
          {batchIds.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setRemapOpen(true)}>
                <Columns3 className="h-4 w-4" /> Edit mapping
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete {year}
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 border rounded-lg bg-card">
          <p className="text-muted-foreground">No data uploaded for {year}</p>
          <Button onClick={handleUpload} className="gap-2"><Upload className="h-4 w-4" /> Upload</Button>
        </div>
      ) : (
        <>
          <div className="border rounded-lg bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {SORTABLE.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <TableHead
                        key={c.key}
                        className={cn('cursor-pointer select-none hover:bg-muted/60', c.numeric && 'text-right', active && 'text-foreground')}
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
                          {active && <span className="text-xs">{sort!.dir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((w) => (
                  <Fragment key={w.key}>
                    <TableRow
                      className="bg-muted/60 font-semibold hover:bg-muted/60 cursor-pointer select-none"
                      onClick={() => toggleWeek(w.key)}
                    >
                      <TableCell colSpan={2}>
                        <span className="inline-flex items-center gap-1.5">
                          {openWeeks.has(w.key)
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          {w.label}
                          <span className="text-xs font-normal text-muted-foreground">· {w.headcount} contractors</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{w.totals.hours.toFixed(2)}</TableCell>
                      <TableCell /><TableCell />
                      <TableCell className="text-right">{money(w.totals.cost)}</TableCell>
                      <TableCell className="text-right">{money(w.totals.billing)}</TableCell>
                      <TableCell className="text-right">{money(w.totals.margin)}</TableCell>
                    </TableRow>
                    {openWeeks.has(w.key) && w.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.contractor_name || '—'}</TableCell>
                        <TableCell>{r.company || '—'}</TableCell>
                        <TableCell className="text-right">{num(r.hours).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{r.contractor_rate != null ? money(num(r.contractor_rate)) : '—'}</TableCell>
                        <TableCell className="text-right">{r.client_rate != null ? money(num(r.client_rate)) : '—'}</TableCell>
                        <TableCell className="text-right">{money(num(r.contractor_cost))}</TableCell>
                        <TableCell className="text-right">{money(num(r.client_billing))}</TableCell>
                        <TableCell className="text-right">{money(num(r.margin))}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

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
              This removes every uploaded row for {year}. Live P&amp;L data is not affected. This cannot be undone.
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
    </div>
  );
}
