import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { INTERNAL_CLIENT_ID } from '@/lib/internalCompany';
import { formatDate } from "@/lib/dateFormat";

interface LeaveRow {
  id: string;
  contractor_assignment_id: string;
  leave_date: string;
  time_period: string;
  specific_time: string | null;
  leave_type: string;
  leave_type_other: string | null;
  compensation_type: string | null;
  compensation_note: string | null;
  notes: string | null;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  client_informed_approved: boolean;
  created_at: string;
  contractor: {
    job_title: string | null;
    client_id: string | null;
    applicant: { full_name: string; email: string } | null;
    client: { company_name: string } | null;
  } | null;
}

export const AdminLeaveApplications = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reviewing, setReviewing] = useState<LeaveRow | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contractor_leave_applications' as any)
      .select(`
        id, contractor_assignment_id, leave_date, time_period, specific_time,
        leave_type, leave_type_other, compensation_type, compensation_note,
        notes, status, review_notes, reviewed_at, client_informed_approved, created_at,
        contractor:contractor_assignments(
          job_title, client_id,
          applicant:applicants_prescreen(full_name, email),
          client:clients(company_name)
        )
      `)
      .order('leave_date', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load leave applications', description: error.message, variant: 'destructive' });
    }
    setRows(((data as any) || []) as LeaveRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.contractor?.client_id === INTERNAL_CLIENT_ID) return true; // include internal too
      return true;
    }).filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.contractor?.applicant?.full_name?.toLowerCase().includes(q) ||
          r.contractor?.applicant?.email?.toLowerCase().includes(q) ||
          r.contractor?.client?.company_name?.toLowerCase().includes(q) ||
          r.leave_type?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    rows.forEach((r) => {
      if (r.status === 'pending') c.pending++;
      else if (r.status === 'approved') c.approved++;
      else if (r.status === 'rejected') c.rejected++;
    });
    return c;
  }, [rows]);

  const openReview = (r: LeaveRow, action: 'approved' | 'rejected') => {
    setReviewing(r);
    setReviewAction(action);
    setReviewNotes(r.review_notes || '');
  };

  const submitReview = async () => {
    if (!reviewing) return;
    setSaving(true);
    const { error } = await supabase
      .from('contractor_leave_applications' as any)
      .update({
        status: reviewAction,
        review_notes: reviewNotes.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Leave ${reviewAction}` });
    setReviewing(null);
    setReviewNotes('');
    fetchData();
  };

  const statusBadge = (s: string) => {
    if (s === 'approved') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>;
    if (s === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="outline" className="border-amber-500 text-amber-600">Pending</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">Leave Applications ({filtered.length})</CardTitle>
            <Badge variant="outline" className="border-amber-500 text-amber-600">Pending: {counts.pending}</Badge>
            <Badge variant="outline" className="border-emerald-500 text-emerald-600">Approved: {counts.approved}</Badge>
            <Badge variant="outline" className="border-destructive text-destructive">Rejected: {counts.rejected}</Badge>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search contractor, company, type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No leave applications found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Leave Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Compensation</TableHead>
                  <TableHead>Client Approved</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.contractor?.applicant?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.contractor?.applicant?.email || '—'}</div>
                    </TableCell>
                    <TableCell>{r.contractor?.client?.company_name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.leave_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.time_period}
                      {r.specific_time && r.time_period !== 'All day' && (
                        <div className="text-xs text-muted-foreground">{r.specific_time} ET</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm whitespace-normal">
                      {r.leave_type}
                      {r.notes && (
                        <div className="text-xs italic text-muted-foreground mt-1">{r.notes}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {r.compensation_type || '—'}
                      {r.compensation_note && (
                        <div className="text-xs italic text-muted-foreground mt-1 whitespace-normal max-w-[200px]">{r.compensation_note}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.client_informed_approved
                        ? <Badge variant="outline" className="border-emerald-500 text-emerald-600">Yes</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">No</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at ? formatDate(r.created_at) : '—'}
                    </TableCell>
                    <TableCell>
                      {statusBadge(r.status)}
                      {r.review_notes && (
                        <div className="text-xs italic text-muted-foreground mt-1 max-w-[200px] whitespace-normal">{r.review_notes}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === 'pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950" onClick={() => openReview(r, 'approved')}>
                            <Check className="w-3 h-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => openReview(r, 'rejected')}>
                            <X className="w-3 h-3 mr-1" />Reject
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openReview(r, r.status === 'approved' ? 'rejected' : 'approved')}>
                          Change
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o && !saving) { setReviewing(null); setReviewNotes(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approved' ? 'Approve' : 'Reject'} leave application
            </DialogTitle>
            <DialogDescription>
              {reviewing && (
                <span>
                  {reviewing.contractor?.applicant?.full_name} · {formatDate(reviewing.leave_date)} · {reviewing.time_period}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Review notes (optional)</label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Add a note that will be visible to the contractor"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewing(null); setReviewNotes(''); }} disabled={saving}>Cancel</Button>
            <Button onClick={submitReview} disabled={saving} className={reviewAction === 'rejected' ? 'bg-destructive hover:bg-destructive/90' : 'bg-emerald-600 hover:bg-emerald-700'}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm {reviewAction === 'approved' ? 'approval' : 'rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
