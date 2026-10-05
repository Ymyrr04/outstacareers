import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const HIST_YEARS = Array.from(
  { length: Math.max(2025, new Date().getFullYear()) - 2021 + 1 },
  (_, index) => 2021 + index,
);

export const FIELDS = [
  { key: 'contractor_name', label: 'Contractor', numeric: false, guess: [/^contractors?$/i, /^name$|^employee$|^va$/i] },
  { key: 'company', label: 'Company', numeric: false, guess: [/^client\s*\/\s*company$/i, /^company$|^client$|^account$/i] },
  { key: 'hours', label: 'Standard hours', numeric: true, guess: [/^standard hours$/i, /^hours$|^no\.? of hours$|^hrs$/i] },
  { key: 'contractor_rate', label: 'Contractor rate', numeric: true, guess: [/^contractor rate$/i, /^(?:va|pay) rate$/i] },
  { key: 'client_rate', label: 'Client rate', numeric: true, guess: [/^client rate$/i, /^bill rate$/i] },
  { key: 'contractor_cost', label: 'Cost', numeric: true, guess: [/^expenses?$/i, /^cost$|^payout$|^(?:contractor|va) (?:pay|amount)$/i] },
  { key: 'client_billing', label: 'Billing', numeric: true, guess: [/^income$/i, /^billing$|^billed(?: to .*)?$|^invoice$|^revenue$/i] },
  { key: 'margin', label: 'Margin', numeric: true, guess: [/^gross profit$/i, /^margin$|^profit$/i] },
  { key: 'expense_after_1_percent', label: 'Expense After 1%', numeric: true, guess: [/^expenses? after 1\s*%$/i] },
  { key: 'income_after_3_percent', label: 'Income After 3%', numeric: true, guess: [/^income after 3\s*%$/i] },
  { key: 'gross_after_deductions', label: 'Gross After Deductions', numeric: true, guess: [/^gross after deductions$/i] },
  { key: 'client_deposit', label: 'Client Deposit', numeric: true, guess: [/^client deposit$/i] },
  { key: 'contractor_deposit', label: 'Contractor Deposit', numeric: true, guess: [/^contractor deposit$/i] },
  { key: 'actual_hours', label: 'Actual hours', numeric: true, guess: [/^actual hours$/i] },
] as const;
const DISPLAY_FIELDS = FIELDS.slice(0, 8);
const EXTRA_FIELDS = FIELDS.slice(8);
export type FieldKey = typeof FIELDS[number]['key'];
export type Mapping = Record<FieldKey, string>; // header name or ''
export const NONE = '__none__';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const SYNC_START = '2026-09-21';

/** "September 4 - September 10" or "Sep 28 - 4" → plain YYYY-MM-DD strings. */
export function parseWeekTab(name: string, year: number): { start: string; end: string } | null {
  const m = name.trim().match(/^([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to)+\s*(?:([A-Za-z]+)\.?\s*)?(\d{1,2})/i);
  if (!m) return null;
  const sm = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
  const em = m[3] ? MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1 : sm;
  const sd = Number(m[2]); const ed = Number(m[4]);
  if (sm < 1 || em < 1 || sd < 1 || sd > 31 || ed < 1 || ed > 31) return null;
  const endYear = em < sm || (em === sm && ed < sd) ? year + 1 : year;
  return { start: ymd(year, sm, sd), end: ymd(endYear, em, ed) };
}

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  dates: { start: string; end: string } | null;
}

function readSheet(ws: XLSX.WorkSheet, name: string, year: number): ParsedSheet {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, blankrows: false });
  const hIdx = aoa.findIndex((r) => r.filter((c) => String(c ?? '').trim() !== '').length >= 2);
  const headers = hIdx >= 0 ? aoa[hIdx].map((c, i) => String(c ?? '').trim() || `Column ${i + 1}`) : [];
  const rows = hIdx >= 0 ? aoa.slice(hIdx + 1).map((r) => {
    const o: Record<string, unknown> = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return o;
  }) : [];
  return { name, headers, rows, dates: parseWeekTab(name, year) };
}

export const hKey = (h: string[]) => h.join('\u0001');

export function guessMapping(headers: string[]): Mapping {
  const used = new Set<string>();
  const out = {} as Mapping;
  for (const f of FIELDS) {
    const h = f.guess.map((re) => headers.find((hh) => !used.has(hh) && re.test(hh.trim()))).find(Boolean);
    out[f.key] = h ?? '';
    if (h) used.add(h);
  }
  return out;
}

export function toNum(v: unknown): number | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultYear: number;
  onImported: (year: number) => void;
}

export function HistoricalUploadDialog({ open, onOpenChange, defaultYear, onImported }: Props) {
  const { user } = useAuth();
  const [year, setYear] = useState(defaultYear);
  const [filename, setFilename] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [replaceIds, setReplaceIds] = useState<string[] | null>(null);
  const [syncedWeeks, setSyncedWeeks] = useState<Set<string>>(new Set());
  // Status filter: per-layout status column + status values excluded from headcount
  const [statusCols, setStatusCols] = useState<Record<string, string>>({});
  const [excludedStatuses, setExcludedStatuses] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setSyncedWeeks(new Set());
    void (async () => {
      const { data: batches } = await supabase.from('historical_pl_batches').select('id').eq('year', year).eq('source', 'timesheet_sync');
      const ids = (batches ?? []).map((b) => b.id);
      if (!ids.length) return;
      const { data: rows } = await supabase.from('historical_pl_rows').select('week_start').in('batch_id', ids).gte('week_start', SYNC_START);
      if (cancelled || !rows) return;
      setSyncedWeeks(new Set(rows.map((r) => r.week_start).filter((w): w is string => !!w)));
    })();
    return () => { cancelled = true; };
  }, [year]);

  const reset = () => { setStatusCols({}); setExcludedStatuses(new Set()); setFilename(''); setSheets([]); setMappings(null); setReplaceIds(null); };
  const close = (o: boolean) => { if (importing) return; if (!o) reset(); onOpenChange(o); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const parsed = wb.SheetNames.map((n) => readSheet(wb.Sheets[n], n, year));
      if (!parsed.some((p) => p.headers.length)) throw new Error('No headers found in any sheet');
      setFilename(file.name);
      setSheets(parsed);
      const init: Record<string, Mapping> = {};
      for (const p of parsed) if (p.headers.length && !init[hKey(p.headers)]) init[hKey(p.headers)] = guessMapping(p.headers);
      setMappings(init);
    } catch (e) {
      toast.error(`Could not read workbook: ${(e as Error).message}`);
    } finally { setParsing(false); }
  };

  // re-parse dates if the year changes after upload
  const sheetsWithDates = useMemo(() => sheets.map((s) => ({ ...s, dates: parseWeekTab(s.name, year) })), [sheets, year]);
  const badDates = sheetsWithDates.filter((s) => !s.dates);
  const syncSkipped = sheetsWithDates.filter((s) => s.dates && s.dates.start >= SYNC_START && syncedWeeks.has(s.dates.start));
  const usable = sheetsWithDates.filter((s) => s.headers.length && !syncSkipped.includes(s));
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; headers: string[]; sheets: string[] }>();
    for (const s of usable) {
      const k = hKey(s.headers);
      if (!m.has(k)) m.set(k, { key: k, headers: s.headers, sheets: [] });
      m.get(k)!.sheets.push(s.name);
    }
    return [...m.values()];
  }, [usable]);
  const mapping = mappings && groups.length ? mappings : null;
  const statusColOf = (g: { key: string; headers: string[] }) =>
    g.key in statusCols ? statusCols[g.key] : (g.headers.find((h) => /^status$/i.test(h.trim())) ?? '');
  const statusValues = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const g of groups) {
      const col = statusColOf(g);
      if (!col) continue;
      for (const s of usable) {
        if (hKey(s.headers) !== g.key) continue;
        for (const r of s.rows) {
          const v = String(r[col] ?? '').trim();
          if (!v) continue;
          const k = v.toLowerCase();
          const e = m.get(k) ?? { label: v, count: 0 };
          e.count++; m.set(k, e);
        }
      }
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, usable, statusCols]);
  const allMapped = !!mapping && groups.every((g) => mapping[g.key]?.contractor_name);

  const { importRows, skipped } = useMemo(() => {
    if (!mapping) return { importRows: [], skipped: 0 };
    const out: Record<string, unknown>[] = []; let skip = 0;
    for (const s of usable) {
      const gk = hKey(s.headers);
      const mp = mapping[gk];
      const sCol = gk in statusCols ? statusCols[gk] : (s.headers.find((h) => /^status$/i.test(h.trim())) ?? '');
      if (!mp || !mp.contractor_name) continue;
      for (const r of s.rows) {
        const name = String(r[mp.contractor_name] ?? '').trim();
        const hasTotal = Object.values(r).some((v) => /total/i.test(String(v ?? '')));
        if (!name || hasTotal) { skip++; continue; }
        const row: Record<string, unknown> = {
          week_label: s.name, week_start: s.dates?.start ?? null, week_end: s.dates?.end ?? null, raw: r,
        };
        if (sCol) {
          const st = String(r[sCol] ?? '').trim().toLowerCase();
          if (st && excludedStatuses.has(st)) row.raw = { ...r, __exclude_headcount: true };
        }
        for (const f of FIELDS) {
          const h = mp[f.key];
          const v = h ? r[h] : null;
          row[f.key] = f.numeric ? toNum(v) : (h ? String(v ?? '').trim() || null : null);
        }
        out.push(row);
      }
    }
    return { importRows: out, skipped: skip };
  }, [usable, mapping, statusCols, excludedStatuses]);

  const startImport = async () => {
    const { data, error } = await supabase.from('historical_pl_batches').select('id').eq('year', year).eq('source', 'upload');
    if (error) { toast.error('Could not check existing data'); return; }
    if (data && data.length) { setReplaceIds(data.map((b) => b.id)); return; }
    void doImport([]);
  };

  const doImport = async (oldIds: string[]) => {
    setReplaceIds(null);
    setImporting(true);
    let batchId: string | null = null;
    try {
      const { data: batch, error: bErr } = await supabase.from('historical_pl_batches')
        .insert({ year, filename, column_map: groups.map((g) => ({ sheets: g.sheets, map: mapping?.[g.key] })) as any, uploaded_by: user?.id ?? null })
        .select('id').single();
      if (bErr || !batch) throw bErr ?? new Error('Batch not created');
      batchId = batch.id;
      for (let i = 0; i < importRows.length; i += 500) {
        const chunk = importRows.slice(i, i + 500).map((r) => ({ ...r, batch_id: batch.id }));
        const { error } = await supabase.from('historical_pl_rows').insert(chunk as any);
        if (error) throw error;
      }
      if (oldIds.length) {
        const { error } = await supabase.from('historical_pl_batches').delete().in('id', oldIds).eq('source', 'upload');
        if (error) throw error;
      }
      toast.success(`Imported ${importRows.length.toLocaleString()} rows for ${year}`);
      onImported(year);
      reset();
      onOpenChange(false);
    } catch (e) {
      if (batchId) await supabase.from('historical_pl_batches').delete().eq('id', batchId);
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally { setImporting(false); }
  };

  const preview = importRows.slice(0, 10);

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload historical P&amp;L</DialogTitle>
            <DialogDescription>One workbook per year. Each sheet tab is one week, e.g. "September 4 - September 10".</DialogDescription>
          </DialogHeader>

           <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">Year</span>
              {HIST_YEARS.map((y) => (
                <button key={y} type="button" disabled={importing} onClick={() => setYear(y)}
                  className={cn('px-4 py-1.5 rounded-full text-sm font-medium border',
                    y === year ? 'bg-[var(--brand)] border-[var(--brand)] text-primary-foreground' : 'bg-background border-border text-muted-foreground hover:bg-muted')}>
                  {y}
                </button>
              ))}
              <input type="file" accept=".xlsx,.xls,.csv" disabled={parsing || importing}
                onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
                className="text-sm ml-auto file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm" />
              {parsing && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            {mapping && (
              <>
                <div className="text-sm text-muted-foreground">
                  <b className="text-foreground">{filename}</b> · {sheets.length} sheets · {usable.length} will be imported
                  {groups.length > 1 && <> · {groups.length} different column layouts — map each one below</>}
                </div>

                {badDates.length > 0 && (
                  <div className="rounded-md border border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                    {badDates.map((s) => (
                      <div key={`d-${s.name}`} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />"{s.name}" — couldn't read dates from tab name, will import without week dates</div>
                    ))}
                  </div>
                )}

                {syncSkipped.length > 0 && (
                  <div className="rounded-md border border-sky-400/60 bg-sky-50/50 dark:bg-sky-950/20 p-3 text-sm space-y-1">
                    {syncSkipped.map((s) => (
                      <div key={`s-${s.name}`} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-sky-500 shrink-0" />"{s.name}" — skipped, this week is already synced from timesheets</div>
                    ))}
                  </div>
                )}

                {groups.map((g, gi) => {
                  const mp = mapping[g.key] ?? guessMapping(g.headers);
                  return (
                     <div key={g.key} className={cn('min-w-0 rounded-md border p-3 space-y-3', !mp.contractor_name && 'border-amber-400')}>
                      {groups.length > 1 && (
                        <div className="text-xs">
                          <b>Layout {gi + 1}</b> · {g.sheets.length} sheet{g.sheets.length === 1 ? '' : 's'}
                          <span className="text-muted-foreground"> — {g.sheets.slice(0, 4).join(', ')}{g.sheets.length > 4 ? ` +${g.sheets.length - 4} more` : ''}</span>
                        </div>
                      )}
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0 [&_[role=combobox]]:w-full [&_[role=combobox]]:min-w-0">
                         {DISPLAY_FIELDS.map((f) => (
                           <div key={f.key} className="space-y-1 min-w-0">
                            <label className="text-xs font-medium">{f.label}{f.key === 'contractor_name' && ' *'}</label>
                            <Select value={mp[f.key] || NONE}
                              onValueChange={(v) => setMappings({ ...mapping, [g.key]: { ...mp, [f.key]: v === NONE ? '' : v } })}>
                               <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>— Not mapped —</SelectItem>
                                {g.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                       <details className="text-sm">
                         <summary className="cursor-pointer text-muted-foreground">Additional spreadsheet fields</summary>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 [&>*]:min-w-0 [&_[role=combobox]]:w-full [&_[role=combobox]]:min-w-0">
                           {EXTRA_FIELDS.map((f) => (
                             <div key={f.key} className="space-y-1 min-w-0">
                               <label className="text-xs font-medium">{f.label}</label>
                               <Select value={mp[f.key] || NONE}
                                 onValueChange={(v) => setMappings({ ...mapping, [g.key]: { ...mp, [f.key]: v === NONE ? '' : v } })}>
                                 <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value={NONE}>— Not mapped —</SelectItem>
                                   {g.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                 </SelectContent>
                               </Select>
                             </div>
                           ))}
                         </div>
                       </details>
                    </div>
                  );
                })}

                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">Status filter <span className="font-normal text-muted-foreground">— ticked statuses are left out of that week's headcount (their money and hours still count)</span></div>
                  <div className="flex flex-wrap gap-3">
                    {groups.map((g, gi) => (
                      <div key={`st-${g.key}`} className="space-y-1 min-w-[180px]">
                        <label className="text-xs font-medium">Status column{groups.length > 1 ? ` (Layout ${gi + 1})` : ''}</label>
                        <Select value={statusColOf(g) || NONE} onValueChange={(v) => setStatusCols({ ...statusCols, [g.key]: v === NONE ? '' : v })}>
                          <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Not mapped —</SelectItem>
                            {g.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  {statusValues.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {statusValues.map(([k, v]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" className="h-4 w-4" checked={excludedStatuses.has(k)}
                            onChange={(e) => { const n = new Set(excludedStatuses); if (e.target.checked) n.add(k); else n.delete(k); setExcludedStatuses(n); }} />
                          Exclude "{v.label}" <span className="text-muted-foreground">({v.count})</span>
                        </label>
                      ))}
                    </div>
                  ) : <div className="text-xs text-muted-foreground">No status values found — pick the status column above.</div>}
                </div>

                <div className="text-sm">
                  <b>{importRows.length.toLocaleString()}</b> rows to import · <b>{skipped.toLocaleString()}</b> skipped (no contractor name or contains "total")
                </div>

                {preview.length > 0 && (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Week</TableHead>
                           {DISPLAY_FIELDS.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs whitespace-nowrap">{String(r.week_start)} → {String(r.week_end)}</TableCell>
                             {DISPLAY_FIELDS.map((f) => <TableCell key={f.key} className="text-xs">{r[f.key] == null ? '—' : String(r[f.key])}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)} disabled={importing}>Cancel</Button>
            <Button onClick={startImport} disabled={!allMapped || importRows.length === 0 || importing}>
              {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</> : `Import ${importRows.length.toLocaleString()} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!replaceIds} onOpenChange={(o) => { if (!o) setReplaceIds(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {year} data?</AlertDialogTitle>
            <AlertDialogDescription>{year} already has uploaded data. Importing will replace it with this workbook.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => replaceIds && void doImport(replaceIds)}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
