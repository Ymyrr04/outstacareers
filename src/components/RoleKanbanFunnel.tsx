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
import { Users, MapPin, Mail, Search, ArrowRight, Copy, Star, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';

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

  const fetchCandidates = useCallback(async (role: string) => {
    if (!role) return;
    setLoading(true);
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('id, full_name, email, location, status, pre_archive_status, submitted_at, total_score')
      .eq('job_title', role)
      .order('total_score', { ascending: false, nullsFirst: false });
    setCandidates(data || []);
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

  const stageGroups = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    for (const stage of FUNNEL_STAGES) {
      groups[stage] = [];
    }

    for (const candidate of candidates) {
      const effectiveStatus = candidate.status === 'Archive' || candidate.status === 'Archived'
        ? (candidate.pre_archive_status || candidate.status)
        : candidate.status;

      if (groups[effectiveStatus]) {
        groups[effectiveStatus].push(candidate);
      }
    }

    return groups;
  }, [candidates]);

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
                    'flex flex-col w-[220px] shrink-0 rounded-lg border border-border/60 overflow-hidden',
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

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="bg-card rounded-md p-2.5 shadow-sm border border-border/50 hover:shadow-md transition-shadow space-y-1.5 cursor-context-menu">
            <div className="flex items-start gap-2">
              <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', dotColor)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight" title={candidate.full_name}>
                  {candidate.full_name}
                </p>
              </div>
              {candidate.total_score != null && (
                <Badge variant="outline" className="text-[9px] shrink-0 h-4 px-1">
                  {candidate.total_score}
                </Badge>
              )}
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

          <ContextMenuItem onClick={() => setShowInterview(true)}>
            <ClipboardList className="w-4 h-4 mr-2" />
            View details
          </ContextMenuItem>

          <ContextMenuItem onClick={() => onCopyEmail(candidate.email)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy email
          </ContextMenuItem>

          <ContextMenuItem onClick={() => onToggleStar(candidate)}>
            <Star className="w-4 h-4 mr-2" />
            Toggle star
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
    </>
  );
};
