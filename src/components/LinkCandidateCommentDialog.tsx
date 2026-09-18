import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ACTIVE_STAGES = ['sourcing', 'pitch', 'scheduled_interview'] as const;

const STAGE_BADGE_STYLES: Record<string, string> = {
  sourcing: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  pitch: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  scheduled_interview: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
};

const STAGE_LABELS: Record<string, string> = {
  sourcing: 'Sourcing',
  pitch: 'Pitch',
  scheduled_interview: 'Scheduled Interview',
};

interface HiringRequestRow {
  id: string;
  job_title: string;
  pipeline_stage: string;
  clients: { company_name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  applicantName: string;
}

export function LinkCandidateCommentDialog({ open, onOpenChange, applicantId, applicantName }: Props) {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<HiringRequestRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: reqs, error } = await supabase
      .from('client_hiring_requests')
      .select('id, job_title, pipeline_stage, clients(company_name)')
      .in('pipeline_stage', [...ACTIVE_STAGES])
      .order('job_title', { ascending: true });
    if (error) {
      console.error('Error loading hiring requests:', error);
      toast.error('Failed to load hiring requests');
    }
    setRequests((reqs as unknown as HiringRequestRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedId(null);
      setNote('');
      load();
    }
  }, [open, load]);

  const submit = async () => {
    if (!selectedId || submitting) return;
    const request = requests.find((r) => r.id === selectedId);
    if (!request) return;
    const clientName = request.clients?.company_name || 'client';

    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('Not signed in');

      const trimmed = note.trim();
      const { error } = await supabase.from('hiring_request_comments').insert({
        request_id: request.id,
        user_id: userId,
        content: trimmed || `Linked ${applicantName}`,
        linked_applicant_id: applicantId,
      });
      if (error) throw error;

      toast.success(`Linked to ${clientName}`);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error linking candidate:', err);
      toast.error(err?.message || 'Failed to link candidate');
    } finally {
      setSubmitting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? requests.filter((r) =>
        r.job_title.toLowerCase().includes(q) ||
        (r.clients?.company_name || '').toLowerCase().includes(q)
      )
    : requests;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4" />
            Link {applicantName} to a client request
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or job title..."
            className="pl-9"
          />
        </div>

        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading hiring requests...</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {requests.length === 0 ? 'No active hiring requests to link to' : 'No requests match your search'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((r) => {
                const selected = selectedId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(selected ? null : r.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.clients?.company_name || 'Unknown client'}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.job_title}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] shrink-0', STAGE_BADGE_STYLES[r.pipeline_stage])}
                    >
                      {STAGE_LABELS[r.pipeline_stage] || r.pipeline_stage}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          className="min-h-[72px] resize-none"
        />

        <Button
          onClick={submit}
          disabled={!selectedId || submitting}
          className="w-full"
        >
          {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Link &amp; comment
        </Button>
      </DialogContent>
    </Dialog>
  );
}
