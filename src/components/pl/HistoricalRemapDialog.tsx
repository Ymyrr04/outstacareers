import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FIELDS, NONE, guessMapping, hKey, toNum, type Mapping } from './HistoricalUploadDialog';

interface StoredGroup { sheets?: string[]; headers?: string[]; map?: Partial<Mapping> }
interface RawRow { id: string; batch_id: string; raw: Record<string, unknown> | null }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year: number;
  onApplied: () => void;
}

interface Group {
  key: string;
  headers: string[];
  rowIds: string[];
  raws: RawRow[];
}

/** Re-map columns for an already-uploaded year and re-apply them to the saved rows. */
export function HistoricalRemapDialog({ open, onOpenChange, year, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: batches, error: bErr } = await supabase
        .from('historical_pl_batches').select('id, column_map').eq('year', year).eq('source', 'upload');
      if (bErr || cancelled) { if (!cancelled) toast.error('Failed to load batch info'); setLoading(false); return; }
      const ids = (batches ?? []).map((b) => b.id);
      const stored: StoredGroup[] = (batches ?? []).flatMap((b) =>
        Array.isArray(b.column_map) ? (b.column_map as unknown as StoredGroup[]) : []);
      setBatchIds(ids);

      const raws: RawRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('historical_pl_rows').select('id, batch_id, raw').in('batch_id', ids).range(from, from + PAGE - 1);
        if (error) { if (!cancelled) toast.error('Failed to load rows'); setLoading(false); return; }
        raws.push(...((data ?? []) as RawRow[]));
        if (!data || data.length < PAGE) break;
      }
      if (cancelled) return;

      const byKey = new Map<string, Group>();
      for (const r of raws) {
        const headers = Object.keys(r.raw ?? {});
        const k = hKey(headers);
        if (!byKey.has(k)) byKey.set(k, { key: k, headers, rowIds: [], raws: [] });
        const g = byKey.get(k)!;
        g.rowIds.push(r.id);
        g.raws.push(r);
      }
      const gs = [...byKey.values()];
      const init: Record<string, Mapping> = {};
      for (const g of gs) {
        // prefer the stored map whose values all exist in these headers, with the most mapped fields
        const candidates = stored
          .filter((s) => s.map && Object.values(s.map).every((v) => !v || g.headers.includes(v)))
          .sort((a, b) => Object.values(b.map!).filter(Boolean).length - Object.values(a.map!).filter(Boolean).length);
        const base = candidates[0]?.map;
        init[g.key] = base ? { ...guessMapping(g.headers), ...(base as Mapping) } : guessMapping(g.headers);
      }
      setGroups(gs);
      setMappings(init);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [open, year]);

  const totalRows = useMemo(() => groups.reduce((a, g) => a + g.rowIds.length, 0), [groups]);
  const allMapped = groups.every((g) => mappings[g.key]?.contractor_name);

  const apply = async () => {
    setApplying(true);
    try {
      const updates: Record<string, unknown>[] = [];
      for (const g of groups) {
        const mp = mappings[g.key];
        if (!mp) continue;
        for (const r of g.raws) {
          const raw = r.raw ?? {};
          const row: Record<string, unknown> = { id: r.id, batch_id: r.batch_id, raw: r.raw };
          for (const f of FIELDS) {
            const h = mp[f.key];
            const v = h ? raw[h] : null;
            row[f.key] = f.numeric ? toNum(v) : (h ? String(v ?? '').trim() || null : null);
          }
          updates.push(row);
        }
      }
      for (let i = 0; i < updates.length; i += 500) {
        const { error } = await supabase.from('historical_pl_rows').upsert(updates.slice(i, i + 500) as any);
        if (error) throw error;
      }
      const newMap = groups.map((g) => ({ headers: g.headers, map: mappings[g.key] }));
      for (const id of batchIds) {
        const { error } = await supabase.from('historical_pl_batches').update({ column_map: newMap as any, updated_at: new Date().toISOString() }).eq('id', id).eq('source', 'upload');
        if (error) throw error;
      }
      toast.success(`Mapping applied to ${updates.length.toLocaleString()} rows`);
      onApplied();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Failed to apply mapping: ${(e as Error).message}`);
    } finally { setApplying(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!applying) onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit column mapping — {year}</DialogTitle>
          <DialogDescription>
            Change which spreadsheet column feeds each field. Applying re-reads every saved row with the new mapping.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              {totalRows.toLocaleString()} rows · {groups.length} column layout{groups.length === 1 ? '' : 's'}
            </div>
            {groups.map((g, gi) => {
              const mp = mappings[g.key] ?? guessMapping(g.headers);
              return (
                <div key={g.key} className={cn('min-w-0 rounded-md border p-3 space-y-3', !mp.contractor_name && 'border-amber-400')}>
                  {groups.length > 1 && (
                    <div className="text-xs">
                      <b>Layout {gi + 1}</b> · {g.rowIds.length.toLocaleString()} rows
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0 [&_[role=combobox]]:w-full [&_[role=combobox]]:min-w-0">
                    {FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1 min-w-0">
                        <label className="text-xs font-medium">{f.label}{f.key === 'contractor_name' && ' *'}</label>
                        <Select value={mp[f.key] || NONE}
                          onValueChange={(v) => setMappings({ ...mappings, [g.key]: { ...mp, [f.key]: v === NONE ? '' : v } })}>
                          <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
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
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>Cancel</Button>
          <Button onClick={apply} disabled={loading || !allMapped || totalRows === 0 || applying}>
            {applying ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Applying…</> : `Apply to ${totalRows.toLocaleString()} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
