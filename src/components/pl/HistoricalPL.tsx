import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronRight, Loader2, Upload, Trash2, Columns3, ArrowUpDown, Search } from 'lucide-react';
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

type SortKey = 'contractor_name' | 'company' | 'hours' | 'contractor_rate' | 'client_rate' | 'contractor_cost' | 'client_billing' | 'margin';
interface SortState { key: SortKey; dir: 'asc' | 'desc' }
const SORTABLE: { key: SortKey; label: string; numeric?: boolean; width?: string }[] = [
  { key: 'contractor_name', label: 'Contractor' },
  { key: 'company', label: 'Company' },
  { key: 'hours', label: 'Hours', numeric: true, width: 'w-[90px]' },
  { key: 'contractor_rate', label: 'Contractor rate', numeric: true, width: 'w-[140px]' },
  { key: 'client_rate', label: 'Client rate', numeric: true, width: 'w-[120px]' },
  { key: 'contractor_cost', label: 'Cost', numeric: true, width: 'w-[130px]' },
  { key: 'client_billing', label: 'Billing', numeric: true, width: 'w-[130px]' },
  { key: 'margin', label: 'Margin', numeric: true, width: 'w-[130px]' },
];

interface Props { onUpload?: (year: number) => void }

export function HistoricalPL({ onUpload }: Props) {
  const [year, setYear] = useState(HIST_YEARS[HIST_YEARS.length - 1]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openWeekKey, setOpenWeekKey] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [remapOpen, setRemapOpen] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const [query, setQuery] = useState('');

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
  useEffect(() => { setOpenWeekKey(null); }, [year]);

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
      const t = w.rows.reduce((a, r) => ({
        hours: a.hours + num(r.hours), cost: a.cost + num(r.contractor_cost),
        billing: a.billing + num(r.client_billing), margin: a.margin + num(r.margin),
      }), { hours: 0, cost: 0, billing: 0, margin: 0 });
      const headcount = new Set(w.rows.map((r) => (r.contractor_name || '').trim().toLowerCase()).filter(Boolean)).size;
      return { key, label: w.label, rows: w.rows, totals: t, headcount };
    });
  }, [rows]);

  const openWeek = openWeekKey ? weeks.find((w) => w.key === openWeekKey) ?? null : null;

  // Reset the search whenever a different week is opened.
  useEffect(() => { setQuery(''); }, [openWeekKey]);

  const detailRows = useMemo(() => {
    if (!openWeek) return [];
    const q = query.trim().toLowerCase();
    const base = q
      ? openWeek.rows.filter((r) =>
          (r.contractor_name || '').toLowerCase().includes(q) || (r.company || '').toLowerCase().includes(q))
      : openWeek.rows;
    return sort ? [...base].sort(cmpRows) : base;
  }, [openWeek, query, sort]);

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
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right tabular-nums">Hours</TableHead>
                <TableHead className="text-right tabular-nums">Cost</TableHead>
                <TableHead className="text-right tabular-nums">Billing</TableHead>
                <TableHead className="text-right tabular-nums">Margin</TableHead>
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
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{money(w.totals.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{money(w.totals.billing)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{money(w.totals.margin)}</TableCell>
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
        <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-baseline gap-2 flex-wrap">
              <span>{openWeek?.label}</span>
              {openWeek && <span className="text-sm font-normal text-muted-foreground">· {openWeek.headcount} contractors</span>}
            </DialogTitle>
          </DialogHeader>

          {openWeek && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Hours', value: openWeek.totals.hours.toFixed(2) },
                  { label: 'Cost', value: money(openWeek.totals.cost) },
                  { label: 'Billing', value: money(openWeek.totals.billing) },
                  { label: 'Margin', value: money(openWeek.totals.margin) },
                ].map((s) => (
                  <div key={s.label} className="border rounded-lg p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-semibold tabular-nums whitespace-nowrap mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contractor or company"
                  className="pl-8 h-9"
                />
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {SORTABLE.map((c) => {
                        const active = sort?.key === c.key;
                        return (
                          <TableHead
                            key={c.key}
                            className={cn(
                              'cursor-pointer select-none hover:bg-muted/60',
                              c.width,
                              c.numeric && 'text-right',
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
                              {active && <span className="text-xs">{sort!.dir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={SORTABLE.length} className="text-center text-muted-foreground py-8">
                          No contractors match "{query}"
                        </TableCell>
                      </TableRow>
                    ) : detailRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[240px]">
                          <div className="truncate" title={r.contractor_name || undefined}>{r.contractor_name || '—'}</div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="truncate" title={r.company || undefined}>{r.company || '—'}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{num(r.hours).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{r.contractor_rate != null ? money(num(r.contractor_rate)) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{r.client_rate != null ? money(num(r.client_rate)) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{money(num(r.contractor_cost))}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{money(num(r.client_billing))}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{money(num(r.margin))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
