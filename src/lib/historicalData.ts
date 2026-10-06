// Historical P&L data helpers: the row shape, the per-year cache, the fetch that
// fills it, and the row-level rules the report, sync and remap dialogs share.
import { supabase } from '@/integrations/supabase/client';
import { HEADCOUNT_EXCLUDED_NAMES } from '@/lib/internalCompany';

export interface HistRow {
  id: string;
  week_label: string | null;
  week_start: string | null;
  contractor_name: string | null;
  company: string | null;
  hours: number | null;
  actual_hours: number | null;
  contractor_rate: number | null;
  client_rate: number | null;
  contractor_cost: number | null;
  client_billing: number | null;
  margin: number | null;
  expense_after_1_percent: number | null;
  income_after_3_percent: number | null;
  gross_after_deductions: number | null;
  client_deposit: number | null;
  contractor_deposit: number | null;
  raw: Record<string, unknown> | null;
}

export const ROW_COLS = 'id, week_label, week_start, contractor_name, company, hours, actual_hours, contractor_rate, client_rate, contractor_cost, expense_after_1_percent, client_billing, income_after_3_percent, margin, gross_after_deductions, client_deposit, contractor_deposit, raw';

export const num = (n: number | null | undefined) => Number(n ?? 0);

// ---- Per-year cache (memory + localStorage), invalidated when batches or their mapping change ----
export interface CacheEntry { sig: string; ids: string[]; uploadIds?: string[]; syncIds?: string[]; rows: HistRow[] }
const memCache = new Map<number, CacheEntry>();
export const CACHE_KEY = (y: number) => `hist-pl-cache-v10-${y}`;
export function readCache(y: number): CacheEntry | null {
  if (memCache.has(y)) return memCache.get(y)!;
  try {
    const s = localStorage.getItem(CACHE_KEY(y));
    if (!s) return null;
    const e = JSON.parse(s) as CacheEntry;
    memCache.set(y, e);
    return e;
  } catch { return null; }
}
export function writeCache(y: number, e: CacheEntry) {
  memCache.set(y, e);
  try { localStorage.setItem(CACHE_KEY(y), JSON.stringify(e)); } catch { /* storage full — memory only */ }
}
export function signature(batches: { id: string; created_at: string; updated_at?: string; source?: string; column_map: unknown }[]) {
  const str = [...batches].sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => `${b.id}|${b.created_at}|${b.updated_at ?? ''}|${b.source ?? ''}|${JSON.stringify(b.column_map ?? null)}`).join('#');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return `${batches.length}:${h}`;
}

// OutSta is the internal team — excluded from all historical calculations,
// matching the P&L report (which filters by the internal client id).
export const isInternalRow = (r: HistRow) =>
  (r.company ?? '').replace(/[\s.]/g, '').toLowerCase().startsWith('outsta');

// Markup rate = client rate − contractor rate (computed, not stored).
export const markupOf = (r: HistRow): number | null =>
  r.client_rate != null && r.contractor_rate != null ? Number(r.client_rate) - Number(r.contractor_rate) : null;

// A row that stands for a counted external contractor: it has a name, is not
// internal, is not flagged out of the headcount, and is not a bonus-only row.
export const isContractorRow = (r: HistRow): boolean => {
  const raw = r.raw as any;
  return !!(r.contractor_name || '').trim() &&
    !isInternalRow(r) &&
    !raw?.__exclude_headcount &&
    raw?.kind !== 'bonus';
};

// Hours a row contributes: the submitted actual hours when present, otherwise
// the sheet's hours column.
export const rowHours = (r: HistRow): number => Number(r.actual_hours ?? r.hours ?? 0);

// Headcount for a set of rows: distinct lowercase trimmed contractor names,
// skipping internal rows, rows flagged raw.__exclude_headcount, blank names and
// the names kept out of headcounts (they keep their money).
export function weekHeadcount(rows: HistRow[]): number {
  return new Set(
    rows
      .filter((r) => !isInternalRow(r) && !(r.raw && (r.raw as Record<string, unknown>).__exclude_headcount))
      .map((r) => (r.contractor_name || '').trim().toLowerCase())
      .filter((n) => n && !HEADCOUNT_EXCLUDED_NAMES.has(n)),
  ).size;
}

export interface YearData { ids: string[]; uploadIds: string[]; syncIds: string[]; rows: HistRow[] }

// Fetch one year's rows through the existing per-year cache.
export async function fetchYear(y: number): Promise<YearData | null> {
  const cached = readCache(y);
  const { data: batches, error: bErr } = await supabase
    .from('historical_pl_batches').select('id, created_at, updated_at, source, column_map').eq('year', y);
  if (bErr) return cached ? { ids: cached.ids, uploadIds: cached.uploadIds ?? [], syncIds: cached.syncIds ?? [], rows: cached.rows } : null;
  const ids = (batches ?? []).map((b) => b.id);
  const uploadIds = (batches ?? []).filter((b) => b.source === 'upload').map((b) => b.id);
  const syncIds = (batches ?? []).filter((b) => b.source === 'timesheet_sync').map((b) => b.id);
  const sig = signature(batches ?? []);
  if (cached && cached.sig === sig) return { ids, uploadIds, syncIds, rows: cached.rows };
  if (ids.length === 0) { writeCache(y, { sig, ids, uploadIds, syncIds, rows: [] }); return { ids, uploadIds, syncIds, rows: [] }; }

  const all: HistRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('historical_pl_rows')
      .select(ROW_COLS)
      .in('batch_id', ids)
      .order('week_start', { ascending: true, nullsFirst: false })
      .order('contractor_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    all.push(...((data ?? []) as HistRow[]));
    if (!data || data.length < PAGE) break;
  }
  writeCache(y, { sig, ids, uploadIds, syncIds, rows: all });
  return { ids, uploadIds, syncIds, rows: all };
}
