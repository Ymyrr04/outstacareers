import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogOut } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';

interface ContractorInfo {
  contractor_assignment_id: string;
  job_title: string | null;
  company_name: string | null;
  full_name: string | null;
  hourly_rate: number | null;
}

interface Timesheet {
  id: string;
  week_ending_date: string;
  total_hours: number;
  overtime_hours: number;
  notes: string | null;
  status: string;
  submitted_at: string;
}

// Compute most recent Sunday (week-ending day) for the default value
const getDefaultWeekEnding = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 0 : -day; // last Sunday or today if Sunday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
};

const PortalDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<ContractorInfo | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);

  const [weekEnding, setWeekEnding] = useState(getDefaultWeekEnding());
  const [totalHours, setTotalHours] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [notes, setNotes] = useState('');

  const loadAll = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      navigate('/portal/login');
      return;
    }

    const { data: portal } = await supabase
      .from('contractor_portal_users')
      .select('contractor_assignment_id, must_change_password')
      .eq('user_id', session.session.user.id)
      .maybeSingle();

    if (!portal) {
      await supabase.auth.signOut();
      navigate('/portal/login');
      return;
    }
    if (portal.must_change_password) {
      navigate('/portal/change-password');
      return;
    }

    const { data: assignment } = await supabase
      .from('contractor_assignments')
      .select('id, job_title, hourly_rate, applicant:applicants_prescreen(full_name), client:clients(company_name)')
      .eq('id', portal.contractor_assignment_id)
      .maybeSingle();

    setInfo({
      contractor_assignment_id: portal.contractor_assignment_id,
      job_title: assignment?.job_title || null,
      company_name: (assignment?.client as any)?.company_name || null,
      full_name: (assignment?.applicant as any)?.full_name || null,
      hourly_rate: assignment?.hourly_rate || null,
    });

    const { data: ts } = await supabase
      .from('contractor_timesheets')
      .select('id, week_ending_date, total_hours, overtime_hours, notes, status, submitted_at')
      .eq('contractor_assignment_id', portal.contractor_assignment_id)
      .order('week_ending_date', { ascending: false });

    setTimesheets((ts as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/portal/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info) return;
    const total = parseFloat(totalHours);
    const ot = parseFloat(overtimeHours || '0');
    if (isNaN(total) || total < 0 || total > 168) {
      toast({ title: 'Invalid hours', description: 'Total hours must be between 0 and 168.', variant: 'destructive' });
      return;
    }
    if (isNaN(ot) || ot < 0 || ot > total) {
      toast({ title: 'Invalid overtime', description: 'Overtime cannot exceed total hours.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('contractor_timesheets').upsert({
        contractor_assignment_id: info.contractor_assignment_id,
        week_ending_date: weekEnding,
        total_hours: total,
        overtime_hours: ot,
        notes: notes.trim() || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'contractor_assignment_id,week_ending_date' });
      if (error) throw error;
      toast({ title: 'Timesheet submitted' });
      setTotalHours('');
      setOvertimeHours('0');
      setNotes('');
      loadAll();
    } catch (err: any) {
      toast({ title: 'Submission failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet><title>My Timesheets | OutSta PL Portal</title></Helmet>
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">OutSta PL Portal</h1>
            <p className="text-xs text-muted-foreground">{info?.full_name} · {info?.company_name} · {info?.job_title}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Submit Weekly Hours</CardTitle>
            <CardDescription>Submitting again for the same week-ending date will update your previous entry.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="week">Week ending (Sunday)</Label>
                <Input id="week" type="date" required value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Total hours</Label>
                <Input id="total" type="number" step="0.25" min="0" max="168" required value={totalHours} onChange={(e) => setTotalHours(e.target.value)} placeholder="e.g. 40" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ot">Overtime hours</Label>
                <Input id="ot" type="number" step="0.25" min="0" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Holidays, leave, special tasks, etc." />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Submit
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Submission history</CardTitle></CardHeader>
          <CardContent className="p-0">
            {timesheets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No submissions yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week ending</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{format(new Date(t.week_ending_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right font-medium">{Number(t.total_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{Number(t.overtime_hours).toFixed(2)}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{t.notes || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(t.submitted_at), 'MMM d, h:mm a')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PortalDashboard;
