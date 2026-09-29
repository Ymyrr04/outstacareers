import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, Loader2, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HistoricalUploadDialog, HIST_YEARS } from './HistoricalUploadDialog';

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

  const load = useCallback(async () => {
    setLoading(true);
    const { data: batches, error: bErr } = await supabase
      .from('historical_pl_batches').select('id').eq('year', year);
    if (bErr) { toast.error('Failed to load historical data'); setLoading(false); return; }
    const ids = (batches ?? []).map((b) => b.id);
    setBatchIds(ids);
    if (ids.length === 0) { setRows([]); setLoading(false); return; }

    const all: HistRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('historical_pl_rows')
        .select('id, week_label, week_start, contractor_name, company, hours, contractor_rate, client_rate, contractor_cost, client_billing, margin')
        .in('batch_id', ids)
        .order('week_start', { ascending: true, nullsFirst: false })
        .order('contractor_name', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { toast.error('Failed to load historical rows'); break; }
      all.push(...((data ?? []) as HistRow[]));
      if (!data || data.length < PAGE) break;
    }
    setRows(all);
    setLoading(false);
  }, [year]);

  useEffect(() => { void load(); }, [load]);

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
            <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete {year}
            </Button>
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
                  <TableHead>Contractor</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Contractor rate</TableHead>
                  <TableHead className="text-right">Client rate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Billing</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((w) => (
                  <Fragment key={w.key}>
                    <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                      <TableCell colSpan={2}>{w.label} <span className="text-xs font-normal text-muted-foreground">· {w.headcount} contractors</span></TableCell>
                      <TableCell className="text-right">{w.totals.hours.toFixed(2)}</TableCell>
                      <TableCell /><TableCell />
                      <TableCell className="text-right">{money(w.totals.cost)}</TableCell>
                      <TableCell className="text-right">{money(w.totals.billing)}</TableCell>
                      <TableCell className="text-right">{money(w.totals.margin)}</TableCell>
                    </TableRow>
                    {w.rows.map((r) => (
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
