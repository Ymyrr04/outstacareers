import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileCheck, FileText, MessageSquarePlus, Check, Plus } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { cn } from '@/lib/utils';
import { CoeGenerateDialog } from './CoeGenerateDialog';
import { PdcGenerateDialog } from './PdcGenerateDialog';
import { NewLegalDocForm } from './NewLegalDocForm';

const extractNoteField = (notes: string | null, label: string): string => {
  if (!notes) return '';
  const re = new RegExp(`${label}:\\s*(.+?)(?=\\s+[A-Z][a-z]+ [A-Z]?[a-z]*:|$)`, 's');
  return notes.match(re)?.[1]?.trim() || '';
};

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'] as const;
type StatusFilter = 'All' | (typeof STATUS_OPTIONS)[number];
const FILTER_TABS: StatusFilter[] = ['All', 'Pending', 'In Progress', 'Completed'];

interface LegalDocRow {
  id: string;
  doc_types: string[];
  reason: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  contractor_name: string;
  company_name: string;
  job_title: string;
  start_date: string;
  hours_per_week: number | null;
  hourly_rate: number | null;
  assignment_notes: string | null;
}

interface StagedDoc {
  docType: string;
  filename: string;
  bytes: Uint8Array;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export const LegalDocRequestsDialog: React.FC<Props> = ({ open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<LegalDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('Pending');
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [coeRow, setCoeRow] = useState<LegalDocRow | null>(null);
  const [pdcRow, setPdcRow] = useState<LegalDocRow | null>(null);
  const [stagedDocs, setStagedDocs] = useState<Record<string, StagedDoc[]>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const stageDoc = (requestId: string, doc: StagedDoc) => {
    setStagedDocs((prev) => {
      const list = (prev[requestId] || []).filter((d) => d.docType !== doc.docType);
      return { ...prev, [requestId]: [...list, doc] };
    });
    toast({ title: `${doc.docType} ready to send`, description: 'Click the Send button on the request to email it.' });
  };

  const sendStaged = async (row: LegalDocRow) => {
    const docs = stagedDocs[row.id] || [];
    if (!docs.length) return;
    setSendingId(row.id);
    try {
      const documents = docs.map((d) => {
        let binary = '';
        d.bytes.forEach((b) => { binary += String.fromCharCode(b); });
        return { filename: d.filename, base64: btoa(binary) };
      });

      const { error } = await supabase.functions.invoke('notify-timesheet-event', {
        body: { event: 'legal_doc_completed', legalDocRequestId: row.id, documents },
      });
      if (error) throw error;

      const stamp = `Sent: ${docs.map((d) => d.docType).join(', ')} — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      const prevNote = (row.admin_notes || '').trim();
      const admin_notes = prevNote ? `${prevNote}\n${stamp}` : stamp;
      await supabase
        .from('contractor_legal_doc_requests' as any)
        .update({ status: 'Completed', admin_notes })
        .eq('id', row.id);

      setStagedDocs((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'Completed', admin_notes } : r)));
      toast({ title: `${docs.length} document${docs.length === 1 ? '' : 's'} sent to ${row.contractor_name}` });
      onChanged?.();
    } catch (err) {
      console.error('Sending legal documents failed', err);
      toast({ title: 'Error', description: 'Could not send the documents.', variant: 'destructive' });
    } finally {
      setSendingId(null);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && Object.values(stagedDocs).some((d) => d.length > 0)) {
      if (!window.confirm('You have unsent documents. Close anyway?')) return;
      setStagedDocs({});
    }
    onOpenChange(nextOpen);
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contractor_legal_doc_requests' as any)
      .select(`
        id, doc_types, reason, status, admin_notes, created_at,
        contractor_assignments (
          job_title, start_date, hours_per_week, hourly_rate, notes,
          applicants_prescreen ( full_name ),
          clients ( company_name )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching legal doc requests:', error);
      toast({ title: 'Error', description: 'Could not load legal document requests.', variant: 'destructive' });
    } else {
      setRows(((data || []) as any[]).map((r) => ({
        id: r.id,
        doc_types: r.doc_types || [],
        reason: r.reason || '',
        status: r.status || 'Pending',
        admin_notes: r.admin_notes,
        created_at: r.created_at,
        contractor_name: r.contractor_assignments?.applicants_prescreen?.full_name || 'Unknown contractor',
        company_name: r.contractor_assignments?.clients?.company_name || '',
        job_title: r.contractor_assignments?.job_title || '',
        start_date: r.contractor_assignments?.start_date || '',
        hours_per_week: r.contractor_assignments?.hours_per_week ?? null,
        hourly_rate: r.contractor_assignments?.hourly_rate ?? null,
        assignment_notes: r.contractor_assignments?.notes || null,
      })));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  const updateStatus = async (row: LegalDocRow, status: string) => {
    const { error } = await supabase
      .from('contractor_legal_doc_requests' as any)
      .update({ status })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    toast({ title: 'Status updated', description: `${row.contractor_name}'s request is now ${status}.` });
    onChanged?.();
  };

  const saveNote = async (row: LegalDocRow) => {
    const note = (noteDrafts[row.id] ?? '').trim();
    setSavingNote(row.id);
    const { error } = await supabase
      .from('contractor_legal_doc_requests' as any)
      .update({ admin_notes: note || null })
      .eq('id', row.id);
    setSavingNote(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, admin_notes: note || null } : r)));
    toast({ title: 'Note saved' });
  };

  const toggleNote = (row: LegalDocRow) => {
    setNoteOpen((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
    if (!(row.id in noteDrafts)) {
      setNoteDrafts((prev) => ({ ...prev, [row.id]: row.admin_notes || '' }));
    }
  };

  const visible = filter === 'All' ? rows : rows.filter((r) => r.status === filter);

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileCheck className="w-5 h-5" />
            Legal Document Requests
            <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => setShowNew((v) => !v)}>
              <Plus className="w-3 h-3 mr-1" />
              New document
            </Button>
          </DialogTitle>
        </DialogHeader>

        {showNew && (
          <NewLegalDocForm
            onCancel={() => setShowNew(false)}
            onCreated={() => { setShowNew(false); setFilter('In Progress'); fetchRows(); onChanged?.(); }}
          />
        )}

        <div className="flex gap-1 border-b pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-colors',
                filter === tab
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No requests in this status.</p>
          ) : (
            <div className="divide-y">
              {visible.map((row) => (
                <div key={row.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{row.contractor_name}</p>
                      {row.company_name && (
                        <p className="text-[10px] text-muted-foreground">{row.company_name}</p>
                      )}
                    </div>
                    <Select value={row.status} onValueChange={(v) => updateStatus(row, v)}>
                      <SelectTrigger className="w-[130px] h-8 text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.doc_types.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1">
                        <span
                          className="inline-flex items-center rounded-[20px] px-2.5 py-[3px] text-[11px]"
                          style={{ background: '#E0F7FC', color: '#066F85' }}
                        >
                          {t}
                        </span>
                        {(stagedDocs[row.id] || []).some((d) => d.docType === t) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                            <Check className="w-3 h-3" />
                            Ready
                          </span>
                        )}
                      </span>
                    ))}
                  </div>

                  {(stagedDocs[row.id]?.length ?? 0) > 0 && (
                    <Button
                      size="sm"
                      className="h-8 text-xs w-full"
                      disabled={sendingId === row.id}
                      onClick={() => sendStaged(row)}
                    >
                      {sendingId === row.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Send {stagedDocs[row.id].length} document{stagedDocs[row.id].length === 1 ? '' : 's'}
                    </Button>
                  )}

                  {row.reason && row.reason !== 'Created by admin' && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{row.reason}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Requested {formatDate(row.created_at)}
                    </span>
                    {row.doc_types.includes('COE') && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCoeRow(row)}>
                        <FileText className="w-3 h-3 mr-1" />
                        {(stagedDocs[row.id] || []).some((d) => d.docType === 'COE') ? 'Regenerate COE' : 'Generate COE'}
                      </Button>
                    )}
                    {row.doc_types.includes('Pay Deposit Certificate') && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPdcRow(row)}>
                        <FileText className="w-3 h-3 mr-1" />
                        {(stagedDocs[row.id] || []).some((d) => d.docType === 'Pay Deposit Certificate') ? 'Regenerate PDC' : 'Generate PDC'}
                      </Button>
                    )}
                    <button
                      onClick={() => toggleNote(row)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MessageSquarePlus className="w-3 h-3" />
                      {row.admin_notes ? 'Edit note' : 'Add note'}
                    </button>
                  </div>

                  {noteOpen[row.id] ? (
                    <div className="space-y-2">
                      <Textarea
                        value={noteDrafts[row.id] ?? ''}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="Internal note about this request..."
                        rows={2}
                        className="text-xs"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setNoteOpen((prev) => ({ ...prev, [row.id]: false }))}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={savingNote === row.id}
                          onClick={() => saveNote(row)}
                        >
                          {savingNote === row.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          Save note
                        </Button>
                      </div>
                    </div>
                  ) : row.admin_notes ? (
                    <p className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                      {row.admin_notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {coeRow && (
      <CoeGenerateDialog
        open={!!coeRow}
        onOpenChange={(o) => { if (!o) setCoeRow(null); }}
        legalDocRequestId={coeRow.id}
        contractorName={coeRow.contractor_name}
        onApprove={(doc) => stageDoc(coeRow.id, doc)}
        data={{
          fullName:
            extractNoteField(coeRow.assignment_notes, 'Preferred Name') ||
            extractNoteField(coeRow.assignment_notes, 'Full Name') ||
            (coeRow.contractor_name === 'Unknown contractor' ? '' : coeRow.contractor_name),
          role: coeRow.job_title,
          startDate: coeRow.start_date,
          hoursPerWeek: coeRow.hours_per_week,
          hourlyRate: coeRow.hourly_rate,
          companyName: coeRow.company_name,
        }}
      />
    )}
    {pdcRow && (
      <PdcGenerateDialog
        open={!!pdcRow}
        onOpenChange={(o) => { if (!o) setPdcRow(null); }}
        legalDocRequestId={pdcRow.id}
        contractorName={pdcRow.contractor_name}
        onApprove={(doc) => stageDoc(pdcRow.id, doc)}
        data={{
          fullName:
            extractNoteField(pdcRow.assignment_notes, 'Preferred Name') ||
            extractNoteField(pdcRow.assignment_notes, 'Full Name') ||
            (pdcRow.contractor_name === 'Unknown contractor' ? '' : pdcRow.contractor_name),
          hoursPerWeek: pdcRow.hours_per_week,
          hourlyRate: pdcRow.hourly_rate,
        }}
      />
    )}
    </>
  );
};
