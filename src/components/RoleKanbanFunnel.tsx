import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Users, MapPin, Mail, Search, ArrowRight, Copy, Star, Eye, FileText, Send, History, Trash2, CalendarPlus, Phone, ArrowUpDown, ArrowDownAZ, ArrowUpAZ, ArrowDown01, ArrowUp01, Clock, ClipboardList, UserCircle, Activity } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { ApplicationHistoryBadge } from '@/components/ApplicationHistoryBadge';
import { CandidateDetailDialog } from '@/components/CandidateDetailDialog';
import { SendEmailDialog } from '@/components/SendEmailDialog';
import { CommunicationHistory } from '@/components/CommunicationHistory';
import { InterviewInviteDialog } from '@/components/InterviewInviteDialog';
import { CVImagePreview } from '@/components/CVImagePreview';
import { CopyableText } from '@/components/CopyableText';
import { InterviewNotesDialog } from '@/components/InterviewNotesDialog';
import { CandidateProfileDialog } from '@/components/CandidateProfileDialog';
import { HiredAssignmentDialog } from '@/components/HiredAssignmentDialog';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';

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
  phone: string | null;
  location: string;
  status: string;
  pre_archive_status: string | null;
  submitted_at: string;
  total_score: number | null;
  interview_overall_score: number | null;
  job_title: string;
  job_id: string | null;
  cv_file_url: string | null;
  is_starred: boolean;
  stage_entered_at: string | null;
}

interface RoleKanbanFunnelProps {
  roles?: string[];
  onRoleSelect?: (role: string) => void;
}

export const RoleKanbanFunnel = ({ onRoleSelect: _onRoleSelect }: RoleKanbanFunnelProps) => {
  const [activeRoles, setActiveRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [roleSearch, setRoleSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const candidateSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggedCandidate, setDraggedCandidate] = useState<Candidate | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'score-desc' | 'score-asc' | 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'assessed'>('score-desc');
  const [hiredCandidate, setHiredCandidate] = useState<Candidate | null>(null);
  const [showHiredDialog, setShowHiredDialog] = useState(false);

  const updateCandidateStageInState = useCallback((candidateId: string, newStage: string) => {
    const movedAt = new Date().toISOString();
    setCandidates(prev => prev.map(candidate => (
      candidate.id === candidateId
        ? { ...candidate, status: newStage, stage_entered_at: movedAt }
        : candidate
    )));
  }, []);

  // Fetch active job titles independently
  useEffect(() => {
    const fetchActiveJobs = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('title')
        .eq('is_active', true)
        .order('title');
      setActiveRoles((data || []).map(j => j.title).filter(t => t && !/^\$?\d+(\.\d+)?$/.test(t.trim())));
    };
    fetchActiveJobs();
  }, []);

  const filteredRoles = useMemo(() => {
    return activeRoles;
  }, [activeRoles]);

  // Set initial selected role when filtered roles are ready
  useEffect(() => {
    if (filteredRoles.length > 0 && (!selectedRole || !filteredRoles.includes(selectedRole))) {
      setSelectedRole(filteredRoles[0]);
    }
  }, [filteredRoles]);

  // Notify parent when selected role changes
  useEffect(() => {
    if (selectedRole) _onRoleSelect?.(selectedRole);
  }, [selectedRole, _onRoleSelect]);

  const fetchCandidates = useCallback(async (role: string) => {
    if (!role) return;
    setLoading(true);
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('id, full_name, email, phone, location, status, pre_archive_status, submitted_at, total_score, job_title, job_id, cv_file_url, is_starred')
      .eq('job_title', role)
      .order('total_score', { ascending: false, nullsFirst: false });

    const applicantIds = (data || []).map(a => a.id);
    let interviewScores: Record<string, number> = {};
    let stageEnteredMap: Record<string, string> = {};
    
    if (applicantIds.length > 0) {
      for (let i = 0; i < applicantIds.length; i += 100) {
        const batch = applicantIds.slice(i, i + 100);
        
        // Fetch interview scores
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

        // Fetch latest status history entry (when they entered current stage)
        const { data: history } = await supabase
          .from('applicant_status_history')
          .select('applicant_id, created_at')
          .in('applicant_id', batch)
          .order('created_at', { ascending: false });
        
        for (const h of history || []) {
          if (!(h.applicant_id in stageEnteredMap)) {
            stageEnteredMap[h.applicant_id] = h.created_at;
          }
        }
      }
    }

    setCandidates((data || []).map(a => ({
      ...a,
      is_starred: a.is_starred ?? false,
      interview_overall_score: interviewScores[a.id] ?? null,
      stage_entered_at: stageEnteredMap[a.id] || a.submitted_at,
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
    // Intercept "Hired" to show assignment dialog
    if (newStage === 'Hired') {
      setHiredCandidate(candidate);
      setShowHiredDialog(true);
      return;
    }

    const previousStage = candidate.status;
    updateCandidateStageInState(candidate.id, newStage);

    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ status: newStage })
      .eq('id', candidate.id);

    if (error) {
      updateCandidateStageInState(candidate.id, previousStage);
      toast.error('Failed to move candidate');
      return;
    }

    toast.success(`Moved ${candidate.full_name} to ${newStage}`);
  }, [updateCandidateStageInState]);

  const handleHiredComplete = useCallback(async () => {
    if (hiredCandidate) {
      updateCandidateStageInState(hiredCandidate.id, 'Hired');

      // Update status to Hired
      const { error } = await supabase
        .from('applicants_prescreen')
        .update({ status: 'Hired' })
        .eq('id', hiredCandidate.id);

      if (error) {
        updateCandidateStageInState(hiredCandidate.id, hiredCandidate.status);
      } else {
        toast.success(`${hiredCandidate.full_name} moved to Hired`);
      }
    }
    setShowHiredDialog(false);
    setHiredCandidate(null);
  }, [hiredCandidate, updateCandidateStageInState]);

  const handleToggleStar = useCallback(async (candidate: Candidate) => {
    const newVal = !candidate.is_starred;
    await supabase.from('applicants_prescreen').update({ is_starred: newVal }).eq('id', candidate.id);
    setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, is_starred: newVal } : c));
    toast.success(newVal ? 'Starred' : 'Unstarred');
  }, []);

  const handleCopyEmail = useCallback((email: string) => {
    navigator.clipboard.writeText(email);
    toast.success('Email copied to clipboard');
  }, []);

  const handleDelete = useCallback(async (candidate: Candidate) => {
    // Soft delete: move to deleted_applicants
    const { data: applicantData } = await supabase
      .from('applicants_prescreen')
      .select('*')
      .eq('id', candidate.id)
      .single();

    if (!applicantData) {
      toast.error('Could not find applicant');
      return;
    }

    const { error: insertError } = await supabase.from('deleted_applicants').insert({
      original_id: applicantData.id,
      full_name: applicantData.full_name,
      email: applicantData.email,
      phone: applicantData.phone,
      whatsapp: applicantData.whatsapp,
      location: applicantData.location,
      job_title: applicantData.job_title,
      job_id: applicantData.job_id,
      status: applicantData.status,
      cv_file_url: applicantData.cv_file_url,
      cv_text: applicantData.cv_text,
      voice_recording_url: applicantData.voice_recording_url,
      vocaroo_link: applicantData.vocaroo_link,
      notes: applicantData.notes,
      candidate_profile: applicantData.candidate_profile,
      total_score: applicantData.total_score,
      role_experience_score: applicantData.role_experience_score,
      skills_tools_score: applicantData.skills_tools_score,
      availability_setup_score: applicantData.availability_setup_score,
      bonus_red_flag_score: applicantData.bonus_red_flag_score,
      ranking_status: applicantData.ranking_status,
      ai_summary: applicantData.ai_summary,
      ai_assessment_details: applicantData.ai_assessment_details,
      extracted_skills: applicantData.extracted_skills,
      extracted_tools: applicantData.extracted_tools,
      years_of_experience: applicantData.years_of_experience,
      submitted_at: applicantData.submitted_at,
      created_at: applicantData.created_at,
      job_source: applicantData.job_source,
      original_job_id: applicantData.original_job_id,
      original_job_title: applicantData.original_job_title,
      reprofiled_at: applicantData.reprofiled_at,
      device_type: applicantData.device_type,
      is_starred: applicantData.is_starred,
      apply_url: applicantData.apply_url,
      home_office: applicantData.home_office,
      noise_canceling_headset: applicantData.noise_canceling_headset,
      laptop_or_pc: applicantData.laptop_or_pc,
      good_internet: applicantData.good_internet,
      internet_speed: applicantData.internet_speed,
      power_backup: applicantData.power_backup,
      can_work_40_50: applicantData.can_work_40_50,
      us_timezone_ok: applicantData.us_timezone_ok,
      start_availability: applicantData.start_availability,
      has_experience: applicantData.has_experience,
      currently_working: applicantData.currently_working,
    });

    if (insertError) {
      toast.error('Failed to delete applicant');
      return;
    }

    await supabase.from('applicants_prescreen').delete().eq('id', candidate.id);
    setCandidates(prev => prev.filter(c => c.id !== candidate.id));
    toast.success(`Deleted ${candidate.full_name}`);
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

    // Sort each stage's candidates
    const sortFn = (a: Candidate, b: Candidate) => {
      switch (sortOption) {
        case 'score-desc': return (b.total_score ?? -1) - (a.total_score ?? -1);
        case 'score-asc': return (a.total_score ?? -1) - (b.total_score ?? -1);
        case 'name-asc': return a.full_name.localeCompare(b.full_name);
        case 'name-desc': return b.full_name.localeCompare(a.full_name);
        case 'newest': return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
        case 'oldest': return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
        case 'assessed': {
          const aHas = a.interview_overall_score !== null ? 1 : 0;
          const bHas = b.interview_overall_score !== null ? 1 : 0;
          if (bHas !== aHas) return bHas - aHas;
          return (b.interview_overall_score ?? -1) - (a.interview_overall_score ?? -1);
        }
        default: return 0;
      }
    };
    for (const stage of FUNNEL_STAGES) {
      groups[stage].sort(sortFn);
    }

    return groups;
  }, [filteredCandidates, sortOption]);

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

        <div className="flex items-center gap-2">

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
              className="pl-8 h-9 w-[320px] text-sm pr-8 border-blue-400 focus:border-blue-500 focus:ring-blue-500"
            />
            {selectedRole && !dropdownOpen && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRole('');
                  setRoleSearch('');
                  setDropdownOpen(true);
                }}
              >
                ✕
              </button>
            )}
          </div>
          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-[320px] rounded-md border bg-popover shadow-md overflow-hidden">
              <ScrollArea className="max-h-[300px] overflow-y-auto">
                <div className="p-1">
                  {filteredRoles
                    .filter((r) => r.toLowerCase().includes(roleSearch.toLowerCase()))
                    .sort((a, b) => a.localeCompare(b))
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
                  {filteredRoles.filter((r) => r.toLowerCase().includes(roleSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No roles found.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search candidate across roles..."
              value={candidateSearch}
              onChange={(e) => {
                const val = e.target.value;
                setCandidateSearch(val);
                if (candidateSearchTimer.current) clearTimeout(candidateSearchTimer.current);
                if (val.trim().length >= 2) {
                  candidateSearchTimer.current = setTimeout(async () => {
                    const { data } = await supabase
                      .from('applicants_prescreen')
                      .select('job_title')
                      .ilike('full_name', `%${val.trim()}%`)
                      .limit(1);
                    if (data && data.length > 0 && data[0].job_title !== selectedRole) {
                      setSelectedRole(data[0].job_title);
                    }
                  }, 400);
                }
              }}
              className="pl-8 h-9 w-[260px] text-sm border-blue-400 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !selectedRole ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Select a role to view its pipeline.</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <div className="flex gap-3 pb-4 min-w-max">
            {FUNNEL_STAGES.map((stage) => {
              const colors = STAGE_COLORS[stage];
              const stageCandidates = stageGroups[stage];

              return (
                <div
                  key={stage}
                  className={cn(
                    'flex flex-col w-[248px] shrink-0 rounded-lg border-2 overflow-hidden transition-all duration-150',
                    dropTargetStage === stage && draggedCandidate
                      ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                      : 'border-border/60',
                    colors.bg
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetStage(stage);
                  }}
                  onDragLeave={(e) => {
                    // Only clear if leaving the column entirely
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDropTargetStage(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTargetStage(null);
                    if (draggedCandidate && draggedCandidate.status !== stage) {
                      handleMoveToStage(draggedCandidate, stage);
                    }
                    setDraggedCandidate(null);
                  }}
                >
                  <div className={cn('px-3 py-2.5 flex items-center justify-between', colors.header)}>
                    <span className="text-sm font-semibold text-white">{stage}</span>
                    <div className="flex items-center gap-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-white/80 hover:text-white transition-colors p-0.5 rounded">
                            <ArrowUpDown className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setSortOption('score-desc')} className={cn(sortOption === 'score-desc' && 'bg-accent')}>
                            <ArrowDown01 className="mr-2 h-4 w-4" /> Score: High → Low
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSortOption('score-asc')} className={cn(sortOption === 'score-asc' && 'bg-accent')}>
                            <ArrowUp01 className="mr-2 h-4 w-4" /> Score: Low → High
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSortOption('name-asc')} className={cn(sortOption === 'name-asc' && 'bg-accent')}>
                            <ArrowDownAZ className="mr-2 h-4 w-4" /> Name: A → Z
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSortOption('name-desc')} className={cn(sortOption === 'name-desc' && 'bg-accent')}>
                            <ArrowUpAZ className="mr-2 h-4 w-4" /> Name: Z → A
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSortOption('newest')} className={cn(sortOption === 'newest' && 'bg-accent')}>
                            <Clock className="mr-2 h-4 w-4" /> Newest First
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSortOption('oldest')} className={cn(sortOption === 'oldest' && 'bg-accent')}>
                            <Clock className="mr-2 h-4 w-4" /> Oldest First
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSortOption('assessed')} className={cn(sortOption === 'assessed' && 'bg-accent')}>
                            <ClipboardList className="mr-2 h-4 w-4" /> Completed Assessment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="text-xs font-bold text-white/90 bg-white/20 rounded-full px-2 py-0.5">
                        {stageCandidates.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 max-h-[720px] overflow-y-auto">
                    <div className="p-2 space-y-2">
                      {stageCandidates.length === 0 ? (
                        <p className={cn(
                          "text-[11px] text-muted-foreground text-center py-6",
                          dropTargetStage === stage && draggedCandidate && "text-primary font-medium"
                        )}>
                          {dropTargetStage === stage && draggedCandidate ? 'Drop here' : 'No candidates'}
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
                            onDelete={handleDelete}
                            isDragging={draggedCandidate?.id === candidate.id}
                            onDragStart={() => setDraggedCandidate(candidate)}
                            onDragEnd={() => {
                              setDraggedCandidate(null);
                              setDropTargetStage(null);
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hiredCandidate && (
        <HiredAssignmentDialog
          open={showHiredDialog}
          onOpenChange={(open) => {
            if (!open) handleHiredComplete();
          }}
          applicant={hiredCandidate ? {
            id: hiredCandidate.id,
            full_name: hiredCandidate.full_name,
            email: hiredCandidate.email,
            phone: hiredCandidate.phone || null,
            location: hiredCandidate.location,
            job_title: hiredCandidate.job_title,
          } : null}
          onComplete={handleHiredComplete}
        />
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
  onDelete: (candidate: Candidate) => void;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const CandidateCard = ({ candidate, dotColor, currentStage, onMoveToStage, onToggleStar, onCopyEmail, onDelete, isDragging, onDragStart, onDragEnd }: CandidateCardProps) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showDetailsTab, setShowDetailsTab] = useState<string | undefined>(undefined); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCvPreview, setShowCvPreview] = useState(false);
  const [showInterviewResults, setShowInterviewResults] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [activityHistory, setActivityHistory] = useState<Array<{ from_status: string | null; to_status: string; changed_by: string | null; created_at: string }>>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    const { data, error } = await supabase
      .from('applicant_status_history')
      .select('from_status, to_status, changed_by, created_at')
      .eq('applicant_id', candidate.id)
      .not('changed_by', 'is', null)
      .order('created_at', { ascending: false });
    if (!error) {
      setActivityHistory(data || []);
    }
    setActivityLoading(false);
  }, [candidate.id]);

  useEffect(() => {
    if (showActivity) fetchActivity();
  }, [showActivity, fetchActivity]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', candidate.id);
              onDragStart?.();
            }}
            onDragEnd={() => onDragEnd?.()}
            className={cn(
              "bg-card rounded-md p-2.5 shadow-sm border border-border/50 hover:shadow-md transition-all space-y-1.5 cursor-grab active:cursor-grabbing",
              isDragging && "opacity-40 scale-95 shadow-lg"
            )}
          >
            <div className="space-y-1">
              <div className="flex items-start gap-1.5">
                <div className={cn('w-2 h-2 rounded-full mt-1 shrink-0', dotColor)} />
                <p className="text-xs font-semibold leading-tight flex-1 min-w-0" title={candidate.full_name}>
                  {candidate.full_name}
                </p>
                {candidate.is_starred && (
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                )}
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
                <ApplicationHistoryBadge email={candidate.email} currentId={candidate.id} phone={candidate.phone} />
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

            {(() => {
              const enteredAt = candidate.stage_entered_at ? new Date(candidate.stage_entered_at) : new Date(candidate.submitted_at);
              const now = new Date();
              const diffMs = now.getTime() - enteredAt.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const isOverdue = diffDays > 2;
              const label = diffDays >= 1 ? `${diffDays}d` : `${diffHours}h`;
              return (
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-medium",
                  isOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                )}>
                  <Clock className="w-2.5 h-2.5 shrink-0" />
                  <span>{label} in stage</span>
                </div>
              );
            })()}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={() => setShowDetails(true)}>
            <Eye className="w-4 h-4 mr-2" />
            View details
          </ContextMenuItem>

          <ContextMenuSeparator />

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

          <ContextMenuItem onClick={() => setShowSendEmail(true)}>
            <Send className="w-4 h-4 mr-2" />
            Send email
          </ContextMenuItem>

          <ContextMenuItem onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 mr-2" />
            Communication history
          </ContextMenuItem>

          <ContextMenuItem onClick={() => setShowInvite(true)}>
            <CalendarPlus className="w-4 h-4 mr-2" />
            Send interview invite
          </ContextMenuItem>

          <ContextMenuItem onClick={() => setShowInterviewResults(true)}>
            <ClipboardList className="w-4 h-4 mr-2" />
            Interview notes
          </ContextMenuItem>

          <ContextMenuItem onClick={() => setShowProfile(true)}>
            <UserCircle className="w-4 h-4 mr-2" />
            Profile
          </ContextMenuItem>

          <ContextMenuItem onClick={() => setShowActivity(true)}>
            <Activity className="w-4 h-4 mr-2" />
            Activity
          </ContextMenuItem>

          {candidate.cv_file_url && (
            <ContextMenuItem onClick={() => setShowCvPreview(true)}>
              <FileText className="w-4 h-4 mr-2" />
              Preview CV
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => onCopyEmail(candidate.email)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy email
          </ContextMenuItem>

          {candidate.phone && (
            <ContextMenuItem onClick={() => {
              navigator.clipboard.writeText(candidate.phone!);
              toast.success('Phone copied');
            }}>
              <Phone className="w-4 h-4 mr-2" />
              Copy phone
            </ContextMenuItem>
          )}

          <ContextMenuItem onClick={() => onToggleStar(candidate)}>
            <Star className={cn("w-4 h-4 mr-2", candidate.is_starred && "fill-yellow-500 text-yellow-500")} />
            {candidate.is_starred ? 'Unstar' : 'Star'}
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(candidate)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <CandidateDetailDialog
        open={showDetails}
        onOpenChange={(open) => { setShowDetails(open); if (!open) setShowDetailsTab(undefined); }}
        applicantId={candidate.id}
      />

      <SendEmailDialog
        open={showSendEmail}
        onOpenChange={setShowSendEmail}
        applicant={{
          id: candidate.id,
          full_name: candidate.full_name,
          email: candidate.email,
          job_title: candidate.job_title,
          status: candidate.status,
        }}
      />

      <CommunicationHistory
        open={showHistory}
        onOpenChange={setShowHistory}
        applicantId={candidate.id}
        applicantName={candidate.full_name}
        applicantEmail={candidate.email}
      />

      <InterviewInviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        applicant={{
          id: candidate.id,
          full_name: candidate.full_name,
          email: candidate.email,
          job_title: candidate.job_title,
        }}
      />

      {candidate.cv_file_url && (
        <Dialog open={showCvPreview} onOpenChange={setShowCvPreview}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>CV Preview — {candidate.full_name}</DialogTitle>
            </DialogHeader>
            <CVImagePreview pdfUrl={candidate.cv_file_url} fileName={candidate.full_name + '.pdf'} />
          </DialogContent>
        </Dialog>
      )}

      <InterviewNotesDialog
        open={showInterviewResults}
        onOpenChange={setShowInterviewResults}
        applicantId={candidate.id}
        applicantName={candidate.full_name}
      />

      <CandidateProfileDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        applicantId={candidate.id}
        applicantName={candidate.full_name}
      />

      <Dialog open={showActivity} onOpenChange={setShowActivity}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Activity — {candidate.full_name}
            </DialogTitle>
          </DialogHeader>
          {activityLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : activityHistory.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No activity recorded</div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-3">
              {activityHistory.map((entry, idx) => {
                const date = new Date(entry.created_at);
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                const adminName = getAdminDisplayName(entry.changed_by, 'System');
                return (
                  <div key={idx} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      {idx < activityHistory.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="pb-3">
                      <p className="text-foreground">
                        <span className="font-medium">{adminName}</span>
                        {' moved from '}
                        <span className="font-medium">{entry.from_status || '—'}</span>
                        {' → '}
                        <span className="font-medium">{entry.to_status}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formattedDate} at {formattedTime}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
