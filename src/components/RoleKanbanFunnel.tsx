import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, MapPin, Mail, Search, ArrowRight, Copy, Star, ClipboardList, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { CandidateDetailDialog } from '@/components/CandidateDetailDialog';

const FUNNEL_STAGES = [
  'For Review',
  'For Interview',
  'SIV',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Talent Pool',
] as const;

const STAGE_COLORS: Record<string, { bg: string; header: string; dot: string }> = {
  'For Review': { bg: 'bg-blue-50 dark:bg-blue-950/20', header: 'bg-blue-500', dot: 'bg-blue-400' },
  'For Interview': { bg: 'bg-indigo-50 dark:bg-indigo-950/20', header: 'bg-indigo-500', dot: 'bg-indigo-400' },
  'SIV': { bg: 'bg-violet-50 dark:bg-violet-950/20', header: 'bg-violet-500', dot: 'bg-violet-400' },
  'Client Interview': { bg: 'bg-purple-50 dark:bg-purple-950/20', header: 'bg-purple-500', dot: 'bg-purple-400' },
  'Hired': { bg: 'bg-emerald-50 dark:bg-emerald-950/20', header: 'bg-emerald-500', dot: 'bg-emerald-400' },
  'Bench': { bg: 'bg-amber-50 dark:bg-amber-950/20', header: 'bg-amber-500', dot: 'bg-amber-400' },
  'Reject': { bg: 'bg-red-50 dark:bg-red-950/20', header: 'bg-red-400', dot: 'bg-red-400' },
  'Talent Pool': { bg: 'bg-teal-50 dark:bg-teal-950/20', header: 'bg-teal-500', dot: 'bg-teal-400' },
};

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  location: string;
  status: string;
  pre_archive_status: string | null;
  submitted_at: string;
  total_score: number | null;
  interview_overall_score: number | null;
}

interface RoleKanbanFunnelProps {
  roles: string[];
}

export const RoleKanbanFunnel = ({ roles }: RoleKanbanFunnelProps) => {
  const [selectedRole, setSelectedRole] = useState<string>(roles[0] || '');
  const [roleSearch, setRoleSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');

  const fetchCandidates = useCallback(async (role: string) => {
    if (!role) return;
    setLoading(true);
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('id, full_name, email, location, status, pre_archive_status, submitted_at, total_score')
      .eq('job_title', role)
      .order('total_score', { ascending: false, nullsFirst: false });

    const applicantIds = (data || []).map(a => a.id);
    let interviewScores: Record<string, number> = {};
    
    if (applicantIds.length > 0) {
      // Fetch in batches of 100 to avoid URL length limits
      for (let i = 0; i < applicantIds.length; i += 100) {
        const batch = applicantIds.slice(i, i + 100);
        const { data: sessions } = await supabase
          .from('interview_sessions')
          .select('applicant_id, overall_score')
          .in('applicant_id', batch)
          .in('status', ['completed', 'completed_manual_review'])
          .order('created_at', { ascending: false });
        
        for (const s of sessions || []) {
          if (s.overall_score != null && !(s.applicant_id in interviewScores)) {
            interviewScores[s.applicant_id] = s.overall_score;
          }
        }
      }
    }

    setCandidates((data || []).map(a => ({
      ...a,
      interview_overall_score: interviewScores[a.id] ?? null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedRole) fetchCandidates(selectedRole);
  }, [selectedRole, fetchCandidates]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMoveToStage = useCallback(async (candidate: Candidate, newStage: string) => {
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ status: newStage })
      .eq('id', candidate.id);

    if (error) {
      toast.error('Failed to move candidate');
      return;
    }

    // Log status change
    await supabase.from('applicant_status_history').insert({
      applicant_id: candidate.id,
      from_status: candidate.status,
      to_status: newStage,
    });

    toast.success(`Moved ${candidate.full_name} to ${newStage}`);
    fetchCandidates(selectedRole);
  }, [selectedRole, fetchCandidates]);

  const handleToggleStar = useCallback(async (candidate: Candidate) => {
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('is_starred')
      .eq('id', candidate.id)
      .single();

    const newVal = !(data?.is_starred);
    await supabase.from('applicants_prescreen').update({ is_starred: newVal }).eq('id', candidate.id);
    toast.success(newVal ? 'Starred' : 'Unstarred');
    fetchCandidates(selectedRole);
  }, [selectedRole, fetchCandidates]);

  const handleCopyEmail = useCallback((email: string) => {
    navigator.clipboard.writeText(email);
    toast.success('Email copied to clipboard');
  }, []);

  const filteredCandidates = useMemo(() => {
    if (!candidateSearch.trim()) return candidates;
    const term = candidateSearch.toLowerCase();
    return candidates.filter(c =>
      c.full_name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      (c.location && c.location.toLowerCase().includes(term))
    );
  }, [candidates, candidateSearch]);

  const stageGroups = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    for (const stage of FUNNEL_STAGES) {
      groups[stage] = [];
    }

    for (const candidate of filteredCandidates) {
      const effectiveStatus = candidate.status === 'Archive' || candidate.status === 'Archived'
        ? (candidate.pre_archive_status || candidate.status)
        : candidate.status;

      if (groups[effectiveStatus]) {
        groups[effectiveStatus].push(candidate);
      }
    }

    return groups;
  }, [filteredCandidates]);

  const totalInPipeline = useMemo(
    () => Object.values(stageGroups).reduce((sum, arr) => sum + arr.length, 0),
    [stageGroups]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Role Pipeline</h2>
          {selectedRole && (
            <Badge variant="secondary">{totalInPipeline} candidates</Badge>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search & select role..."
              value={dropdownOpen ? roleSearch : selectedRole}
              onChange={(e) => {
                setRoleSearch(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => {
                setDropdownOpen(true);
                setRoleSearch('');
              }}
              className="pl-8 h-9 w-[320px] text-sm"
            />
          </div>
          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-[320px] rounded-md border bg-popover shadow-md">
              <ScrollArea className="max-h-[250px]">
                <div className="p-1">
                  {roles
                    .filter((r) => r.toLowerCase().includes(roleSearch.toLowerCase()))
                    .map((role) => (
                      <button
                        key={role}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                          selectedRole === role && 'bg-accent/50 font-medium'
                        )}
                        onClick={() => {
                          setSelectedRole(role);
                          setDropdownOpen(false);
                          setRoleSearch('');
                        }}
                      >
                        {role}
                      </button>
                    ))}
                  {roles.filter((r) => r.toLowerCase().includes(roleSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No roles found.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !selectedRole ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Select a role to view its pipeline.</p>
      ) : (
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-4 min-w-max">
            {FUNNEL_STAGES.map((stage) => {
              const colors = STAGE_COLORS[stage];
              const stageCandidates = stageGroups[stage];

              return (
                <div
                  key={stage}
                  className={cn(
                    'flex flex-col w-[248px] shrink-0 rounded-lg border border-border/60 overflow-hidden',
                    colors.bg
                  )}
                >
                  <div className={cn('px-3 py-2.5 flex items-center justify-between', colors.header)}>
                    <span className="text-sm font-semibold text-white">{stage}</span>
                    <span className="text-xs font-bold text-white/90 bg-white/20 rounded-full px-2 py-0.5">
                      {stageCandidates.length}
                    </span>
                  </div>

                  <ScrollArea className="flex-1 max-h-[420px]">
                    <div className="p-2 space-y-2">
                      {stageCandidates.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-6">
                          No candidates
                        </p>
                      ) : (
                        stageCandidates.map((candidate) => (
                          <CandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            dotColor={colors.dot}
                            currentStage={stage}
                            onMoveToStage={handleMoveToStage}
                            onToggleStar={handleToggleStar}
                            onCopyEmail={handleCopyEmail}
                          />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
};

interface CandidateCardProps {
  candidate: Candidate;
  dotColor: string;
  currentStage: string;
  onMoveToStage: (candidate: Candidate, stage: string) => void;
  onToggleStar: (candidate: Candidate) => void;
  onCopyEmail: (email: string) => void;
}

const CandidateCard = ({ candidate, dotColor, currentStage, onMoveToStage, onToggleStar, onCopyEmail }: CandidateCardProps) => {
  const [showInterview, setShowInterview] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="bg-card rounded-md p-2.5 shadow-sm border border-border/50 hover:shadow-md transition-shadow space-y-1.5 cursor-context-menu">
            <div className="space-y-1">
              <div className="flex items-start gap-1.5">
                <div className={cn('w-2 h-2 rounded-full mt-1 shrink-0', dotColor)} />
                <p className="text-xs font-semibold leading-tight flex-1 min-w-0" title={candidate.full_name}>
                  {candidate.full_name}
                </p>
              </div>
              <div className="pl-3.5 flex items-center gap-1.5 flex-wrap">
                <span 
                  className={cn(
                    "inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded",
                    candidate.total_score != null && candidate.total_score >= 70
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : candidate.total_score != null && candidate.total_score >= 40
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : candidate.total_score != null
                      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  CV: {candidate.total_score ?? '–'}
                </span>
                {candidate.interview_overall_score != null && (
                  <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
                    IV: {candidate.interview_overall_score}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{candidate.location || 'N/A'}</span>
            </div>

            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Mail className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{candidate.email}</span>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ArrowRight className="w-4 h-4 mr-2" />
              Move to stage
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {FUNNEL_STAGES.filter((s) => s !== currentStage).map((stage) => (
                <ContextMenuItem key={stage} onClick={() => onMoveToStage(candidate, stage)}>
                  <div className={cn('w-2 h-2 rounded-full mr-2', STAGE_COLORS[stage]?.dot)} />
                  {stage}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => setShowDetails(true)}>
            <Eye className="w-4 h-4 mr-2" />
            View details
          </ContextMenuItem>

        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={showInterview} onOpenChange={setShowInterview}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Interview Results — {candidate.full_name}</DialogTitle>
          </DialogHeader>
          <InterviewResultsFetcher applicantId={candidate.id} cachedSession={null} />
        </DialogContent>
      </Dialog>

      <CandidateDetailDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        applicantId={candidate.id}
      />
    </>
  );
};
