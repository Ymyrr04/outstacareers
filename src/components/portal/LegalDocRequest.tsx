import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';

const DOC_TYPES = ['COE', 'Copy of contract', 'Pay Deposit Certificate'] as const;

interface LegalDocRow {
  id: string;
  doc_types: string[];
  reason: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

interface Props {
  contractorAssignmentId: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'Completed': return 'default' as const;
    case 'In Progress': return 'secondary' as const;
    default: return 'outline' as const;
  }
};

export const LegalDocRequest: React.FC<Props> = ({ contractorAssignmentId }) => {
  const { toast } = useToast();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<LegalDocRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contractor_legal_doc_requests' as any)
      .select('id, doc_types, reason, status, admin_notes, created_at')
      .eq('contractor_assignment_id', contractorAssignmentId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching legal doc requests:', error);
    } else {
      setHistory((data || []) as unknown as LegalDocRow[]);
    }
    setLoading(false);
  }, [contractorAssignmentId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const toggleType = (type: string, checked: boolean) => {
    setSelectedTypes(prev => checked ? [...prev, type] : prev.filter(t => t !== type));
  };

  const handleSubmit = async () => {
    if (selectedTypes.length === 0) {
      toast({ title: 'Select a document', description: 'Please check at least one document type.', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Reason required', description: 'Please state the reason for your request.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { data: inserted, error } = await supabase
      .from('contractor_legal_doc_requests' as any)
      .insert({
        contractor_assignment_id: contractorAssignmentId,
        doc_types: selectedTypes,
        reason: reason.trim(),
      })
      .select('id')
      .single();

    if (error) {
      setSubmitting(false);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    const requestId = (inserted as any)?.id;
    if (requestId) {
      supabase.functions.invoke('notify-timesheet-event', {
        body: { event: 'legal_doc_submitted', legalDocRequestId: requestId },
      }).catch((e) => console.error('Legal doc notification failed:', e));
    }

    setSubmitting(false);
    setSelectedTypes([]);
    setReason('');
    toast({ title: 'Request submitted', description: 'Your document request has been sent to the team.' });
    fetchHistory();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request a Legal Document</CardTitle>
          <CardDescription>Select the document(s) you need and tell us why you need them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Document type</Label>
            <div className="space-y-2">
              {DOC_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedTypes.includes(type)}
                    onCheckedChange={(c) => toggleType(type, c === true)}
                  />
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  {type}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="legal-doc-reason">Reason for the request</Label>
            <Textarea
              id="legal-doc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Required for a bank loan application..."
              rows={3}
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No document requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(row.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{row.doc_types.join(', ')}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2 text-sm">{row.reason}</span>
                    </TableCell>
                    <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
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
