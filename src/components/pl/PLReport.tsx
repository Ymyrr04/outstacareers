import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, Settings, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { parseDateOnly } from '@/lib/dateOnly';
import { computePlWeek, mondayOf, ymd, type PlAssignment, type PlTimesheet, type PlWeekRow } from '@/lib/plWeek';

// ============ Config: fee constants (persisted in pl_fee_settings table) ============
const DEFAULT_EXPENSE_FEE_PCT = 1;
const DEFAULT_INCOME_FEE_PCT = 3;

const defaultFees = () => ({ expensePct: DEFAULT_EXPENSE_FEE_PCT, incomePct: DEFAULT_INCOME_FEE_PCT });

const WEEK_STORAGE_KEY = 'pl_report_selected_week';

const getLastCompletedMonday = () => {
  const m = mondayOf(new Date());
  m.setDate(m.getDate() - 7);
  return m;
};

const fmt$ = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Assignment = PlAssignment;
type Timesheet = PlTimesheet;

type StatusKey = 'good' | 'overtime' | 'undertime' | 'sick' | 'not_submitted' | 'terminated';

interface Row extends PlWeekRow {
  status: StatusKey;
  weeksSinceStart: number | null;
  isNewStarter: boolean;
}

const STATUS_META: Record<StatusKey, { label: string; cls: string }> = {
  good: { label: 'Good', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  overtime: { label: 'Overtime', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  undertime: { label: 'Undertime', cls: 'bg-red-100 text-red-700 border-red-300' },
  sick: { label: 'Sick Leave', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  not_submitted: { label: 'Not Submitted', cls: 'bg-red-100 text-red-700 border-red-300' },
  terminated: { label: 'Terminated', cls: 'bg-gray-200 text-gray-700 border-gray-300' },
};

// ============ Inline editable cell ============
export interface EditableCellProps {
  value: number | string | null;
  display: string;
  onSave: (v: number | string | null) => Promise<void>;
  allowText?: boolean;
}

export const EditableCell = ({ value, display, onSave, allowText = false }: EditableCellProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const start = () => {
    setDraft(value == null ? '' : String(value));
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const commit = async () => {
    const trimmed = draft.trim();
    const numeric = trimmed !== '' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed);
    const parsed = trimmed === '' ? null : numeric ? Number(trimmed) : trimmed;
    if ((!allowText && typeof parsed === 'string') || (typeof parsed === 'number' && !Number.isFinite(parsed))) {
      toast({ title: 'Enter a valid number (or leave blank)', variant: 'destructive' });
      return;
    }
    if (typeof parsed === 'string' && parsed.length > 100) {
      toast({ title: 'Text must be 100 characters or less', variant: 'destructive' });
      return;
    }
    if (parsed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={start}
        title="Click to edit"
        className="w-full h-auto min-h-7 justify-end text-right px-1 whitespace-normal cursor-text"
      >
        {display || <span className="text-muted-foreground">—</span>}
      </Button>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        autoFocus
        type={allowText ? 'text' : 'number'}
        step={allowText ? undefined : 'any'}
        min={allowText ? undefined : '0'}
        maxLength={allowText ? 100 : undefined}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        onBlur={commit}
        className={allowText ? 'h-7 w-36 text-right text-sm px-1' : 'h-7 w-24 text-right text-sm px-1'}
      />
      {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
    </div>
  );
};

export const PLReport = () => {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const [weekMonday, setWeekMonday] = useState<Date>(() => {
    try {
      const stored = localStorage.getItem(WEEK_STORAGE_KEY);
      if (stored) {
        const d = new Date(stored);
        if (!isNaN(d.getTime())) return mondayOf(d);
      }
    } catch {}
    return getLastCompletedMonday();
  });
  useEffect(() => {
    try { localStorage.setItem(WEEK_STORAGE_KEY, ymd(weekMonday)); } catch {}
  }, [weekMonday]);

  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [baseRows, setBaseRows] = useState<PlWeekRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [fees, setFees] = useState(defaultFees);
  const [feesDialogOpen, setFeesDialogOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('pl_fee_settings')
        .select('expense_pct, income_pct')
        .eq('singleton', true)
        .maybeSingle();
      if (!error && data) {
        setFees({ expensePct: Number(data.expense_pct), incomePct: Number(data.income_pct) });
      }
    })();
  }, []);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusKey>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const weekEnding = useMemo(() => {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekMonday]);
  const weekEndingStr = ymd(weekEnding);
  const weekMondayStr = ymd(weekMonday);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setBaseRows(await computePlWeek(weekMondayStr, fees, { includeInternal: false }));
      } catch (e: any) {
        console.error(e);
        toast({ title: 'Failed to load P&L report', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [weekMondayStr, fees, reloadKey, toast]);

  const tsMap = useMemo(() => {
    const m = new Map<string, Timesheet>();
    baseRows.forEach((r) => { if (r.timesheet) m.set(r.assignment.id, r.timesheet); });
    return m;
  }, [baseRows]);

  const computeStatus = (a: Assignment, ts: Timesheet | null, actualHours: number): StatusKey => {
    if (a.status === 'terminated') return 'terminated';
    if (!ts) return 'not_submitted';
    const notes = (ts.notes || '').toLowerCase();
    if (notes.includes('sick')) return 'sick';
    // Standard hours on the assignment are the source of truth
    const hpw = Number(a.hours_per_week || 0);
    if (hpw > 0 && actualHours > hpw) return 'overtime';
    if (hpw > 0 && actualHours < hpw) return 'undertime';
    if (hpw <= 0 && Number(ts.overtime_hours || 0) > 0) return 'overtime';
    return 'good';
  };

  const rows: Row[] = useMemo(() => {
    return baseRows.map((r) => {
      const a = r.assignment;
      // Weeks since start
      let weeksSinceStart: number | null = null;
      let isNewStarter = false;
      if (a.start_date) {
        const start = parseDateOnly(a.start_date);
        if (!isNaN(start.getTime())) {
          const diff = Math.floor((weekEnding.getTime() - mondayOf(start).getTime()) / (7 * 86400000));
          weeksSinceStart = diff + 1;
          isNewStarter = start >= weekMonday && start <= weekEnding;
        }
      }

      const autoStatus = computeStatus(a, r.timesheet, r.actualHours);
      const status = statusOverrides[a.id] || autoStatus;

      return { ...r, status, weeksSinceStart, isNewStarter };
    });
  }, [baseRows, weekMonday, weekEnding, statusOverrides]);

  const clientOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.assignment.client?.company_name) s.add(r.assignment.client.company_name); });
    return Array.from(s).sort();
  }, [rows]);

  const sortValue = (r: Row, key: string): string | number => {
    switch (key) {
      case 'contractor': return r.assignment.applicant?.full_name || '—';
      case 'client': return r.assignment.client?.company_name || '—';
      case 'contractor_rate': return r.hourlyRate;
      case 'client_rate': return r.clientRate;
      case 'expenses': return r.expenses;
      case 'expense_after': return r.expenseAfter;
      case 'income': return r.income;
      case 'income_after': return r.incomeAfter;
      case 'gross_profit': return r.grossProfit;
      case 'gross_after': return r.grossAfter;
      case 'client_deposit': return r.clientDeposit ?? -1;
      case 'contractor_deposit': return r.contractorDeposit ?? -1;
      case 'standard_hours': return r.standardHours;
      case 'actual_hours': return r.actualHours;
      case 'tenure': return r.weeksSinceStart ?? 999;
      case 'status': return STATUS_META[r.status].label;
      default: return 0;
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const name = (r.assignment.applicant?.full_name || '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (clientFilter !== 'all' && r.assignment.client?.company_name !== clientFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => {
      if (sortKey) {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const ca = (a.assignment.client?.company_name || '').toLowerCase();
      const cb = (b.assignment.client?.company_name || '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.assignment.applicant?.full_name || '').localeCompare(b.assignment.applicant?.full_name || '');
    });
  }, [rows, search, clientFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else setSortKey(null);
  };

  const mainRows = filteredRows.filter((r) => !r.isNewStarter);
  const newStarters = filteredRows.filter((r) => r.isNewStarter);

  const totals = useMemo(() => {
    const sum = (k: keyof Row) => filteredRows.reduce((s, r) => s + (Number(r[k] as number) || 0), 0);
    return {
      expenses: sum('expenses'),
      expenseAfter: sum('expenseAfter'),
      income: sum('income'),
      incomeAfter: sum('incomeAfter'),
      grossProfit: sum('grossProfit'),
      grossAfter: sum('grossAfter'),
      actualHours: sum('actualHours'),
      total: filteredRows.length,
      submitted: filteredRows.filter((r) => r.timesheet).length,
      notSubmitted: filteredRows.filter((r) => !r.timesheet && r.assignment.status !== 'terminated').length,
      terminated: filteredRows.filter((r) => r.assignment.status === 'terminated').length,
    };
  }, [filteredRows]);

  const saveFees = async (expensePct: number, incomePct: number) => {
    const { error } = await supabase
      .from('pl_fee_settings')
      .update({ expense_pct: expensePct, income_pct: incomePct, updated_at: new Date().toISOString() })
      .eq('singleton', true);
    if (error) {
      toast({ title: 'Failed to save fee settings', description: error.message, variant: 'destructive' });
      return;
    }
    setFees({ expensePct, incomePct });
    setFeesDialogOpen(false);
    toast({ title: 'Fee settings saved' });
  };

  // ============ Inline edit save handlers ============
  const saveAssignmentField = async (
    assignmentId: string,
    field: 'hourly_rate' | 'client_rate' | 'pl_standard_hours',
    value: number | null,
  ) => {
    const { error } = await supabase
      .from('contractor_assignments')
      .update({ [field]: value } as any)
      .eq('id', assignmentId);
    if (error) throw error;
    setReloadKey((k) => k + 1);
    toast({ title: 'Saved' });
  };

  const saveDeposit = async (assignmentId: string, field: 'client_deposit' | 'contractor_deposit', value: number | string | null) => {
    const textField = field === 'client_deposit' ? 'client_deposit_text' : 'contractor_deposit_text';
    const text = typeof value === 'string' ? value.trim() : null;
    if (text && text.length > 100) throw new Error('Text must be 100 characters or less');
    const numeric = typeof value === 'number' ? value : null;
    const { error } = await supabase.from('contractor_assignments')
      .update({ [field]: numeric, [textField]: text })
      .eq('id', assignmentId);
    if (error) throw error;
    setReloadKey((k) => k + 1);
    toast({ title: 'Saved' });
  };

  const saveActualHours = async (assignmentId: string, value: number | null) => {
    const ts = tsMap.get(assignmentId);
    if (!ts) throw new Error('No timesheet submitted for this week — hours can only be edited once one exists.');
    // P&L-only override: the contractor's submitted total_hours stays untouched.
    const { error } = await supabase
      .from('contractor_timesheets')
      .update({ pl_actual_hours: value } as any)
      .eq('id', ts.id);
    if (error) throw error;
    setReloadKey((k) => k + 1);
    toast({ title: 'Saved' });
  };

  const exportCSV = () => {
    const headers = [
      '#', 'Contractor', 'Client/Company', 'Contractor Rate', 'Client Rate',
      'Expenses', `Expense After ${fees.expensePct}%`, 'Income', `Income After ${fees.incomePct}%`,
      'Gross Profit', 'Gross After Deductions', 'Client Deposit', 'Contractor Deposit',
      'Standard Hours', 'Actual Hours', 'Tenure', 'Status',
    ];
    const rowToCsv = (r: Row, idx: number) => [
      idx + 1,
      `"${(r.assignment.applicant?.full_name || '').replace(/"/g, '""')}"`,
      `"${(r.assignment.client?.company_name || '').replace(/"/g, '""')}"`,
      r.hourlyRate.toFixed(2), r.clientRate.toFixed(2),
      r.expenses.toFixed(2), r.expenseAfter.toFixed(2),
      r.income.toFixed(2), r.incomeAfter.toFixed(2),
      r.grossProfit.toFixed(2), r.grossAfter.toFixed(2),
       typeof r.clientDeposit === 'number' ? r.clientDeposit.toFixed(2) : `"${(r.clientDeposit || '').replace(/"/g, '""')}"`,
       typeof r.contractorDeposit === 'number' ? r.contractorDeposit.toFixed(2) : `"${(r.contractorDeposit || '').replace(/"/g, '""')}"`,
      r.standardHours, r.actualHours,
      r.weeksSinceStart && r.weeksSinceStart >= 1 && r.weeksSinceStart <= 4 ? `Week ${r.weeksSinceStart}` : '',
      STATUS_META[r.status].label,
    ].join(',');
    const lines: string[] = [headers.join(',')];
    mainRows.forEach((r, i) => lines.push(rowToCsv(r, i)));
    if (newStarters.length) {
      lines.push('');
      lines.push('NEW STARTERS THIS WEEK');
      newStarters.forEach((r, i) => lines.push(rowToCsv(r, i)));
    }
    lines.push('');
    lines.push([
      'TOTAL', '', '', '', '',
      totals.expenses.toFixed(2), totals.expenseAfter.toFixed(2),
      totals.income.toFixed(2), totals.incomeAfter.toFixed(2),
      totals.grossProfit.toFixed(2), totals.grossAfter.toFixed(2),
      '', '', '', totals.actualHours, '', '',
    ].join(','));
    lines.push(`Summary,"${totals.total} total — ${totals.submitted} submitted / ${totals.notSubmitted} not submitted / ${totals.terminated} terminated"`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PL_Report_${weekEndingStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderRow = (r: Row, idx: number) => (
    <TableRow key={r.assignment.id}>
      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
      <TableCell className="font-medium whitespace-nowrap">{r.assignment.applicant?.full_name || '—'}</TableCell>
      <TableCell className="whitespace-nowrap">{r.assignment.client?.company_name || '—'}</TableCell>
      <TableCell className="text-right">
        <EditableCell value={r.hourlyRate} display={fmt$(r.hourlyRate)} onSave={(v) => { if (typeof v === 'string') throw new Error('Enter a valid number'); return saveAssignmentField(r.assignment.id, 'hourly_rate', v); }} />
      </TableCell>
      <TableCell className="text-right">
        <EditableCell value={r.clientRate} display={fmt$(r.clientRate)} onSave={(v) => { if (typeof v === 'string') throw new Error('Enter a valid number'); return saveAssignmentField(r.assignment.id, 'client_rate', v); }} />
      </TableCell>
      <TableCell className="text-right">{fmt$(r.expenses)}</TableCell>
      <TableCell className="text-right">{fmt$(r.expenseAfter)}</TableCell>
      <TableCell className="text-right">{fmt$(r.income)}</TableCell>
      <TableCell className="text-right">{fmt$(r.incomeAfter)}</TableCell>
      <TableCell className="text-right font-medium">{fmt$(r.grossProfit)}</TableCell>
      <TableCell className="text-right font-medium">{fmt$(r.grossAfter)}</TableCell>
      <TableCell className="text-right">
         <EditableCell allowText value={r.clientDeposit} display={r.clientDeposit == null ? '' : typeof r.clientDeposit === 'number' ? fmt$(r.clientDeposit) : r.clientDeposit} onSave={(v) => saveDeposit(r.assignment.id, 'client_deposit', v)} />
      </TableCell>
      <TableCell className="text-right">
         <EditableCell allowText value={r.contractorDeposit} display={r.contractorDeposit == null ? '' : typeof r.contractorDeposit === 'number' ? fmt$(r.contractorDeposit) : r.contractorDeposit} onSave={(v) => saveDeposit(r.assignment.id, 'contractor_deposit', v)} />
      </TableCell>
      <TableCell className="text-right">
        <EditableCell value={r.standardHours} display={String(r.standardHours || 0)} onSave={(v) => { if (typeof v === 'string') throw new Error('Enter a valid number'); return saveAssignmentField(r.assignment.id, 'pl_standard_hours', v); }} />
      </TableCell>
      <TableCell className="text-right">
        {r.timesheet ? (
          <EditableCell value={r.actualHours} display={String(r.actualHours || 0)} onSave={(v) => { if (typeof v === 'string') throw new Error('Enter a valid number'); return saveActualHours(r.assignment.id, v); }} />
        ) : (
          r.actualHours || 0
        )}
      </TableCell>
      <TableCell>
        {r.weeksSinceStart && r.weeksSinceStart >= 1 && r.weeksSinceStart <= 4 ? (
          <Badge variant="secondary" className="text-[10px]">Week {r.weeksSinceStart}</Badge>
        ) : ''}
      </TableCell>
      <TableCell>
        <Select
          value={r.status}
          onValueChange={(v) => setStatusOverrides((prev) => ({ ...prev, [r.assignment.id]: v as StatusKey }))}
        >
          <SelectTrigger className={`h-7 w-[140px] border ${STATUS_META[r.status].cls}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_META) as StatusKey[]).map((k) => (
              <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      {/* Header: week selector + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const prev = new Date(weekMonday); prev.setDate(prev.getDate() - 7); setWeekMonday(prev);
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[280px]">
                {`${format(weekMonday, 'EEE MMM d')} – ${format(weekEnding, 'EEE MMM d, yyyy')}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="flex gap-1 mb-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setWeekMonday(getLastCompletedMonday()); setWeekPickerOpen(false); }}>
                  Last week
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setWeekMonday(mondayOf(new Date())); setWeekPickerOpen(false); }}>
                  Current week
                </Button>
              </div>
              <Calendar
                mode="single"
                selected={weekMonday}
                onSelect={(d) => { if (d) { setWeekMonday(mondayOf(d)); setWeekPickerOpen(false); } }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const next = new Date(weekMonday); next.setDate(next.getDate() + 7); setWeekMonday(next);
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button variant="outline" size="icon" onClick={() => setFeesDialogOpen(true)} title="Fee settings">
              <Settings className="w-4 h-4" />
            </Button>
          )}
          <Button variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search contractor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_META) as StatusKey[]).map((k) => (
              <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                {([
                  ['contractor', 'Contractor', false],
                  ['client', 'Client/Company', false],
                  ['contractor_rate', 'Contractor Rate', true],
                  ['client_rate', 'Client Rate', true],
                  ['expenses', 'Expenses', true],
                  ['expense_after', `Expense After ${fees.expensePct}%`, true],
                  ['income', 'Income', true],
                  ['income_after', `Income After ${fees.incomePct}%`, true],
                  ['gross_profit', 'Gross Profit', true],
                  ['gross_after', 'Gross After Deductions', true],
                  ['client_deposit', 'Client Deposit', true],
                  ['contractor_deposit', 'Contractor Deposit', true],
                  ['standard_hours', 'Standard Hrs', true],
                  ['actual_hours', 'Actual Hrs', true],
                  ['tenure', 'Tenure', false],
                  ['status', 'Status', false],
                ] as [string, string, boolean][]).map(([key, label, right]) => (
                  <TableHead key={key} className={right ? 'text-right' : undefined}>
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === key ? 'text-foreground' : ''}`}
                      title="Sort"
                    >
                      {label}
                      {sortKey === key
                        ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                        : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mainRows.length === 0 && newStarters.length === 0 && (
                <TableRow><TableCell colSpan={17} className="text-center text-muted-foreground py-8">No contractors match the current filters.</TableCell></TableRow>
              )}
              {mainRows.map((r, i) => renderRow(r, i))}
              {newStarters.length > 0 && (
                <>
                  <TableRow className="bg-emerald-50 hover:bg-emerald-50">
                    <TableCell colSpan={17} className="font-semibold text-emerald-800 text-xs uppercase tracking-wide">
                      New Starters This Week
                    </TableCell>
                  </TableRow>
                  {newStarters.map((r, i) => renderRow(r, i))}
                </>
              )}
              {filteredRows.length > 0 && (
                <TableRow className="bg-muted/50 font-semibold border-t-2">
                  <TableCell colSpan={5}>TOTAL</TableCell>
                  <TableCell className="text-right">{fmt$(totals.expenses)}</TableCell>
                  <TableCell className="text-right">{fmt$(totals.expenseAfter)}</TableCell>
                  <TableCell className="text-right">{fmt$(totals.income)}</TableCell>
                  <TableCell className="text-right">{fmt$(totals.incomeAfter)}</TableCell>
                  <TableCell className="text-right">{fmt$(totals.grossProfit)}</TableCell>
                  <TableCell className="text-right">{fmt$(totals.grossAfter)}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">{totals.actualHours}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {totals.total} total contractors — {totals.submitted} submitted / {totals.notSubmitted} not submitted / {totals.terminated} terminated
        {' · '}Total hours logged: {totals.actualHours}
      </div>

      {/* Fee settings dialog */}
      <Dialog open={feesDialogOpen} onOpenChange={setFeesDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fee settings</DialogTitle>
          </DialogHeader>
          <FeesForm fees={fees} onSave={saveFees} onCancel={() => setFeesDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

const FeesForm = ({
  fees, onSave, onCancel,
}: { fees: { expensePct: number; incomePct: number }; onSave: (e: number, i: number) => void; onCancel: () => void }) => {
  const [exp, setExp] = useState(String(fees.expensePct));
  const [inc, setInc] = useState(String(fees.incomePct));
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="exp">Expense fee %</Label>
        <Input id="exp" type="number" step="0.01" value={exp} onChange={(e) => setExp(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="inc">Income fee %</Label>
        <Input id="inc" type="number" step="0.01" value={inc} onChange={(e) => setInc(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(Number(exp) || 0, Number(inc) || 0)}>Save</Button>
      </DialogFooter>
    </div>
  );
};
