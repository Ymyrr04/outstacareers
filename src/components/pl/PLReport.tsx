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
import { ChevronLeft, ChevronRight, Download, Loader2, Search, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { INTERNAL_CLIENT_ID } from '@/lib/internalCompany';
import clientRateFallbackData from '@/data/clientRateFallback.json';
import { parseDateOnly } from '@/lib/dateOnly';

const clientRateFallback = clientRateFallbackData as Record<string, number>;
const normalizeName = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
const lookupFallbackClientRate = (name: string | null | undefined): number => {
  if (!name) return 0;
  return clientRateFallback[normalizeName(name)] ?? 0;
};

// ============ Config: fee constants (persisted in localStorage) ============
const FEE_STORAGE_KEY = 'pl_report_fee_settings';
const DEFAULT_EXPENSE_FEE_PCT = 1;
const DEFAULT_INCOME_FEE_PCT = 3;

const loadFees = () => {
  try {
    const raw = localStorage.getItem(FEE_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        expensePct: Number(p.expensePct ?? DEFAULT_EXPENSE_FEE_PCT),
        incomePct: Number(p.incomePct ?? DEFAULT_INCOME_FEE_PCT),
      };
    }
  } catch {}
  return { expensePct: DEFAULT_EXPENSE_FEE_PCT, incomePct: DEFAULT_INCOME_FEE_PCT };
};

const WEEK_STORAGE_KEY = 'pl_report_selected_week';

const mondayOf = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
};
const getLastCompletedMonday = () => {
  const m = mondayOf(new Date());
  m.setDate(m.getDate() - 7);
  return m;
};
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

const fmt$ = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Assignment {
  id: string;
  applicant_id: string | null;
  client_id: string | null;
  status: string;
  hourly_rate: number | null;
  client_rate: number | null;
  hours_per_week: number | null;
  start_date: string | null;
  end_date: string | null;
  sunday_hours_excluded: boolean | null;
  applicant: { full_name: string | null } | null;
  client: { company_name: string | null } | null;
}

interface Timesheet {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  notes: string | null;
  daily_hours: Record<string, { hours?: number; reason?: string }> | null;
}

type StatusKey = 'good' | 'overtime' | 'undertime' | 'sick' | 'not_submitted' | 'terminated';

interface Row {
  assignment: Assignment;
  timesheet: Timesheet | null;
  actualHours: number;
  overtime: number;
  standardHours: number;
  hourlyRate: number;
  clientRate: number;
  expenses: number;
  expenseAfter: number;
  income: number;
  incomeAfter: number;
  grossProfit: number;
  grossAfter: number;
  clientDeposit: number;
  contractorDeposit: number;
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [fees, setFees] = useState(loadFees);
  const [feesDialogOpen, setFeesDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusKey>>({});

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
        // Active OR terminated whose end_date >= week start
        const { data: aData, error: aErr } = await supabase
          .from('contractor_assignments')
          .select(`id, applicant_id, client_id, status, hourly_rate, client_rate, hours_per_week, start_date, end_date, sunday_hours_excluded,
                   applicant:applicants_prescreen(full_name),
                   client:clients(company_name)`)
          .or(`status.eq.active,and(status.eq.terminated,end_date.gte.${weekMondayStr})`);
        if (aErr) throw aErr;

        const active = (aData as any as Assignment[]) || [];
        const ids = active.map((a) => a.id);
        let tsRows: Timesheet[] = [];
        if (ids.length) {
          const { data: tData, error: tErr } = await supabase
            .from('contractor_timesheets')
            .select('id, contractor_assignment_id, week_ending_date, total_hours, overtime_hours, notes, daily_hours')
            .in('contractor_assignment_id', ids)
            .gte('week_ending_date', weekMondayStr)
            .lte('week_ending_date', weekEndingStr);
          if (tErr) throw tErr;
          tsRows = (tData as any as Timesheet[]) || [];
        }
        setAssignments(active);
        setTimesheets(tsRows);
      } catch (e: any) {
        console.error(e);
        toast({ title: 'Failed to load P&L report', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [weekMondayStr, weekEndingStr, toast]);

  const tsMap = useMemo(() => {
    const m = new Map<string, Timesheet>();
    timesheets.forEach((t) => m.set(t.contractor_assignment_id, t));
    return m;
  }, [timesheets]);

  const computeStatus = (a: Assignment, ts: Timesheet | null, actualHours: number): StatusKey => {
    if (a.status === 'terminated') return 'terminated';
    if (!ts) return 'not_submitted';
    const notes = (ts.notes || '').toLowerCase();
    if (notes.includes('sick')) return 'sick';
    const hpw = Number(a.hours_per_week || 0);
    if (Number(ts.overtime_hours || 0) > 0) return 'overtime';
    if (hpw > 0 && actualHours < hpw) return 'undertime';
    return 'good';
  };

  const expMul = 1 + fees.expensePct / 100;
  const incMul = 1 - fees.incomePct / 100;

  const rows: Row[] = useMemo(() => {
    return assignments
      .filter((a) => a.client_id !== INTERNAL_CLIENT_ID)
      .map((a) => {
        const ts = tsMap.get(a.id) || null;
        let actualHours = Number(ts?.total_hours || 0);
        // Sunday exclusion
        if (ts && a.sunday_hours_excluded && ts.daily_hours) {
          try {
            const dh = ts.daily_hours as Record<string, { hours?: number }>;
            let sunHours = 0;
            Object.entries(dh).forEach(([date, v]) => {
              const d = new Date(date);
              if (!isNaN(d.getTime()) && d.getDay() === 0) sunHours += Number(v?.hours || 0);
            });
            actualHours = Math.max(0, actualHours - sunHours);
          } catch {}
        }
        const hourlyRate = Number(a.hourly_rate || 0);
        const clientRate = Number(a.client_rate || 0) || lookupFallbackClientRate(a.applicant?.full_name);
        const standardHours = Number(a.hours_per_week || 0);
        const overtime = Number(ts?.overtime_hours || 0);
        const hasHours = actualHours > 0;

        const expenses = hasHours ? hourlyRate * actualHours : 0;
        const income = hasHours ? clientRate * actualHours : 0;
        const expenseAfter = hasHours ? expenses * expMul : 0;
        const incomeAfter = hasHours ? income * incMul : 0;
        const grossProfit = hasHours ? income - expenses : 0;
        const grossAfter = hasHours ? incomeAfter - expenseAfter : 0;

        const clientDeposit = clientRate * standardHours;
        const contractorDeposit = hourlyRate * standardHours;

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

        const autoStatus = computeStatus(a, ts, actualHours);
        const status = statusOverrides[a.id] || autoStatus;

        return {
          assignment: a,
          timesheet: ts,
          actualHours,
          overtime,
          standardHours,
          hourlyRate,
          clientRate,
          expenses,
          expenseAfter,
          income,
          incomeAfter,
          grossProfit,
          grossAfter,
          clientDeposit,
          contractorDeposit,
          status,
          weeksSinceStart,
          isNewStarter,
        };
      });
  }, [assignments, tsMap, expMul, incMul, weekMonday, weekEnding, statusOverrides]);

  const clientOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.assignment.client?.company_name) s.add(r.assignment.client.company_name); });
    return Array.from(s).sort();
  }, [rows]);

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
      const ca = (a.assignment.client?.company_name || '').toLowerCase();
      const cb = (b.assignment.client?.company_name || '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.assignment.applicant?.full_name || '').localeCompare(b.assignment.applicant?.full_name || '');
    });
  }, [rows, search, clientFilter, statusFilter]);

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

  const saveFees = (expensePct: number, incomePct: number) => {
    const next = { expensePct, incomePct };
    setFees(next);
    try { localStorage.setItem(FEE_STORAGE_KEY, JSON.stringify(next)); } catch {}
    setFeesDialogOpen(false);
    toast({ title: 'Fee settings saved' });
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
      r.clientDeposit.toFixed(2), r.contractorDeposit.toFixed(2),
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
      <TableCell className="text-right">{fmt$(r.hourlyRate)}</TableCell>
      <TableCell className="text-right">{fmt$(r.clientRate)}</TableCell>
      <TableCell className="text-right">{fmt$(r.expenses)}</TableCell>
      <TableCell className="text-right">{fmt$(r.expenseAfter)}</TableCell>
      <TableCell className="text-right">{fmt$(r.income)}</TableCell>
      <TableCell className="text-right">{fmt$(r.incomeAfter)}</TableCell>
      <TableCell className="text-right font-medium">{fmt$(r.grossProfit)}</TableCell>
      <TableCell className="text-right font-medium">{fmt$(r.grossAfter)}</TableCell>
      <TableCell className="text-right">{fmt$(r.clientDeposit)}</TableCell>
      <TableCell className="text-right">{fmt$(r.contractorDeposit)}</TableCell>
      <TableCell className="text-right">{r.standardHours || 0}</TableCell>
      <TableCell className="text-right">{r.actualHours || 0}</TableCell>
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
                <TableHead>Contractor</TableHead>
                <TableHead>Client/Company</TableHead>
                <TableHead className="text-right">Contractor Rate</TableHead>
                <TableHead className="text-right">Client Rate</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Expense After {fees.expensePct}%</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Income After {fees.incomePct}%</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Gross After Deductions</TableHead>
                <TableHead className="text-right">Client Deposit</TableHead>
                <TableHead className="text-right">Contractor Deposit</TableHead>
                <TableHead className="text-right">Standard Hrs</TableHead>
                <TableHead className="text-right">Actual Hrs</TableHead>
                <TableHead>Tenure</TableHead>
                <TableHead>Status</TableHead>
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
