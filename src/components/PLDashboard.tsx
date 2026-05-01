import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Search } from 'lucide-react';
import { format } from 'date-fns';

interface TimesheetRow {
  id: string;
  contractor_assignment_id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  notes: string | null;
  status: string;
  submitted_at: string;
  contractor: {
    job_title: string | null;
    applicant: { full_name: string; email: string } | null;
    client: { company_name: string } | null;
  } | null;
}

export const PLDashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ portalUsers: 0, totalActiveContractors: 0 });

  const fetchData = async () => {
    setLoading(true);
    const { data: timesheets } = await supabase
      .from('contractor_timesheets')
      .select(`
        id, contractor_assignment_id, week_ending_date, total_hours, overtime_hours, notes, status, submitted_at,
        contractor:contractor_assignments(
          job_title,
          applicant:applicants_prescreen(full_name, email),
          client:clients(company_name)
        )
      `)
      .order('week_ending_date', { ascending: false })
      .order('submitted_at', { ascending: false });

    const [{ count: portalCount }, { count: activeCount }] = await Promise.all([
      supabase.from('contractor_portal_users').select('*', { count: 'exact', head: true }),
      supabase.from('contractor_assignments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

    setRows((timesheets as any) || []);
    setStats({ portalUsers: portalCount || 0, totalActiveContractors: activeCount || 0 });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleProvision = async () => {
    if (!confirm(`Create login accounts for all active contractors who don't have one yet?\n\nDefault password: OutSta2026!\n\nNo emails will be sent — share the password manually for testing.`)) return;
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-contractor-accounts');
      if (error) throw error;
      toast({
        title: 'Provisioning complete',
        description: `Created ${data.created}, linked ${data.linked}, skipped ${data.skipped}. ${data.errors?.length ? `${data.errors.length} errors.` : ''}`,
      });
      if (data.errors?.length) console.error('Provision errors:', data.errors);
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
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

  const totalHoursAll = filtered.reduce((s, r) => s + Number(r.total_hours), 0);
  const totalOTAll = filtered.reduce((s, r) => s + Number(r.overtime_hours), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Portal Accounts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.portalUsers} <span className="text-sm text-muted-foreground font-normal">/ {stats.totalActiveContractors} active</span></p></CardContent>
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
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search contractor or company..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Portal: <code className="ml-1">/portal/login</code></Badge>
          <Button onClick={handleProvision} disabled={provisioning}>
            {provisioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Provision Accounts
          </Button>
        </div>
      </div>

      <Card>
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
                  <TableHead>Notes</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.contractor?.applicant?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.contractor?.applicant?.email}</div>
                    </TableCell>
                    <TableCell>{r.contractor?.client?.company_name || '—'}</TableCell>
                    <TableCell className="text-sm">{r.contractor?.job_title || '—'}</TableCell>
                    <TableCell>{format(new Date(r.week_ending_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right font-medium">{Number(r.total_hours).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(r.overtime_hours).toFixed(2)}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{r.notes || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.submitted_at), 'MMM d, h:mm a')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
