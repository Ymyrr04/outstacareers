import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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

export function LinkToClientPipelineDialog({ open, onOpenChange, applicantId, applicantName }: Props) {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<HiringRequestRow[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs, error: reqErr }, { data: links, error: linkErr }] = await Promise.all([
      supabase
        .from('client_hiring_requests')
        .select('id, job_title, pipeline_stage, clients(company_name)')
        .in('pipeline_stage', [...ACTIVE_STAGES])
        .order('job_title', { ascending: true }),
      supabase
        .from('applicant_hiring_request_links')
        .select('hiring_request_id')
        .eq('applicant_id', applicantId),
    ]);
    if (reqErr) {
      console.error('Error loading hiring requests:', reqErr);
      toast.error('Failed to load hiring requests');
    }
    if (linkErr) {
      console.error('Error loading links:', linkErr);
    }
    setRequests((reqs as unknown as HiringRequestRow[]) || []);
    setLinkedIds(new Set((links || []).map((l) => l.hiring_request_id)));
    setLoading(false);
  }, [applicantId]);

  useEffect(() => {
    if (open) {
      setSearch('');
      load();
    }
  }, [open, load]);

  const toggle = async (request: HiringRequestRow, checked: boolean) => {
    const clientName = request.clients?.company_name || 'client';
    setPendingIds((prev) => new Set(prev).add(request.id));
    try {
      if (checked) {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('applicant_hiring_request_links')
          .insert({
            applicant_id: applicantId,
            hiring_request_id: request.id,
            linked_by: auth.user?.id ?? null,
          });
        if (error) throw error;
        setLinkedIds((prev) => new Set(prev).add(request.id));
        toast.success(`Linked to ${clientName}`);
      } else {
        const { error } = await supabase
          .from('applicant_hiring_request_links')
          .delete()
          .eq('applicant_id', applicantId)
          .eq('hiring_request_id', request.id);
        if (error) throw error;
        setLinkedIds((prev) => {
          const next = new Set(prev);
          next.delete(request.id);
          return next;
        });
        toast.success(`Unlinked from ${clientName}`);
      }
    } catch (err: any) {
      console.error('Error toggling link:', err);
      toast.error(err?.message || 'Failed to update link');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Link {applicantName} to client pipeline
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

        <div className="max-h-80 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading hiring requests...</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {requests.length === 0 ? 'No active hiring requests to link to' : 'No requests match your search'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((r) => {
                const checked = linkedIds.has(r.id);
                const pending = pendingIds.has(r.id);
                return (
                  <label
                    key={r.id}
                    className={cn(
                      'flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50',
                      pending && 'opacity-60 pointer-events-none'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={pending}
                      onCheckedChange={(v) => toggle(r, v === true)}
                    />
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
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
