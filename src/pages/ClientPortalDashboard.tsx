import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';
import { Loader2, LogOut, ArrowLeft, CheckCircle2, Flag, Search, Eye, Building2 } from 'lucide-react';

interface Assignment {
  id: string;
  job_title: string | null;
  hours_per_week: number | null;
  timezone: string | null;
  start_date: string | null;
  status: string | null;
  sunday_hours_excluded: boolean | null;
  applicant: { full_name: string; email: string } | null;
}


interface Timesheet {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  incentive_amount: number;
  notes: string | null;
  submitted_at: string;
  status: string;
  daily_hours: Record<string, any> | null;
  client_approval_status: string;
  client_reviewed_at: string | null;
  client_flag_reason: string | null;
  locked: boolean;
}

type RowView = Timesheet & {
  contractor_name: string;
  contractor_email: string;
  hours_per_week: number | null;
  timezone: string | null;
  sunday_hours_excluded: boolean;
};


// Convert "HH:MM" (24h) to "h:MM AM/PM"
const to12h = (t?: string | null) => {
  if (!t) return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const mm = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${period}`;
};

const formatTime = (t: string | null | undefined, fmt: '12h' | '24h') => {
  if (!t) return '—';
  return fmt === '12h' ? to12h(t) : t;
};


const statusBadge = (status: string) => {
  if (status === 'approved') return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Approved</Badge>;
  if (status === 'flagged') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Flagged</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
};

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmtHours = (n: number) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(/\.?0+$/, '');
};

const ClientPortalDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<RowView | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/client-portal/login'); return; }
      const uid = session.session.user.id;
      setUserId(uid);
      setUserEmail(session.session.user.email || '');

      const { data: cpu } = await supabase
        .from('client_portal_users')
        .select('must_change_password, client_id, is_first_login')
        .eq('user_id', uid)
        .maybeSingle();

      if (!cpu) {
        await supabase.auth.signOut();
        navigate('/client-portal/login');
        return;
      }
      if ((cpu as any).is_first_login) {
        navigate('/client-portal/setup');
        return;
      }
      if (cpu.must_change_password) {
        navigate('/client-portal/change-password');
        return;
      }

      setClientId(cpu.client_id);
      await loadData(cpu.client_id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (cid: string) => {
    const { data: client } = await supabase
      .from('clients')
      .select('company_name')
      .eq('id', cid)
      .maybeSingle();
    if (client) setClientName(client.company_name);

    // Client portal must NEVER expose any pay or rate fields (hourly_rate, client_rate, invoice_total, incentives).
    const { data: ca, error: caErr } = await supabase
      .from('contractor_assignments')
      .select('id, job_title, hours_per_week, timezone, start_date, status, sunday_hours_excluded, applicant:applicants_prescreen(full_name, email)')
      .eq('client_id', cid);
    if (caErr) console.error(caErr);
    setAssignments((ca || []) as any);


    const ids = (ca || []).map((c: any) => c.id);
    if (ids.length === 0) { setTimesheets([]); return; }

    const { data: ts, error: tsErr } = await supabase
      .from('contractor_timesheets')
      .select('id, contractor_assignment_id, week_ending_date, total_hours, overtime_hours, incentive_amount, notes, submitted_at, status, daily_hours, client_approval_status, client_reviewed_at, client_flag_reason, locked')
      .in('contractor_assignment_id', ids)
      .order('week_ending_date', { ascending: false });
    if (tsErr) console.error(tsErr);
    setTimesheets((ts || []) as any);
  };

  const rows: RowView[] = useMemo(() => {
    const assignmentMap = new Map(assignments.map(a => [a.id, a]));
    return timesheets.map(t => {
      const a = assignmentMap.get(t.contractor_assignment_id);
      return {
        ...t,
        contractor_name: a?.applicant?.full_name || 'Unknown',
        contractor_email: a?.applicant?.email || '',
        hours_per_week: a?.hours_per_week ?? null,
        timezone: (a as any)?.timezone ?? null,
        sunday_hours_excluded: !!(a as any)?.sunday_hours_excluded,
      };
    });
  }, [timesheets, assignments]);


  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.client_approval_status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.contractor_name.toLowerCase().includes(q) && !r.contractor_email.toLowerCase().includes(q)) return false;
      }
      if (dateFrom && r.week_ending_date < dateFrom) return false;
      if (dateTo && r.week_ending_date > dateTo) return false;
      return true;
    });
  }, [rows, statusFilter, search, dateFrom, dateTo]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/client-portal/login');
  };

  const reloadAndUpdateSelected = async () => {
    if (!clientId) return;
    await loadData(clientId);
    if (selected) {
      const updated = rows.find(r => r.id === selected.id);
      if (updated) setSelected(updated);
    }
  };

  const handleApprove = async () => {
    if (!selected || !clientId || !userId) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('contractor_timesheets')
        .update({
          client_approval_status: 'approved',
          client_reviewed_by: userId,
          client_flag_reason: null,
        })
        .eq('id', selected.id);
      if (error) throw error;

      await supabase.from('client_timesheet_review_events').insert({
        timesheet_id: selected.id,
        client_id: clientId,
        reviewer_user_id: userId,
        reviewer_email: userEmail,
        event_type: 'approved',
      });

      toast({ title: 'Timesheet approved', description: `${selected.contractor_name} — week ending ${selected.week_ending_date}` });
      await loadData(clientId);
      setSelected(null);
    } catch (err: any) {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleFlag = async () => {
    if (!selected || !clientId || !userId) return;
    if (!flagReason.trim()) {
      toast({ title: 'Reason required', description: 'Please describe why this timesheet should be reviewed.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('contractor_timesheets')
        .update({
          client_approval_status: 'flagged',
          client_reviewed_by: userId,
          client_flag_reason: flagReason.trim(),
        })
        .eq('id', selected.id);
      if (error) throw error;

      await supabase.from('client_timesheet_review_events').insert({
        timesheet_id: selected.id,
        client_id: clientId,
        reviewer_user_id: userId,
        reviewer_email: userEmail,
        event_type: 'flagged',
        reason: flagReason.trim(),
      });

      toast({ title: 'Flagged for review', description: 'Our team has been notified.' });
      setFlagOpen(false);
      setFlagReason('');
      await loadData(clientId);
      setSelected(null);
    } catch (err: any) {
      toast({ title: 'Failed to flag', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Helmet><title>{clientName ? `${clientName} — OutStaWorkforce` : 'OutStaWorkforce'}</title></Helmet>

      {/* Header */}
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <div className="text-sm font-semibold">{clientName || 'OutStaWorkforce'}</div>

          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {selected ? (
          <TimesheetDetail
            row={selected}
            onBack={() => setSelected(null)}
            onApprove={handleApprove}
            onOpenFlag={() => { setFlagReason(selected.client_flag_reason || ''); setFlagOpen(true); }}
            actionLoading={actionLoading}
          />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold mb-3">Submitted Timesheets</h1>
              <ContractorProfilePanel assignments={assignments} clientName={clientName} />
            </div>
            <Card>
            <CardContent className="space-y-4 pt-6">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Search contractor</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…" className="pl-8" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Week ending from</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Week ending to</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">
                  No timesheets to review.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contractor</TableHead>
                        <TableHead>Week ending</TableHead>
                        <TableHead className="text-right">Total Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map(r => {
                        const sundayHrs = r.sunday_hours_excluded && r.daily_hours
                          ? Object.entries(r.daily_hours).reduce((s, [date, val]: [string, any]) => {
                              const isSunday = new Date(`${date}T00:00:00`).getDay() === 0;
                              return s + (isSunday ? (parseFloat(val?.hours) || 0) : 0);
                            }, 0)
                          : 0;
                        return (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div className="font-medium">{r.contractor_name}</div>
                              <div className="text-xs text-muted-foreground">{r.contractor_email}</div>
                            </TableCell>
                            <TableCell>{format(new Date(r.week_ending_date), 'MMM d, yyyy')}</TableCell>
                            <TableCell className="text-right">
                              <div>{fmtHours((Number(r.total_hours) || 0) + sundayHrs)}</div>
                            </TableCell>

                            <TableCell>{statusBadge(r.client_approval_status)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}

                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Flag dialog */}
      <Dialog open={flagOpen} onOpenChange={(o) => { setFlagOpen(o); if (!o) setFlagReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag timesheet for review</DialogTitle>
            <DialogDescription>
              Tell us what looks off. Our team will investigate and follow up.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="e.g. Hours on Tuesday don't match the work delivered…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button onClick={handleFlag} disabled={actionLoading} className="bg-amber-600 hover:bg-amber-700">
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Submit flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const initialsOf = (name: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
};

const avatarColors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
];
const colorFor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
};

const ContractorProfilePanel = ({ assignments, clientName }: { assignments: Assignment[]; clientName: string }) => {
  if (!assignments || assignments.length === 0) return null;
  // Dedupe by applicant + job_title in case of multiple assignment rows
  const seen = new Set<string>();
  const list = assignments.filter(a => {
    const key = `${a.applicant?.email || a.id}-${a.job_title || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      {list.map((a) => {
        const name = a.applicant?.full_name || 'Unnamed contractor';
        const email = a.applicant?.email || '';
        const isActive = (a.status || 'active').toLowerCase() === 'active';
        return (
          <div key={a.id} className="relative bg-background border rounded-lg shadow-sm p-4">
            <div className="absolute top-3 right-3">
              {isActive ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600">Inactive</Badge>
              )}
            </div>
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${colorFor(name)}`}>
                {initialsOf(name)}
              </div>
              <div className="min-w-0 flex-1 pr-16">
                <div className="font-semibold text-sm truncate">{name}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div><span className="text-muted-foreground">Role:</span> <span className="font-medium">{a.job_title || '—'}</span></div>

              <div>
                {a.start_date ? (
                  <span className="text-muted-foreground">Hired: <span className="font-medium text-foreground">{format(new Date(a.start_date), 'MMM d, yyyy')}</span></span>
                ) : (
                  <span className="italic text-muted-foreground">Hire date not set</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};


const TimesheetDetail = ({
  row, onBack, onApprove, onOpenFlag, actionLoading,
}: {
  row: RowView;
  onBack: () => void;
  onApprove: () => void;
  onOpenFlag: () => void;
  actionLoading: boolean;
}) => {
  const expected = row.hours_per_week ?? 40;
  const dailyEntries = row.daily_hours ? Object.entries(row.daily_hours).sort(([a], [b]) => a.localeCompare(b)) : [];
  const excludeSunday = row.sunday_hours_excluded;
  const sundayHours = excludeSunday
    ? dailyEntries.reduce((s, [date, val]: [string, any]) => {
        const isSunday = new Date(`${date}T00:00:00`).getDay() === 0;
        return s + (isSunday ? (parseFloat(val?.hours) || 0) : 0);
      }, 0)
    : 0;
  const billable = Number(row.total_hours) || 0;
  const totalAll = billable + sundayHours;
  const pct = Math.min(100, Math.round((billable / expected) * 100));



  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to list
        </Button>
        {statusBadge(row.client_approval_status)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {row.contractor_name} <span className="text-muted-foreground font-normal">— week ending {format(new Date(row.week_ending_date), 'MMM d, yyyy')}</span>
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              Times shown in EST (Eastern Standard Time)
            </div>
          </CardHeader>
          <CardContent>
            {dailyEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No daily breakdown provided.</div>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time in</TableHead>
                      <TableHead>Time out</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyEntries.map(([date, val]: [string, any]) => (
                      <TableRow key={date}>
                        <TableCell>
                          <div className="font-medium">{format(new Date(date), 'EEEE')}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(date), 'MMM d, yyyy')}</div>
                        </TableCell>
                        <TableCell className="text-sm">{val?.time_in ? `${to12h(val.time_in)} EST` : '—'}</TableCell>
                        <TableCell className="text-sm">{val?.time_out ? `${to12h(val.time_out)} EST` : '—'}</TableCell>
                        <TableCell className="text-right">{fmtHours(val?.hours || 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{val?.reason || ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {(() => {
              // Strip any payoneer links (contractor payment info) before showing notes to client
              const cleaned = (row.notes || '')
                .split(/\r?\n/)
                .map(line => line.replace(/\bhttps?:\/\/\S*payoneer\S*/gi, '').trim())
                .filter(line => line.length > 0)
                .join('\n')
                .trim();
              if (!cleaned) return null;
              return (
                <div className="mt-4 p-3 bg-muted/40 rounded-md">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Contractor notes</div>
                  <div className="text-sm whitespace-pre-wrap">{cleaned}</div>
                </div>
              );
            })()}

            {row.client_flag_reason && row.client_approval_status === 'flagged' && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="text-xs font-medium text-amber-700 mb-1">Flag reason</div>
                <div className="text-sm whitespace-pre-wrap text-amber-900">{row.client_flag_reason}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Week summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hours logged</span>
                <span className="font-medium">{fmtHours(totalAll)} / {expected}</span>
              </div>
              <Progress value={pct} className="mt-2" />
            </div>


            <div className="space-y-2 pt-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={actionLoading || row.client_approval_status === 'approved'}
                onClick={onApprove}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {row.client_approval_status === 'approved' ? 'Already approved' : 'Approve'}
              </Button>
              <Button
                variant="outline"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={actionLoading}
                onClick={onOpenFlag}
              >
                <Flag className="w-4 h-4 mr-1" /> Flag for review
              </Button>
              {row.client_reviewed_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Last reviewed {format(new Date(row.client_reviewed_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientPortalDashboard;
