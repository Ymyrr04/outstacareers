import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Search, Check, X } from 'lucide-react';
import { format } from 'date-fns';

interface TimesheetRow {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  incentive_amount: number;
  notes: string | null;
  status: string;
  submitted_at: string;
  daily_hours: Record<string, { hours: number; reason?: string }> | null;
  contractor: {
    job_title: string | null;
    applicant: { full_name: string; email: string } | null;
    client: { company_name: string } | null;
  } | null;
}

interface ContractorRow {
  id: string;
  job_title: string | null;
  status: string;
  hourly_rate: number | null;
  hours_per_week: number | null;
  applicant: { full_name: string; email: string } | null;
  client: { company_name: string } | null;
  hasPortal: boolean;
  mustChange: boolean | null;
}

export const PLDashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [contractors, setContractors] = useState<ContractorRow[]>([]);
  const [search, setSearch] = useState('');
  const [contractorSearch, setContractorSearch] = useState('');
  const [stats, setStats] = useState({ portalUsers: 0, totalEligibleContractors: 0 });

  const fetchData = async () => {
    setLoading(true);

    const [{ data: timesheets }, { data: assignments }, { data: portalUsers }] = await Promise.all([
      supabase
        .from('contractor_timesheets')
        .select(`
          id, contractor_assignment_id, week_ending_date, total_hours, overtime_hours, incentive_amount, notes, status, submitted_at, daily_hours,
          contractor:contractor_assignments(
            job_title,
            applicant:applicants_prescreen(full_name, email),
            client:clients(company_name)
          )
        `)
        .order('week_ending_date', { ascending: false })
        .order('submitted_at', { ascending: false }),
      supabase
        .from('contractor_assignments')
        .select(`
          id, job_title, status, hourly_rate, hours_per_week,
          applicant:applicants_prescreen(full_name, email),
          client:clients(company_name)
        `)
        .in('status', ['active', 'rendering'])
        .order('status', { ascending: true }),
      supabase
        .from('contractor_portal_users')
        .select('contractor_assignment_id, must_change_password'),
    ]);

    const portalMap = new Map<string, boolean>(
      (portalUsers || []).map((p: any) => [p.contractor_assignment_id, p.must_change_password])
    );

    const enriched: ContractorRow[] = ((assignments as any[]) || []).map((c) => ({
      id: c.id,
      job_title: c.job_title,
      status: c.status,
      hourly_rate: c.hourly_rate,
      hours_per_week: c.hours_per_week,
      applicant: c.applicant,
      client: c.client,
      hasPortal: portalMap.has(c.id),
      mustChange: portalMap.get(c.id) ?? null,
    }));

    // Sort: by full name
    enriched.sort((a, b) => (a.applicant?.full_name || '').localeCompare(b.applicant?.full_name || ''));

    setRows((timesheets as any) || []);
    setContractors(enriched);
    setStats({
      portalUsers: enriched.filter((c) => c.hasPortal).length,
      totalEligibleContractors: enriched.length,
    });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const callProvision = async (payload?: Record<string, unknown>) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`Unable to read admin session: ${sessionError.message}`);
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active admin session. Please sign in as admin and try again.');

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-contractor-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload ?? {}),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const detail = data?.error || data?.message || (typeof data === 'string' ? data : `HTTP ${res.status}`);
      throw new Error(detail);
    }
    return data;
  };

  const handleProvision = async () => {
    if (!confirm(`Create login accounts for all active & rendering contractors who don't have one yet?\n\nDefault password: OutSta2026!\n\nNo emails will be sent — share the password manually for testing.`)) return;
    setProvisioning(true);
    try {
      const data = await callProvision();
      toast({
        title: 'Provisioning complete',
        description: `Created ${data.created}, linked ${data.linked}, skipped ${data.skipped}. ${data.errors?.length ? `${data.errors.length} errors — see console.` : ''}`,
      });
      if (data.errors?.length) console.error('Provision errors:', data.errors);
      fetchData();
    } catch (e: any) {
      toast({ title: 'Provisioning failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  const handleProvisionOne = async (c: ContractorRow) => {
    if (!c.applicant?.email) {
      toast({ title: 'No email', description: 'This contractor has no email on file.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Create a portal account for ${c.applicant.full_name}?\n\nEmail: ${c.applicant.email}\nDefault password: OutSta2026!\n\nNo email will be sent — share the password manually.`)) return;
    setProvisioningId(c.id);
    try {
      const data = await callProvision({ contractorAssignmentId: c.id });
      if (data.errors?.length) {
        toast({ title: 'Failed', description: data.errors[0], variant: 'destructive' });
      } else if (data.total === 0) {
        toast({ title: 'Nothing to do', description: 'Contractor not found or not eligible (must be active/rendering with an email).', variant: 'destructive' });
      } else if (data.created === 0 && data.linked === 0) {
        toast({ title: 'Already provisioned', description: `${c.applicant.email} already has a portal account.` });
      } else {
        toast({
          title: 'Account ready',
          description: `${data.created ? 'Created new account' : 'Linked existing user'} for ${c.applicant.email}`,
        });
      }
      fetchData();
    } catch (e: any) {
      toast({ title: 'Provisioning failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setProvisioningId(null);
    }
  };

  const handleDecision = async (r: TimesheetRow, decision: 'approved' | 'rejected') => {
    const overDays = r.daily_hours
      ? Object.entries(r.daily_hours).filter(([, v]) => Number(v?.hours) > 10).map(([k]) => k)
      : [];
    const summary = overDays.length ? `\n\nDays >10 hrs: ${overDays.join(', ')}` : '';
    if (!confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} timesheet for ${r.contractor?.applicant?.full_name} (week ending ${format(new Date(r.week_ending_date), 'MMM d, yyyy')})?${summary}`)) return;
    const { error } = await supabase
      .from('contractor_timesheets')
      .update({ status: decision })
      .eq('id', r.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Timesheet ${decision}` });
    fetchData();
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.contractor?.applicant?.full_name?.toLowerCase().includes(q) ||
      r.contractor?.applicant?.email?.toLowerCase().includes(q) ||
      r.contractor?.client?.company_name?.toLowerCase().includes(q)
    );
  });

  const filteredContractors = contractors.filter((c) => {
    if (!contractorSearch) return true;
    const q = contractorSearch.toLowerCase();
    return (
      c.applicant?.full_name?.toLowerCase().includes(q) ||
      c.applicant?.email?.toLowerCase().includes(q) ||
      c.client?.company_name?.toLowerCase().includes(q) ||
      c.job_title?.toLowerCase().includes(q)
    );
  });

  const totalHoursAll = filtered.reduce((s, r) => s + Number(r.total_hours), 0);
  const totalOTAll = filtered.reduce((s, r) => s + Number(r.overtime_hours), 0);
  const totalIncentivesAll = filtered.reduce((s, r) => s + Number(r.incentive_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Portal Accounts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.portalUsers} <span className="text-sm text-muted-foreground font-normal">/ {stats.totalEligibleContractors} eligible</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Submissions</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{filtered.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Hours</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalHoursAll.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overtime Hours</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalOTAll.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Incentives</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totalIncentivesAll.toFixed(2)}</p></CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Badge variant="outline" className="text-xs">Portal: <code className="ml-1">/portal/login</code> · Default password: <code className="ml-1">OutSta2026!</code></Badge>
        <Button onClick={handleProvision} disabled={provisioning}>
          {provisioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
          Provision Accounts
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Contractors ({filteredContractors.length})</CardTitle>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search contractor, company, role..." value={contractorSearch} onChange={(e) => setContractorSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : filteredContractors.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No active or rendering contractors found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Hrs/Wk</TableHead>
                  <TableHead>Portal Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContractors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.applicant?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.applicant?.email || '—'}</div>
                    </TableCell>
                    <TableCell>{c.client?.company_name || '—'}</TableCell>
                    <TableCell className="text-sm">{c.job_title || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.hourly_rate != null ? `$${Number(c.hourly_rate).toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="text-right">{c.hours_per_week ?? '—'}</TableCell>
                    <TableCell>
                      {!c.hasPortal ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-muted-foreground">No account</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={provisioningId === c.id || !c.applicant?.email}
                            onClick={() => handleProvisionOne(c)}
                          >
                            {provisioningId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserPlus className="w-3 h-3 mr-1" />Create</>}
                          </Button>
                        </div>
                      ) : c.mustChange ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-600">Pending password change</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500 text-emerald-600">Active</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Timesheet Submissions</CardTitle>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search submissions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No timesheet submissions yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Week Ending</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">Incentives</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Daily &gt;10h</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const overDays = r.daily_hours
                    ? Object.entries(r.daily_hours).filter(([, v]) => Number((v as any)?.hours) > 10)
                    : [];
                  return (
                    <TableRow key={r.id} className={r.status === 'pending_approval' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                      <TableCell>
                        <div className="font-medium">{r.contractor?.applicant?.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.contractor?.applicant?.email}</div>
                      </TableCell>
                      <TableCell>{r.contractor?.client?.company_name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.contractor?.job_title || '—'}</TableCell>
                      <TableCell>{format(new Date(r.week_ending_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-medium">{Number(r.total_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{Number(r.overtime_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(r.incentive_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {r.status === 'pending_approval' ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">Pending approval</Badge>
                        ) : r.status === 'approved' ? (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-600">Approved</Badge>
                        ) : r.status === 'rejected' ? (
                          <Badge variant="outline" className="border-destructive text-destructive">Rejected</Badge>
                        ) : (
                          <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {overDays.length === 0 ? '—' : (
                          <div className="space-y-0.5">
                            {overDays.map(([k, v]) => (
                              <div key={k}>
                                <span className="font-medium capitalize">{k}</span>: {Number((v as any).hours)}h
                                {(v as any).reason && <span className="text-muted-foreground"> — {(v as any).reason}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{r.notes || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(r.submitted_at), 'MMM d, h:mm a')}</TableCell>
                      <TableCell className="text-right">
                        {r.status === 'pending_approval' ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => handleDecision(r, 'approved')}>
                              <Check className="w-3 h-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleDecision(r, 'rejected')}>
                              <X className="w-3 h-3 mr-1" />Reject
                            </Button>
                          </div>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
