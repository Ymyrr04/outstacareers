import { useMemo, useState } from 'react';
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

const FIELDS = [
  { key: 'contractor_name', label: 'Contractor', numeric: false, guess: [/contractor|name|employee|va\b/i] },
  { key: 'company', label: 'Company', numeric: false, guess: [/company|client|account/i] },
  { key: 'hours', label: 'Hours', numeric: true, guess: [/hour|hrs/i] },
  { key: 'contractor_rate', label: 'Contractor rate', numeric: true, guess: [/(contractor|va|pay).*rate/i] },
  { key: 'client_rate', label: 'Client rate', numeric: true, guess: [/(client|bill).*rate/i] },
  { key: 'contractor_cost', label: 'Cost', numeric: true, guess: [/cost|payout|(contractor|va).*(pay|amount)/i] },
  { key: 'client_billing', label: 'Billing', numeric: true, guess: [/billing|billed|invoice|revenue/i] },
  { key: 'margin', label: 'Margin', numeric: true, guess: [/margin|profit/i] },
] as const;
type FieldKey = typeof FIELDS[number]['key'];
type Mapping = Record<FieldKey, string>; // header name or ''
const NONE = '__none__';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** "September 4 - September 10" or "Sep 28 - 4" → plain YYYY-MM-DD strings. */
export function parseWeekTab(name: string, year: number): { start: string; end: string } | null {
  const m = name.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2})\s*[-–—to]+\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2})/i);
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

const hKey = (h: string[]) => h.join('\u0001');

function guessMapping(headers: string[]): Mapping {
  const used = new Set<string>();
  const out = {} as Mapping;
  // specific (rate) fields first so "Rate" columns don't get stolen
  const order: FieldKey[] = ['contractor_rate', 'client_rate', 'client_billing', 'contractor_cost', 'margin', 'hours', 'company', 'contractor_name'];
  for (const key of order) {
    const f = FIELDS.find((x) => x.key === key)!;
    const h = headers.find((hh) => !used.has(hh) && f.guess.some((re) => re.test(hh)));
    out[key] = h ?? '';
    if (h) used.add(h);
  }
  return out;
}

function toNum(v: unknown): number | null {
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

  const reset = () => { setFilename(''); setSheets([]); setMappings(null); setReplaceIds(null); };
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
  const badDates = sheetsWithDates.filter((s) => !s.dates || !s.headers.length);
  const usable = sheetsWithDates.filter((s) => s.dates && s.headers.length);
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
  const allMapped = !!mapping && groups.every((g) => mapping[g.key]?.contractor_name);

  const { importRows, skipped } = useMemo(() => {
    if (!mapping) return { importRows: [], skipped: 0 };
    const out: Record<string, unknown>[] = []; let skip = 0;
    for (const s of usable) {
      const mp = mapping[hKey(s.headers)];
      if (!mp || !mp.contractor_name) continue;
      for (const r of s.rows) {
        const name = String(r[mp.contractor_name] ?? '').trim();
        const hasTotal = Object.values(r).some((v) => /total/i.test(String(v ?? '')));
        if (!name || hasTotal) { skip++; continue; }
        const row: Record<string, unknown> = {
          week_label: s.name, week_start: s.dates!.start, week_end: s.dates!.end, raw: r,
        };
        for (const f of FIELDS) {
          const h = mp[f.key];
          const v = h ? r[h] : null;
          row[f.key] = f.numeric ? toNum(v) : (h ? String(v ?? '').trim() || null : null);
        }
        out.push(row);
      }
    }
    return { importRows: out, skipped: skip };
  }, [usable, mapping]);

  const startImport = async () => {
    const { data, error } = await supabase.from('historical_pl_batches').select('id').eq('year', year);
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
        .insert({ year, filename, column_map: groups.map((g) => ({ sheets: g.sheets, map: mapping![g.key] })) as any, uploaded_by: user?.id ?? null })
        .select('id').single();
      if (bErr || !batch) throw bErr ?? new Error('Batch not created');
      batchId = batch.id;
      for (let i = 0; i < importRows.length; i += 500) {
        const chunk = importRows.slice(i, i + 500).map((r) => ({ ...r, batch_id: batch.id }));
        const { error } = await supabase.from('historical_pl_rows').insert(chunk as any);
        if (error) throw error;
      }
      if (oldIds.length) {
        const { error } = await supabase.from('historical_pl_batches').delete().in('id', oldIds);
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

          <div className="flex flex-col gap-4">
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
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
                    {badDates.map((s) => (
                      <div key={`d-${s.name}`} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-destructive shrink-0" />"{s.name}" — couldn't read dates from tab name, skipped</div>
                    ))}
                  </div>
                )}

                {groups.map((g, gi) => {
                  const mp = mapping[g.key] ?? guessMapping(g.headers);
                  return (
                    <div key={g.key} className={cn('rounded-md border p-3 space-y-3', !mp.contractor_name && 'border-amber-400')}>
                      {groups.length > 1 && (
                        <div className="text-xs">
                          <b>Layout {gi + 1}</b> · {g.sheets.length} sheet{g.sheets.length === 1 ? '' : 's'}
                          <span className="text-muted-foreground"> — {g.sheets.slice(0, 4).join(', ')}{g.sheets.length > 4 ? ` +${g.sheets.length - 4} more` : ''}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {FIELDS.map((f) => (
                          <div key={f.key} className="space-y-1">
                            <label className="text-xs font-medium">{f.label}{f.key === 'contractor_name' && ' *'}</label>
                            <Select value={mp[f.key] || NONE}
                              onValueChange={(v) => setMappings({ ...mapping, [g.key]: { ...mp, [f.key]: v === NONE ? '' : v } })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>— Not mapped —</SelectItem>
                                {g.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="text-sm">
                  <b>{importRows.length.toLocaleString()}</b> rows to import · <b>{skipped.toLocaleString()}</b> skipped (no contractor name or contains "total")
                </div>

                {preview.length > 0 && (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Week</TableHead>
                          {FIELDS.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs whitespace-nowrap">{String(r.week_start)} → {String(r.week_end)}</TableCell>
                            {FIELDS.map((f) => <TableCell key={f.key} className="text-xs">{r[f.key] == null ? '—' : String(r[f.key])}</TableCell>)}
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
