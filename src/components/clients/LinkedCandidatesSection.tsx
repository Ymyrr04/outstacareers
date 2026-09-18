import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Users, ChevronDown, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface LinkedCandidate {
  linkId: string;
  applicantId: string;
  fullName: string;
  jobTitle: string | null;
  totalScore: number | null;
}

// Same score tiers used on Kanban cards
const scoreBadgeClass = (score: number | null) =>
  score == null
    ? 'bg-muted text-muted-foreground'
    : score >= 80
    ? 'bg-[#E0F7FC] text-[#066F85]'
    : score >= 60
    ? 'bg-[#FAEEDA] text-[#633806]'
    : 'bg-[#FCEBEB] text-[#A32D2D]';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

export function LinkedCandidatesSection({ hiringRequestId }: { hiringRequestId: string }) {
  const [candidates, setCandidates] = useState<LinkedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('applicant_hiring_request_links')
      .select('id, applicant_id, applicants_prescreen(full_name, job_title, total_score)')
      .eq('hiring_request_id', hiringRequestId);
    if (error) {
      console.error('Error loading linked candidates:', error);
      setLoading(false);
      return;
    }
    setCandidates(
      (data || []).map((row: any) => ({
        linkId: row.id,
        applicantId: row.applicant_id,
        fullName: row.applicants_prescreen?.full_name || 'Unknown',
        jobTitle: row.applicants_prescreen?.job_title ?? null,
        totalScore: row.applicants_prescreen?.total_score ?? null,
      }))
    );
    setLoading(false);
  }, [hiringRequestId]);

  useEffect(() => {
    load();
  }, [load]);

  const unlink = async (candidate: LinkedCandidate) => {
    setUnlinkingId(candidate.linkId);
    const { error } = await supabase
      .from('applicant_hiring_request_links')
      .delete()
      .eq('id', candidate.linkId);
    if (error) {
      console.error('Error unlinking candidate:', error);
      toast.error('Failed to unlink candidate');
    } else {
      toast.success(`Unlinked ${candidate.fullName}`);
      await load();
    }
    setUnlinkingId(null);
  };

  return (
    <Collapsible defaultOpen className="border-t">
      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Users className="w-4 h-4" />
          Linked Candidates ({candidates.length})
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>svg]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Loading linked candidates...</span>
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-2">No candidates linked yet</p>
        ) : (
          <div className="space-y-0.5">
            {candidates.map((c) => (
              <div
                key={c.linkId}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 -mx-2 hover:bg-[#F0FFFE] transition-colors"
              >
                <div className="w-[26px] h-[26px] rounded-full bg-[#E0F7FC] text-[#066F85] flex items-center justify-center text-[10px] font-semibold shrink-0">
                  {initials(c.fullName)}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/admin/applicants?applicant=${c.applicantId}`}
                    className="text-sm font-medium text-primary hover:underline truncate block"
                  >
                    {c.fullName}
                  </Link>
                  {c.jobTitle && (
                    <p className="text-[10px] text-muted-foreground truncate">{c.jobTitle}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] shrink-0',
                    scoreBadgeClass(c.totalScore)
                  )}
                >
                  {c.totalScore ?? '—'}
                </span>
                <button
                  type="button"
                  onClick={() => unlink(c)}
                  disabled={unlinkingId === c.linkId}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title={`Unlink ${c.fullName}`}
                >
                  {unlinkingId === c.linkId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
