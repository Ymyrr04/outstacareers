import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getErrorMessageSync } from "@/lib/errors";
import { useSearchParams } from 'react-router-dom';
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
import { Users, MapPin, Mail, Search, ArrowRight, Copy, Star, Eye, FileText, Send, History, Trash2, CalendarPlus, Phone, ArrowUpDown, ArrowDownAZ, ArrowUpAZ, ArrowDown01, ArrowUp01, Clock, ClipboardList, UserCircle, Activity, FileSignature, Loader2, Tag as TagIcon, X as XIcon, Briefcase, UserCog, Calendar } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { TagEditorDialog } from '@/components/TagEditorDialog';
import { SuitableRoleEditorDialog } from '@/components/SuitableRoleEditorDialog';
import { ReprofilingDialog } from '@/components/ReprofilingDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { priorityGate } from '@/lib/priorityGate';
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
import { useEmailTemplates, statusToTrigger } from '@/hooks/useEmailTemplates';
import { addMinutes } from 'date-fns';
import { StageEmailConfirmDialog, type PendingStageEmail } from '@/components/StageEmailConfirmDialog';
import { StageNoteDialog, type PendingStageNote } from '@/components/StageNoteDialog';
import { AddCandidateCalendarDialog } from '@/components/AddCandidateCalendarDialog';
import { useStageSettings } from '@/hooks/useStageSettings';

const FUNNEL_STAGES = [
  'For Review',
  'Qualified',
  'For Interview',
  'SIV',
  'Pitch',
  'Client Interview',
  'Hired',
  'Bench',
  'Cold Talent Pool',
  'Talent Pool',
  'Reject',
] as const;

const STAGE_COLORS: Record<string, { bg: string; header: string; dot: string }> = {
  'For Review': { bg: 'bg-blue-50 dark:bg-blue-950/20', header: 'bg-blue-500', dot: 'bg-blue-400' },
  'Qualified': { bg: 'bg-cyan-50 dark:bg-cyan-950/20', header: 'bg-cyan-600', dot: 'bg-cyan-500' },
  'For Interview': { bg: 'bg-indigo-50 dark:bg-indigo-950/20', header: 'bg-indigo-500', dot: 'bg-indigo-400' },

  'SIV': { bg: 'bg-violet-50 dark:bg-violet-950/20', header: 'bg-violet-500', dot: 'bg-violet-400' },
  'Pitch': { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/20', header: 'bg-fuchsia-500', dot: 'bg-fuchsia-400' },
  'Client Interview': { bg: 'bg-purple-50 dark:bg-purple-950/20', header: 'bg-purple-500', dot: 'bg-purple-400' },
  'Hired': { bg: 'bg-emerald-50 dark:bg-emerald-950/20', header: 'bg-emerald-500', dot: 'bg-emerald-400' },
  'Bench': { bg: 'bg-teal-50 dark:bg-teal-950/20', header: 'bg-teal-500', dot: 'bg-teal-400' },
  'Reject': { bg: 'bg-red-50 dark:bg-red-950/20', header: 'bg-red-400', dot: 'bg-red-400' },
  'Talent Pool': { bg: 'bg-amber-50 dark:bg-amber-950/20', header: 'bg-amber-500', dot: 'bg-amber-400' },
  'Cold Talent Pool': { bg: 'bg-sky-50 dark:bg-sky-950/20', header: 'bg-sky-500', dot: 'bg-sky-400' },
};

const defaultStageDisplayName = (stage: string): string => {
  if (stage === 'Talent Pool') return 'Bench';
  if (stage === 'Bench') return 'Talent Pipeline';
  return stage;
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
  interview_status: string | null;
  interview_started_at: string | null;
  job_title: string;
  job_id: string | null;
  cv_file_url: string | null;
  is_starred: boolean;
  interview_invite_sent_at: string | null;
  stage_entered_at: string | null;
  tags: string[];
  suitable_roles: string[];
}

interface RoleKanbanFunnelProps {
  roles?: string[];
  onRoleSelect?: (role: string) => void;
  onFiltersChange?: (filters: {
    role: string;
    jobFilter: 'active' | 'all' | 'inactive';
    selectedAdmin: string;
    adminScopedRoles: string[] | null;
  }) => void;
}

const ALL_ROLES_KEY = '__all__';

export const RoleKanbanFunnel = ({ onRoleSelect: _onRoleSelect, onFiltersChange }: RoleKanbanFunnelProps) => {
  const { getDisplayName: getStageDisplayName, getColor: getStageColorOverride, orderStages } = useStageSettings();
  const orderedFunnelStages = useMemo(() => orderStages(FUNNEL_STAGES), [orderStages]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeRoles, setActiveRoles] = useState<string[]>([]);
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [jobFilter, setJobFilter] = useState<'active' | 'all' | 'inactive'>(() => {
    const p = searchParams.get('jobs');
    if (p === 'all') return 'all';
    if (p === 'inactive') return 'inactive';
    return 'active';
  });
  const [selectedRole, setSelectedRole] = useState<string>(() => {
    return searchParams.get('role') || ALL_ROLES_KEY;
  });
  const [roleSearch, setRoleSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pipelineScrollRef = useRef<HTMLDivElement>(null);
  const lastAutoRevealKeyRef = useRef('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [additionalProfileIds, setAdditionalProfileIds] = useState<Set<string>>(new Set());
  const [primaryProfileIds, setPrimaryProfileIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const candidateSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggedCandidate, setDraggedCandidate] = useState<Candidate | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'score-desc' | 'score-asc' | 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'assessed'>('score-desc');
  const [hiredCandidate, setHiredCandidate] = useState<Candidate | null>(null);
  const [showHiredDialog, setShowHiredDialog] = useState(false);
  const { templates, getDefaultTemplateByTrigger } = useEmailTemplates();
  const [pendingStageEmail, setPendingStageEmail] = useState<
    (PendingStageEmail & { applicantId: string; templateId: string }) | null
  >(null);
  const [stageNote, setStageNote] = useState<PendingStageNote | null>(null);


  // Build the email payload for a status change (matching Admin.tsx behavior).
  // Skips for_interview/siv (which need manual customization via dialog).
  const buildStatusEmail = useCallback((candidate: Candidate, newStatus: string) => {
    const trigger = statusToTrigger[newStatus];
    if (!trigger) return null;
    if (trigger === 'for_interview' || trigger === 'siv') return null;
    // Use the stage's default template (falls back to the base trigger template)
    const template = getDefaultTemplateByTrigger(trigger);
    if (!template || !template.is_enabled) return null;
    const recipientEmail = (candidate as any).email;
    if (!recipientEmail) return null;

    const firstName = (candidate.full_name || '').split(' ')[0];
    const replacements: Record<string, string> = {
      '{{applicant_name}}': candidate.full_name || '',
      '{{first_name}}': firstName,
      '{{full_name}}': candidate.full_name || '',
      '{{job_title}}': (candidate as any).job_title || '',
    };
    const apply = (s: string) => Object.entries(replacements).reduce(
      (acc, [k, v]) => acc.split(k).join(v),
      s
    );

    const options = templates.filter((t) => t.is_enabled).map((t) => ({
      id: t.id,
      label: t.name || t.status_trigger,
      isDefault: t.id === template.id,
      subject: apply(t.subject),
      bodyHtml: apply(t.body_html),
      scheduleFor: t.delay_hours > 0 ? addMinutes(new Date(), t.delay_hours).toISOString() : undefined,
    }));

    return {
      applicantId: candidate.id,
      templateId: template.id,
      candidateName: candidate.full_name || '',
      recipientEmail,
      newStatus,
      subject: apply(template.subject),
      bodyHtml: apply(template.body_html),
      templateOptions: options,
      scheduleFor: template.delay_hours > 0
        ? addMinutes(new Date(), template.delay_hours).toISOString()
        : undefined,
    };
  }, [getDefaultTemplateByTrigger, templates]);

  const sendStatusEmail = useCallback(async (
    payload: { applicantId: string; templateId: string; recipientEmail: string; newStatus: string; candidateName: string; scheduleFor?: string },
    subject: string,
    bodyHtml: string,
    cc?: string[],
    sendAsEmail?: string,
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-applicant-email', {
        body: {
          applicantId: payload.applicantId,
          templateId: payload.templateId,
          subject,
          bodyHtml,
          recipientEmail: payload.recipientEmail,
          applicantStatusAtSend: payload.newStatus,
          isAutomated: !sendAsEmail,
          scheduleFor: payload.scheduleFor,
          cc: cc && cc.length > 0 ? cc : undefined,
          sendAsEmail,
        },
      });

      if (error) throw error;
      if (data?.scheduled) {
        toast.success(`Email scheduled for ${payload.candidateName}`);
      } else {
        toast.success(`Email sent to ${payload.candidateName}`);
      }
    } catch (err: any) {
      console.error('Automated email failed:', err);
      toast.error(`Status updated, but email failed for ${payload.candidateName}`);
    }
  }, []);

  // Bulk moves keep the fire-and-forget behavior (no per-candidate dialog).
  const triggerStatusEmail = useCallback(async (candidate: Candidate, newStatus: string) => {
    const payload = buildStatusEmail(candidate, newStatus);
    if (!payload) return;
    await sendStatusEmail(payload, payload.subject, payload.bodyHtml);
  }, [buildStatusEmail, sendStatusEmail]);


  // ---- Multi-select (bulk action) state ----
  // Selection is locked to a single stage at a time. Switching to a card in a
  // different stage clears the prior selection and starts a fresh one.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionStage, setSelectionStage] = useState<string | null>(null);
  const [bulkMoving, setBulkMoving] = useState(false);

  // Lasso (drag-to-select) state. Only active for one column at a time.
  const [lasso, setLasso] = useState<{
    stage: string;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    additive: boolean;
    baseSelection: Set<string>;
  } | null>(null);
  const lassoContainerRef = useRef<HTMLDivElement | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionStage(null);
  }, []);

  // Toggle a single card's selection (called on Ctrl/Cmd+click).
  // Selection is now free across any stage and role.
  const toggleCardSelection = useCallback((candidate: Candidate) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
      } else {
        next.add(candidate.id);
      }
      if (next.size === 0) {
        setSelectionStage(null);
      } else {
        // Track the most-recently-clicked card's stage for the bulk action label.
        setSelectionStage(candidate.status);
      }
      return next;
    });
  }, []);
  const [selectedAdmin, setSelectedAdmin] = useState<string>(() => {
    return searchParams.get('admin') || 'all';
  });
  const [adminList, setAdminList] = useState<{ id: string; name: string }[]>([]);
  const [adminJobTitlesMap, setAdminJobTitlesMap] = useState<Record<string, string[]>>({});
  const [roleClientMap, setRoleClientMap] = useState<Record<string, string>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [tagFilterSearch, setTagFilterSearch] = useState('');
  const [selectedSuitableRoles, setSelectedSuitableRoles] = useState<string[]>([]);
  const [suitableRoleFilterOpen, setSuitableRoleFilterOpen] = useState(false);
  const [suitableRoleFilterSearch, setSuitableRoleFilterSearch] = useState('');
  const [profileSearch, setProfileSearch] = useState('');
  const [appliedProfileSearch, setAppliedProfileSearch] = useState('');
  const [profileTextMap, setProfileTextMap] = useState<Map<string, string>>(new Map());

  // Cache fully-enriched candidate lists keyed by `${role}|${jobFilter}|${admin}`.
  // Persisted to sessionStorage so refreshes within the same tab session
  // also hit the cache instead of waiting on the 3-phase fetch.
  const SS_CACHE_KEY = 'rkf:candidate-cache:v1';
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  const candidateCacheRef = useRef<Map<string, { data: Candidate[]; ts: number }>>(
    (() => {
      if (typeof window === 'undefined') return new Map();
      try {
        const raw = sessionStorage.getItem(SS_CACHE_KEY);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw) as Record<string, { data: Candidate[]; ts: number }>;
        const map = new Map<string, { data: Candidate[]; ts: number }>();
        const now = Date.now();
        for (const [k, v] of Object.entries(parsed)) {
          // Drop ancient entries (>30 min) to bound storage size.
          if (v && Array.isArray(v.data) && now - v.ts < 30 * 60 * 1000) {
            map.set(k, v);
          }
        }
        return map;
      } catch {
        return new Map();
      }
    })()
  );

  // Debounced persist to sessionStorage to avoid serializing on every set.
  const persistCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistCache = useCallback(() => {
    if (persistCacheTimerRef.current) clearTimeout(persistCacheTimerRef.current);
    persistCacheTimerRef.current = setTimeout(() => {
      try {
        const obj: Record<string, { data: Candidate[]; ts: number }> = {};
        candidateCacheRef.current.forEach((v, k) => { obj[k] = v; });
        sessionStorage.setItem(SS_CACHE_KEY, JSON.stringify(obj));
      } catch {
        // Quota exceeded — non-fatal.
      }
    }, 300);
  }, []);

  // Sync filter state to URL search params
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      // Role
      if (selectedRole && selectedRole !== ALL_ROLES_KEY) {
        next.set('role', selectedRole);
      } else {
        next.delete('role');
      }
      // Admin
      if (selectedAdmin && selectedAdmin !== 'all') {
        next.set('admin', selectedAdmin);
      } else {
        next.delete('admin');
      }
      // Job filter
      if (jobFilter === 'all' || jobFilter === 'inactive') {
        next.set('jobs', jobFilter);
      } else {
        next.delete('jobs');
      }
      return next;
    }, { replace: true });
    // Clear selection when context changes — selected IDs may no longer be visible.
    clearSelection();
  }, [selectedRole, selectedAdmin, jobFilter, setSearchParams, clearSelection]);

  const updateCandidateStageInState = useCallback((candidateId: string, newStage: string) => {
    const movedAt = new Date().toISOString();
    setCandidates(prev => prev.map(candidate => (
      candidate.id === candidateId
        ? { ...candidate, status: newStage, stage_entered_at: movedAt }
        : candidate
    )));
    // Keep cached views consistent so switching admin doesn't show stale stages.
    candidateCacheRef.current.forEach((entry, key) => {
      const updated = entry.data.map(candidate => (
        candidate.id === candidateId
          ? { ...candidate, status: newStage, stage_entered_at: movedAt }
          : candidate
      ));
      candidateCacheRef.current.set(key, { data: updated, ts: entry.ts });
    });
    persistCache();
  }, [persistCache]);

  // Fetch active job titles and admin assignments independently
  useEffect(() => {
    const fetchJobs = async () => {
      const [activeResult, allResult] = await Promise.all([
        supabase.from('jobs').select('title, assigned_admin_id, client_id').eq('is_active', true).order('title'),
        supabase.from('jobs').select('title, assigned_admin_id, client_id').order('title'),
      ]);

      // Map role title -> client company name (internal visibility only)
      const { data: clientRows } = await supabase.from('clients').select('id, company_name');
      const clientNameById = new Map((clientRows || []).map((c: any) => [c.id, c.company_name]));
      const roleClients: Record<string, string> = {};
      for (const j of [...(allResult.data || []), ...(activeResult.data || [])]) {
        const name = (j as any).client_id ? clientNameById.get((j as any).client_id) : null;
        if (j.title && name) roleClients[j.title] = name;
      }
      setRoleClientMap(roleClients);
      const filterTitle = (data: any[]) => (data || []).map(j => j.title).filter(t => t && !/^\$?\d+(\.\d+)?$/.test(t.trim()));
      setActiveRoles(filterTitle(activeResult.data));
      setAllRoles(filterTitle(allResult.data));

      // Build admin list and admin-to-job-titles map
      const adminMap = new Map<string, string[]>();
      for (const j of [...(activeResult.data || []), ...(allResult.data || [])]) {
        if (j.assigned_admin_id && j.title) {
          if (!adminMap.has(j.assigned_admin_id)) adminMap.set(j.assigned_admin_id, []);
          const titles = adminMap.get(j.assigned_admin_id)!;
          if (!titles.includes(j.title)) titles.push(j.title);
        }
      }
      const admins = Array.from(adminMap.keys()).map(id => ({
        id,
        name: getAdminDisplayName(id, id.slice(0, 8)),
      }));
      admins.sort((a, b) => a.name.localeCompare(b.name));
      setAdminList(admins);
      setAdminJobTitlesMap(Object.fromEntries(adminMap));
    };
    fetchJobs();
    const onJobUpdated = () => {
      // Job/admin assignment changed elsewhere: drop cached candidate lists so
      // the newly assigned admin's pipeline rebuilds from fresh data.
      candidateCacheRef.current.clear();
      try { sessionStorage.removeItem(SS_CACHE_KEY); } catch { /* ignore */ }
      fetchJobs();
    };
    window.addEventListener('job-updated', onJobUpdated);
    return () => window.removeEventListener('job-updated', onJobUpdated);
  }, []);



  const filteredRoles = useMemo(() => {
    let base: string[];
    if (jobFilter === 'active') {
      base = activeRoles;
    } else if (jobFilter === 'inactive') {
      const activeSet = new Set(activeRoles);
      base = allRoles.filter(r => !activeSet.has(r));
    } else {
      base = allRoles;
    }
    if (selectedAdmin && selectedAdmin !== 'all') {
      const adminTitles = new Set(adminJobTitlesMap[selectedAdmin] || []);
      return base.filter(r => adminTitles.has(r));
    }
    return base;
  }, [activeRoles, allRoles, jobFilter, selectedAdmin, adminJobTitlesMap]);

  const inactiveRolesSet = useMemo(() => {
    const activeSet = new Set(activeRoles);
    return new Set(allRoles.filter(r => !activeSet.has(r)));
  }, [activeRoles, allRoles]);

  // If a specific role is selected but no longer in the list, reset to all.
  // Wait until roles have actually loaded to avoid resetting on initial mount/refresh.
  useEffect(() => {
    const rolesLoaded = activeRoles.length > 0 || allRoles.length > 0;
    if (!rolesLoaded) return;
    if (selectedRole && selectedRole !== ALL_ROLES_KEY && !filteredRoles.includes(selectedRole)) {
      setSelectedRole(ALL_ROLES_KEY);
    }
  }, [filteredRoles, activeRoles, allRoles]);

  // Notify parent when selected role changes
  useEffect(() => {
    if (selectedRole && selectedRole !== ALL_ROLES_KEY) _onRoleSelect?.(selectedRole);
  }, [selectedRole, _onRoleSelect]);

  // Notify parent of full filter context (role + jobFilter + admin), including "All Roles".
  // adminScopedRoles is the list of roles assigned to the selected admin (or null when "all").
  useEffect(() => {
    const adminScopedRoles = selectedAdmin && selectedAdmin !== 'all'
      ? (adminJobTitlesMap[selectedAdmin] || [])
      : null;
    onFiltersChange?.({ role: selectedRole, jobFilter, selectedAdmin, adminScopedRoles });
  }, [selectedRole, jobFilter, selectedAdmin, adminJobTitlesMap, onFiltersChange]);

  const fetchCandidates = useCallback(async (role: string) => {
    if (!role) return;

    // Build a cache key from the inputs that affect the result set.
    const cacheKey = `${role}|${jobFilter}|${selectedAdmin}|${
      role === ALL_ROLES_KEY ? filteredRoles.slice().sort().join(',') : ''
    }`;
    const cached = candidateCacheRef.current.get(cacheKey);
    const now = Date.now();
    const isFresh = cached && (now - cached.ts) < CACHE_TTL_MS;

    if (cached) {
      // Render cached data instantly — no spinner, no waiting.
      setCandidates(cached.data);
      setLoading(false);
      // If still fresh, skip the network entirely.
      if (isFresh) return;
      // Stale cache: fall through to silent background refresh (no spinner).
    } else {
      setLoading(true);
    }

    const batchSize = 1000;

    // Two-phase load:
    //  Phase 1 (priority): active funnel stages — render immediately
    //  Phase 2 (background): Reject / Archive (filtered) + Bench / Talent Pool
    //  Bench/Talent Pool ignore the admin filter, but DO respect the selected
    //  role and the Active/All/Inactive jobs filter.
    const PRIORITY_STATUSES = ['For Review', 'Qualified', 'For Interview', 'SIV', 'Pitch', 'Client Interview', 'Hired'];
    const BACKGROUND_STATUSES = ['Reject', 'Archive', 'Archived'];
    const UNFILTERED_STATUSES = ['Bench', 'Talent Pool', 'Cold Talent Pool'];

    const fetchUnfilteredByStatuses = async (statuses: string[]): Promise<any[]> => {
      // Determine which roles to include based on the selected role and jobFilter
      // (active/all/inactive). This mirrors fetchByStatuses but ignores the admin
      // filter so Bench/Talent Pool still span all admins.
      let rolesToFetch: string[] | null = null;
      if (role !== ALL_ROLES_KEY) {
        rolesToFetch = [role];
      } else if (jobFilter === 'active') {
        rolesToFetch = activeRoles;
      } else if (jobFilter === 'inactive') {
        const activeSet = new Set(activeRoles);
        rolesToFetch = allRoles.filter(r => !activeSet.has(r));
      }
      // jobFilter === 'all' → rolesToFetch stays null (no role restriction)

      if (rolesToFetch && rolesToFetch.length === 0) return [];

      let collected: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from('applicants_prescreen')
          .select('id, full_name, email, phone, location, status, pre_archive_status, submitted_at, total_score, job_title, job_id, cv_file_url, is_starred, interview_invite_sent_at, tags, suitable_roles')
          .in('status', statuses);
        if (rolesToFetch) {
          q = q.in('job_title', rolesToFetch);
        }
        const { data } = await q
          .order('total_score', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        collected = collected.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return collected;
    };

    const fetchByStatuses = async (statuses: string[]): Promise<any[]> => {
      if (role === ALL_ROLES_KEY) {
        const rolesToFetch = filteredRoles.length > 0
          ? filteredRoles
          : (jobFilter === 'active' ? activeRoles : allRoles);
        if (rolesToFetch.length === 0) return [];
        let collected: any[] = [];
        let from = 0;
        while (true) {
          const { data } = await supabase
            .from('applicants_prescreen')
            .select('id, full_name, email, phone, location, status, pre_archive_status, submitted_at, total_score, job_title, job_id, cv_file_url, is_starred, interview_invite_sent_at, tags, suitable_roles')
            .in('job_title', rolesToFetch)
            .in('status', statuses)
            .order('total_score', { ascending: false, nullsFirst: false })
            .order('id', { ascending: true })
            .range(from, from + batchSize - 1);
          if (!data || data.length === 0) break;
          collected = collected.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return collected;
      } else {
        const { data } = await supabase
          .from('applicants_prescreen')
          .select('id, full_name, email, phone, location, status, pre_archive_status, submitted_at, total_score, job_title, job_id, cv_file_url, is_starred, interview_invite_sent_at, tags, suitable_roles')
          .eq('job_title', role)
          .in('status', statuses)
          .order('total_score', { ascending: false, nullsFirst: false });
        return data || [];
      }
    };

    // Guard against the same applicant appearing twice (range pagination can
    // repeat rows when scores tie, and phases could overlap).
    const dedupeById = (rows: any[]) => {
      const seen = new Set<string>();
      return rows.filter(r => (r?.id && !seen.has(r.id)) ? (seen.add(r.id), true) : false);
    };

    const mapToCandidate = (rows: any[]) => dedupeById(rows).map(a => ({
      ...a,
      is_starred: a.is_starred ?? false,
      interview_invite_sent_at: a.interview_invite_sent_at ?? null,
      tags: Array.isArray(a.tags) ? a.tags : [],
      suitable_roles: Array.isArray((a as any).suitable_roles) ? (a as any).suitable_roles : [],
      interview_overall_score: null,
      interview_status: null,
      interview_started_at: null,
      stage_entered_at: a.submitted_at,
    }));

    // Fire ALL phases in parallel. The previous two-phase approach starved the
    // background fetch behind per-card duplicate-check N+1 queries from
    // useApplicationHistory, leaving Bench / Talent Pipeline / Reject columns
    // visibly empty for many seconds.
    const priorityPromise = fetchByStatuses(PRIORITY_STATUSES);
    const backgroundPromise = fetchByStatuses(BACKGROUND_STATUSES);
    const unfilteredPromise = fetchUnfilteredByStatuses(UNFILTERED_STATUSES);

    // Paint priority data as soon as it lands so the active funnel stays snappy.
    const priorityData = await priorityPromise;
    if (!cached) {
      setCandidates(mapToCandidate(priorityData));
      setLoading(false);
    }

    const [backgroundData, unfilteredData] = await Promise.all([
      backgroundPromise,
      unfilteredPromise,
    ]);
    const allData = [...priorityData, ...backgroundData, ...unfilteredData];
    if (!cached) setCandidates(mapToCandidate(allData));

    const applicantIds = allData.map(a => a.id);
    if (applicantIds.length === 0) {
      candidateCacheRef.current.set(cacheKey, { data: [], ts: Date.now() });
      persistCache();
      return;
    }

    // Build batches and run them in parallel (sessions + history per batch)
    const batches: string[][] = [];
    for (let i = 0; i < applicantIds.length; i += 200) {
      batches.push(applicantIds.slice(i, i + 200));
    }

    const interviewScores: Record<string, number> = {};
    const interviewMeta: Record<string, { status: string; started_at: string }> = {};
    const stageEnteredMap: Record<string, string> = {};

    // Phase 3: enrichment — yield again before kicking off the parallel batches.
    await priorityGate.wait();
    await Promise.all(batches.map(async (batch) => {
      // Yield per-batch too, so a dialog opening mid-enrichment still wins.
      await priorityGate.wait();
      const [sessionsRes, historyRes] = await Promise.all([
        supabase
          .from('interview_sessions')
          .select('applicant_id, overall_score, status, started_at')
          .in('applicant_id', batch)
          .order('created_at', { ascending: false }),
        supabase
          .from('applicant_status_history')
          .select('applicant_id, created_at')
          .in('applicant_id', batch)
          .order('created_at', { ascending: false }),
      ]);

      for (const s of sessionsRes.data || []) {
        if (!(s.applicant_id in interviewMeta)) {
          interviewMeta[s.applicant_id] = { status: s.status, started_at: s.started_at };
        }
        if (s.overall_score != null && !(s.applicant_id in interviewScores)) {
          interviewScores[s.applicant_id] = s.overall_score;
        }
      }
      for (const h of historyRes.data || []) {
        if (!(h.applicant_id in stageEnteredMap)) {
          stageEnteredMap[h.applicant_id] = h.created_at;
        }
      }
    }));

    const enriched = mapToCandidate(allData).map(a => ({
      ...a,
      interview_overall_score: interviewScores[a.id] ?? null,
      interview_status: interviewMeta[a.id]?.status ?? null,
      interview_started_at: interviewMeta[a.id]?.started_at ?? null,
      stage_entered_at: stageEnteredMap[a.id] || a.submitted_at,
    }));

    // Cache the fully-enriched result and swap it in.
    candidateCacheRef.current.set(cacheKey, { data: enriched, ts: Date.now() });
    persistCache();
    setCandidates(enriched);
  }, [activeRoles, allRoles, jobFilter, filteredRoles, selectedAdmin, persistCache]);

  // Signature of the role set currently in scope (changes when a job's assigned
  // admin changes, so the selected admin's pipeline refetches instead of
  // showing the roles/candidates from the previous assignment).
  const filteredRolesKey = useMemo(() => filteredRoles.slice().sort().join(','), [filteredRoles]);

  useEffect(() => {
    if (selectedRole === ALL_ROLES_KEY && activeRoles.length === 0 && allRoles.length === 0) return;
    if (selectedRole) fetchCandidates(selectedRole);
    // Intentionally exclude fetchCandidates from deps: it changes whenever
    // filteredRoles/jobFilter recompute, which would cause redundant refetches
    // while the user sits on the page (e.g., admin map loading in stages).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, jobFilter, selectedAdmin, activeRoles.length, allRoles.length, filteredRolesKey]);


  // Fetch which loaded candidates have profiles (primary or additional)
  useEffect(() => {
    if (candidates.length === 0) {
      setAdditionalProfileIds(new Set());
      setPrimaryProfileIds(new Set());
      return;
    }
    let cancelled = false;
    const ids = candidates.map(c => c.id);
    (async () => {
      const foundAdditional = new Set<string>();
      const foundPrimary = new Set<string>();
      const textMap = new Map<string, string>();
      const chunk = 500;
      for (let i = 0; i < ids.length; i += chunk) {
        const batch = ids.slice(i, i + chunk);
        const [{ data: addData }, { data: primData }] = await Promise.all([
          supabase.from('candidate_additional_profiles').select('applicant_id, title, content').in('applicant_id', batch),
          supabase.from('applicants_prescreen').select('id, candidate_profile').in('id', batch),
        ]);
        for (const row of addData || []) {
          foundAdditional.add(row.applicant_id);
          const prev = textMap.get(row.applicant_id) || '';
          const extra = `${(row as any).title || ''}\n${(row as any).content || ''}`;
          textMap.set(row.applicant_id, prev ? `${prev}\n${extra}` : extra);
        }
        for (const row of primData || []) {
          const p = (row as { id: string; candidate_profile: string | null }).candidate_profile;
          const id = (row as { id: string }).id;
          if (p && String(p).trim().length > 0) {
            foundPrimary.add(id);
            const prev = textMap.get(id) || '';
            textMap.set(id, prev ? `${prev}\n${p}` : p);
          }
        }
      }
      if (!cancelled) {
        setAdditionalProfileIds(foundAdditional);
        setPrimaryProfileIds(foundPrimary);
        setProfileTextMap(textMap);
      }
    })();
    return () => { cancelled = true; };
  }, [candidates]);



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
      toast.error(getErrorMessageSync(error, 'Failed to move candidate'));
      return;
    }

    toast.success(`Moved ${candidate.full_name} to ${newStage}`);
    // Ask the admin to review/edit the stage email before sending
    const payload = buildStatusEmail(candidate, newStage);
    if (payload) {
      setPendingStageEmail(payload);
    } else {
      setStageNote({ applicantId: candidate.id, candidateName: candidate.full_name, newStatus: newStage });
    }
  }, [updateCandidateStageInState, buildStatusEmail]);

  // Bulk move: update every selected candidate to the target stage in one DB call,
  // then optimistically update local state. Skips "Hired" because that requires
  // the per-candidate assignment dialog.
  const handleBulkMoveToStage = useCallback(async (newStage: string) => {
    if (newStage === 'Hired') {
      toast.error('Move candidates to Hired one at a time (assignment dialog required).');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkMoving(true);

    // Snapshot previous statuses for rollback
    const prevById = new Map<string, string>();
    candidates.forEach(c => { if (selectedIds.has(c.id)) prevById.set(c.id, c.status); });

    // Optimistic update
    ids.forEach(id => updateCandidateStageInState(id, newStage));

    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ status: newStage })
      .in('id', ids);

    setBulkMoving(false);

    if (error) {
      // Rollback
      prevById.forEach((prevStatus, id) => updateCandidateStageInState(id, prevStatus));
      toast.error(getErrorMessageSync(error, 'Failed to move selected candidates'));
      return;
    }

    toast.success(`Moved ${ids.length} candidate${ids.length === 1 ? '' : 's'} to ${newStage}`);
    // Fire automated emails for each moved candidate
    const movedCandidates = candidates.filter(c => ids.includes(c.id));
    movedCandidates.forEach(c => triggerStatusEmail(c, newStage));
    clearSelection();
  }, [selectedIds, candidates, updateCandidateStageInState, clearSelection, triggerStatusEmail]);



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
      toast.error(getErrorMessageSync(insertError, 'Failed to delete applicant'));
      return;
    }

    await supabase.from('applicants_prescreen').delete().eq('id', candidate.id);
    setCandidates(prev => prev.filter(c => c.id !== candidate.id));
    toast.success(`Deleted ${candidate.full_name}`);
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (Array.isArray(c.tags)) c.tags.forEach(t => t && set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const allSuitableRoles = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (Array.isArray(c.suitable_roles)) c.suitable_roles.forEach(r => r && set.add(r));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const handleTagsUpdated = useCallback((id: string, tags: string[]) => {
    setCandidates(prev => prev.map(c => (c.id === id ? { ...c, tags } : c)));
  }, []);

  const handleSuitableRolesUpdated = useCallback((id: string, suitable_roles: string[]) => {
    setCandidates(prev => prev.map(c => (c.id === id ? { ...c, suitable_roles } : c)));
  }, []);

  const handleReprofiled = useCallback(() => {
    fetchCandidates(selectedRole);
  }, [fetchCandidates, selectedRole]);


  const filteredCandidates = useMemo(() => {
    let result = candidates;

    // Filter by admin
    if (selectedAdmin !== 'all') {
      const adminJobTitles = adminJobTitlesMap[selectedAdmin] || [];
      result = result.filter(c => adminJobTitles.includes(c.job_title));
    }

    if (candidateSearch.trim()) {
      const term = candidateSearch.toLowerCase();
      result = result.filter(c =>
        c.full_name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        (c.location && c.location.toLowerCase().includes(term))
      );
    }

    if (selectedTags.length > 0) {
      const wanted = new Set(selectedTags.map(t => t.toLowerCase()));
      result = result.filter(c =>
        Array.isArray(c.tags) && c.tags.some(t => wanted.has(String(t).toLowerCase()))
      );
    }

    if (selectedSuitableRoles.length > 0) {
      const wanted = new Set(selectedSuitableRoles.map(r => r.toLowerCase()));
      result = result.filter(c =>
        Array.isArray(c.suitable_roles) && c.suitable_roles.some(r => wanted.has(String(r).toLowerCase()))
      );
    }

    if (appliedProfileSearch.trim()) {
      // Split on comma or whitespace so users can search multiple terms (AND match).
      const terms = appliedProfileSearch
        .toLowerCase()
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(Boolean);
      if (terms.length > 0) {
        result = result.filter(c => {
          const text = (profileTextMap.get(c.id) || '').toLowerCase();
          if (!text) return false;
          return terms.every(t => text.includes(t));
        });
      }
    }
    return result;
  }, [candidates, candidateSearch, selectedAdmin, adminJobTitlesMap, selectedTags, selectedSuitableRoles, appliedProfileSearch, profileTextMap]);

  const stageGroups = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    for (const stage of orderedFunnelStages) {
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
        case 'score-desc': {
          // Candidates who completed the assessment rank above those who didn't
          const aDone = a.interview_overall_score !== null ? 1 : 0;
          const bDone = b.interview_overall_score !== null ? 1 : 0;
          if (bDone !== aDone) return bDone - aDone;
          if (aDone && bDone) {
            const diff = (b.interview_overall_score ?? -1) - (a.interview_overall_score ?? -1);
            if (diff !== 0) return diff;
          }
          return (b.total_score ?? -1) - (a.total_score ?? -1);
        }
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
    const hasAnyProfile = (c: Candidate) =>
      additionalProfileIds.has(c.id) || primaryProfileIds.has(c.id);
    // Pin candidates with profiles only for score-based sorts; name/date sorts must be pure
    const pinProfiles = sortOption === 'score-desc' || sortOption === 'score-asc' || sortOption === 'assessed';
    for (const stage of orderedFunnelStages) {
      groups[stage].sort((a, b) => {
        if (pinProfiles) {
          // Pin candidates with any profile (primary or additional) to the top of each stage
          const aHasP = hasAnyProfile(a) ? 1 : 0;
          const bHasP = hasAnyProfile(b) ? 1 : 0;
          if (bHasP !== aHasP) return bHasP - aHasP;
        }
        return sortFn(a, b);
      });
    }

    return groups;
  }, [filteredCandidates, sortOption, additionalProfileIds, primaryProfileIds, orderedFunnelStages]);

  const totalInPipeline = useMemo(
    () => Object.values(stageGroups).reduce((sum, arr) => sum + arr.length, 0),
    [stageGroups]
  );

  // A selected role can have applicants only in stages beyond the initial
  // viewport (for example Talent Pool or Reject). Reveal the first populated
  // stage once per filter result so the board never appears falsely empty.
  useEffect(() => {
    if (loading || totalInPipeline === 0) return;

    const firstPopulatedStage = orderedFunnelStages.find(
      stage => stageGroups[stage]?.length > 0
    );
    if (!firstPopulatedStage) return;

    const revealKey = `${selectedRole}|${selectedAdmin}|${jobFilter}|${filteredRolesKey}|${firstPopulatedStage}`;
    if (lastAutoRevealKeyRef.current === revealKey) return;
    lastAutoRevealKeyRef.current = revealKey;

    const container = pipelineScrollRef.current;
    const stageColumn = container?.querySelector<HTMLElement>(
      `[data-pipeline-stage="${CSS.escape(firstPopulatedStage)}"]`
    );
    if (!container || !stageColumn) return;

    const stageLeft = stageColumn.offsetLeft;
    const stageRight = stageLeft + stageColumn.offsetWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    if (stageLeft < visibleLeft || stageRight > visibleRight) {
      container.scrollTo({ left: Math.max(0, stageLeft - 12), behavior: 'smooth' });
    }
  }, [loading, totalInPipeline, orderedFunnelStages, stageGroups, selectedRole, selectedAdmin, jobFilter, filteredRolesKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Role Pipeline</h2>
          <Badge variant="secondary">{totalInPipeline} candidates</Badge>
        </div>

        <div className="flex items-center gap-2">

        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search & select role..."
              value={dropdownOpen ? roleSearch : (selectedRole === ALL_ROLES_KEY ? 'All Roles' : selectedRole)}
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
            {selectedRole && selectedRole !== ALL_ROLES_KEY && !dropdownOpen && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRole(ALL_ROLES_KEY);
                  setRoleSearch('');
                }}
              >
                ✕
              </button>
            )}
          </div>
          {dropdownOpen && (
            <div
              className="absolute z-50 mt-1 w-[320px] rounded-md border bg-popover shadow-md overflow-hidden"
              onMouseDown={(e) => e.preventDefault()}
            >
              <ScrollArea className="max-h-[300px] overflow-y-auto">
                <div className="p-1">
                  <button
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors font-medium',
                      selectedRole === ALL_ROLES_KEY && 'bg-accent/50'
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelectedRole(ALL_ROLES_KEY);
                      setDropdownOpen(false);
                      setRoleSearch('');
                    }}
                  >
                    All Roles
                  </button>
                  {filteredRoles
                    .filter((r) => {
                      const q = roleSearch.toLowerCase();
                      return r.toLowerCase().includes(q) || (roleClientMap[r] || '').toLowerCase().includes(q);
                    })
                    .sort((a, b) => a.localeCompare(b))
                    .map((role) => (
                      <button
                        key={role}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                          selectedRole === role && 'bg-accent/50 font-medium'
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedRole(role);
                          setDropdownOpen(false);
                          setRoleSearch('');
                        }}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{role}</span>
                          {roleClientMap[role] && (
                            <span className="shrink-0 text-xs text-muted-foreground truncate max-w-[45%]">
                              {roleClientMap[role]}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  {filteredRoles.filter((r) => {
                    const q = roleSearch.toLowerCase();
                    return r.toLowerCase().includes(q) || (roleClientMap[r] || '').toLowerCase().includes(q);
                  }).length === 0 && (
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
                setCandidateSearch(e.target.value);
              }}
              className="pl-8 h-9 w-[260px] text-sm border-blue-400 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
            <Input
              placeholder="Skills / Tools / Proficiency..."
              value={profileSearch}
              onChange={(e) => setProfileSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setAppliedProfileSearch(profileSearch);
                }
              }}
              onBlur={() => setAppliedProfileSearch(profileSearch)}
              className={cn(
                "pl-8 h-9 w-[240px] text-sm border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500",
                appliedProfileSearch !== profileSearch && profileSearch.trim() && "pr-16"
              )}
              title="Scans candidate profile text. Press Enter. Space or comma separated = AND match."
            />
            {appliedProfileSearch !== profileSearch && profileSearch.trim() && (
              <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded pointer-events-none">
                Enter
              </span>
            )}
            {(profileSearch || appliedProfileSearch) && (
              <button
                onClick={() => { setProfileSearch(''); setAppliedProfileSearch(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear profile search"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={selectedAdmin}
            onChange={(e) => setSelectedAdmin(e.target.value)}
            className="h-9 text-sm rounded-md border border-input bg-background px-3 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Admins</option>
            {adminList.map(admin => (
              <option key={admin.id} value={admin.id}>{admin.name}</option>
            ))}
          </select>

          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value as 'active' | 'all' | 'inactive')}
            className="h-9 text-sm rounded-md border border-input bg-background px-3 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="active">Active Jobs</option>
            <option value="all">All Jobs</option>
            <option value="inactive">Inactive Jobs</option>
          </select>

          <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 gap-1.5 text-sm",
                  selectedTags.length > 0 && "border-primary text-primary"
                )}
              >
                <TagIcon className="w-3.5 h-3.5" />
                Tags
                {selectedTags.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                    {selectedTags.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold">Filter by tag</p>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                placeholder="Search tags..."
                value={tagFilterSearch}
                onChange={(e) => setTagFilterSearch(e.target.value)}
                className="h-8 text-xs mb-2"
              />
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {allTags.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No tags yet. Right-click a candidate to add one.
                  </p>
                )}
                {allTags
                  .filter(t => t.toLowerCase().includes(tagFilterSearch.toLowerCase()))
                  .map(tag => {
                    const checked = selectedTags.includes(tag);
                    return (
                      <label
                        key={tag}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedTags(prev =>
                              v ? [...prev, tag] : prev.filter(t => t !== tag)
                            );
                          }}
                        />
                        <span className="flex-1 truncate">{tag}</span>
                      </label>
                    );
                  })}
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={suitableRoleFilterOpen} onOpenChange={setSuitableRoleFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 gap-1.5 text-sm",
                  selectedSuitableRoles.length > 0 && "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                )}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Suitable Role
                {selectedSuitableRoles.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                    {selectedSuitableRoles.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold">Filter by suitable role</p>
                {selectedSuitableRoles.length > 0 && (
                  <button
                    onClick={() => setSelectedSuitableRoles([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                placeholder="Search suitable roles..."
                value={suitableRoleFilterSearch}
                onChange={(e) => setSuitableRoleFilterSearch(e.target.value)}
                className="h-8 text-xs mb-2"
              />
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {allSuitableRoles.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No suitable roles yet. Right-click a candidate to add one.
                  </p>
                )}
                {allSuitableRoles
                  .filter(r => r.toLowerCase().includes(suitableRoleFilterSearch.toLowerCase()))
                  .map(role => {
                    const checked = selectedSuitableRoles.includes(role);
                    return (
                      <label
                        key={role}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedSuitableRoles(prev =>
                              v ? [...prev, role] : prev.filter(r => r !== role)
                            );
                          }}
                        />
                        <span className="flex-1 truncate">{role}</span>
                      </label>
                    );
                  })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {(selectedTags.length > 0 || selectedSuitableRoles.length > 0 || appliedProfileSearch.trim()) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">Filtering by:</span>
          {selectedTags.map(tag => (
            <Badge key={`t-${tag}`} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                className="hover:bg-background/60 rounded-sm p-0.5"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedSuitableRoles.map(role => (
            <Badge key={`sr-${role}`} variant="secondary" className="gap-1 pr-1 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
              {role}
              <button
                onClick={() => setSelectedSuitableRoles(prev => prev.filter(r => r !== role))}
                className="hover:bg-background/60 rounded-sm p-0.5"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : !selectedRole ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Select a role to view its pipeline.</p>
      ) : (
        <div ref={pipelineScrollRef} className="w-full overflow-x-auto">
          <div className="flex gap-3 pb-4 min-w-max">
            {orderedFunnelStages.map((stage) => {
              const colors = STAGE_COLORS[stage];
              const colorOverride = getStageColorOverride(stage);
              const stageCandidates = stageGroups[stage];


              return (
                <div
                  key={stage}
                  data-pipeline-stage={stage}
                  className={cn(
                    'flex flex-col w-[248px] shrink-0 rounded-lg border-2 overflow-hidden transition-all duration-150',
                    dropTargetStage === stage && draggedCandidate
                      ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                      : 'border-border/60',
                    !colorOverride && colors.bg
                  )}
                  style={colorOverride ? { backgroundColor: colorOverride + '14' } : undefined}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetStage(stage);
                  }}
                  onDragLeave={(e) => {
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
                  <div
                    className={cn('px-3 py-2.5 flex items-center justify-between', !colorOverride && colors.header)}
                    style={colorOverride ? { backgroundColor: colorOverride } : undefined}
                  >

                    <span className="text-sm font-semibold text-white">{getStageDisplayName(stage)}</span>
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

                  <div
                    className="flex-1 max-h-[720px] overflow-y-auto relative"
                    onMouseDown={(e) => {
                      // Lasso starts only on empty space (not on a card or interactive child).
                      // Bail out for right-click, Ctrl-click (treated as right-click on macOS),
                      // and when the mousedown landed on a card.
                      if (e.button !== 0) return;
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-candidate-card]')) return;
                      if (target.closest('button, a, input, select, textarea')) return;

                      const container = e.currentTarget as HTMLDivElement;
                      lassoContainerRef.current = container;
                      const rect = container.getBoundingClientRect();
                      const x = e.clientX - rect.left + container.scrollTop * 0; // x is horizontal only
                      const y = e.clientY - rect.top + container.scrollTop;
                      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                      // Always preserve existing selection across stages — the lasso
                      // adds to it. Holding shift/ctrl/cmd is no longer required.
                      setSelectionStage(stage);
                      setLasso({
                        stage,
                        startX: x,
                        startY: y,
                        curX: x,
                        curY: y,
                        additive: true,
                        baseSelection: new Set(selectedIds),
                      });
                      e.preventDefault();
                    }}
                    onMouseMove={(e) => {
                      if (!lasso || lasso.stage !== stage) return;
                      const container = lassoContainerRef.current;
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const curX = e.clientX - rect.left;
                      const curY = e.clientY - rect.top + container.scrollTop;
                      setLasso(l => l ? { ...l, curX, curY } : l);

                      // Compute selection rect (in container-local coords accounting for scroll)
                      const minX = Math.min(lasso.startX, curX);
                      const maxX = Math.max(lasso.startX, curX);
                      const minY = Math.min(lasso.startY, curY);
                      const maxY = Math.max(lasso.startY, curY);

                      // Intersect with each card's bounding box
                      const cards = container.querySelectorAll<HTMLElement>('[data-candidate-card]');
                      const hits = new Set<string>(lasso.baseSelection);
                      const containerRect = container.getBoundingClientRect();
                      cards.forEach(card => {
                        const cr = card.getBoundingClientRect();
                        const cardLeft = cr.left - containerRect.left;
                        const cardRight = cr.right - containerRect.left;
                        const cardTop = cr.top - containerRect.top + container.scrollTop;
                        const cardBottom = cr.bottom - containerRect.top + container.scrollTop;
                        const intersects = !(cardRight < minX || cardLeft > maxX || cardBottom < minY || cardTop > maxY);
                        if (intersects) {
                          const id = card.getAttribute('data-candidate-id');
                          if (id) hits.add(id);
                        }
                      });
                      setSelectedIds(hits);
                    }}
                    onMouseUp={() => {
                      if (lasso) setLasso(null);
                    }}
                    onMouseLeave={() => {
                      if (lasso) setLasso(null);
                    }}
                  >
                    {/* Lasso visual */}
                    {lasso && lasso.stage === stage && (
                      <div
                        className="absolute pointer-events-none border-2 border-primary bg-primary/10 rounded-sm z-10"
                        style={{
                          left: Math.min(lasso.startX, lasso.curX),
                          top: Math.min(lasso.startY, lasso.curY),
                          width: Math.abs(lasso.curX - lasso.startX),
                          height: Math.abs(lasso.curY - lasso.startY),
                        }}
                      />
                    )}
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
                            showRoleLabel={selectedRole === ALL_ROLES_KEY}
                            isInactiveRole={jobFilter === 'all' && inactiveRolesSet.has(candidate.job_title)}
                            isSelected={selectedIds.has(candidate.id)}
                            onSelectToggle={() => toggleCardSelection(candidate)}
                            hasAdditionalProfile={additionalProfileIds.has(candidate.id)}
                            hasPrimaryProfile={primaryProfileIds.has(candidate.id)}
                            knownTags={allTags}
                            onTagsUpdated={handleTagsUpdated}
                            knownSuitableRoles={allSuitableRoles}
                            onSuitableRolesUpdated={handleSuitableRolesUpdated}
                            onReprofiled={handleReprofiled}
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

      <StageEmailConfirmDialog
        pending={pendingStageEmail}
        onOpenChange={(open) => {
          if (!open && pendingStageEmail) {
            setStageNote({
              applicantId: pendingStageEmail.applicantId,
              candidateName: pendingStageEmail.candidateName,
              newStatus: pendingStageEmail.newStatus,
            });
            setPendingStageEmail(null);
          }
        }}
        onConfirm={async (subject, bodyHtml, cc, sendAsEmail, templateId) => {
          if (!pendingStageEmail) return;
          const chosen = pendingStageEmail.templateOptions?.find(o => o.id === templateId);
          await sendStatusEmail(
            { ...pendingStageEmail, templateId: templateId || pendingStageEmail.templateId, scheduleFor: chosen?.scheduleFor ?? pendingStageEmail.scheduleFor },
            subject, bodyHtml, cc, sendAsEmail,
          );

          setStageNote({
            applicantId: pendingStageEmail.applicantId,
            candidateName: pendingStageEmail.candidateName,
            newStatus: pendingStageEmail.newStatus,
          });
          setPendingStageEmail(null);
        }}
      />

      <StageNoteDialog
        pending={stageNote}
        onOpenChange={(open) => { if (!open) setStageNote(null); }}
      />




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

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border-2 border-primary shadow-2xl rounded-full pl-4 pr-2 py-2 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">
            <span className="text-primary font-bold">{selectedIds.size}</span> selected
            {selectionStage && (
              <span className="text-muted-foreground"> in {selectionStage}</span>
            )}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={bulkMoving}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {bulkMoving ? 'Moving…' : 'Move to stage'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              {orderedFunnelStages.filter(s => s !== selectionStage).map(stage => {
                const dotOverride = getStageColorOverride(stage);
                return (
                <DropdownMenuItem
                  key={stage}
                  disabled={stage === 'Hired'}
                  onClick={() => handleBulkMoveToStage(stage)}
                >
                  <span
                    className={cn('w-2 h-2 rounded-full mr-2', !dotOverride && STAGE_COLORS[stage]?.dot)}
                    style={dotOverride ? { backgroundColor: dotOverride } : undefined}
                  />
                  {getStageDisplayName(stage)}
                  {stage === 'Hired' && (
                    <span className="ml-auto text-[10px] text-muted-foreground">single only</span>
                  )}
                </DropdownMenuItem>
                );
              })}

            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={clearSelection}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
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
  showRoleLabel?: boolean;
  isInactiveRole?: boolean;
  isSelected?: boolean;
  onSelectToggle?: () => void;
  hasAdditionalProfile?: boolean;
  hasPrimaryProfile?: boolean;
  knownTags: string[];
  onTagsUpdated: (id: string, tags: string[]) => void;
  knownSuitableRoles: string[];
  onSuitableRolesUpdated: (id: string, roles: string[]) => void;
  onReprofiled: () => void;
}

const CandidateCard = ({ candidate, dotColor, currentStage, onMoveToStage, onToggleStar, onCopyEmail, onDelete, isDragging, onDragStart, onDragEnd, showRoleLabel, isInactiveRole, isSelected, onSelectToggle, hasAdditionalProfile, hasPrimaryProfile, knownTags, onTagsUpdated, knownSuitableRoles, onSuitableRolesUpdated, onReprofiled }: CandidateCardProps) => {
  const { getDisplayName: getStageDisplayName } = useStageSettings();
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

  // Lazy-mount: track which dialogs have ever been opened. We only render
  // a dialog component into the tree after the user opens it the first time.
  // This avoids mounting 8 hidden dialogs per card (thousands across the
  // pipeline), which was inflating render time and DOM/heap considerably.
  const [mountDetails, setMountDetails] = useState(false);
  const [mountSendEmail, setMountSendEmail] = useState(false);
  const [mountHistory, setMountHistory] = useState(false);
  const [mountInvite, setMountInvite] = useState(false);
  const [mountCvPreview, setMountCvPreview] = useState(false);
  const [mountInterviewResults, setMountInterviewResults] = useState(false);
  const [mountProfile, setMountProfile] = useState(false);
  const [mountActivity, setMountActivity] = useState(false);
  const [mountTags, setMountTags] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const openTags = useCallback(() => { setMountTags(true); setShowTags(true); }, []);
  const [mountSuitable, setMountSuitable] = useState(false);
  const [showSuitable, setShowSuitable] = useState(false);
  const openSuitable = useCallback(() => { setMountSuitable(true); setShowSuitable(true); }, []);
  const [mountReprofile, setMountReprofile] = useState(false);
  const [showReprofile, setShowReprofile] = useState(false);
  const [reprofileOrigin, setReprofileOrigin] = useState<{ original_job_id: string | null; original_job_title: string | null }>({ original_job_id: null, original_job_title: null });
  const openReprofile = useCallback(async () => {
    setMountReprofile(true);
    setShowReprofile(true);
    const { data } = await supabase
      .from('applicants_prescreen')
      .select('original_job_id, original_job_title')
      .eq('id', candidate.id)
      .maybeSingle();
    if (data) setReprofileOrigin({ original_job_id: data.original_job_id, original_job_title: data.original_job_title });
  }, [candidate.id]);



  const [mountCalendar, setMountCalendar] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const openCalendar = useCallback(() => { setMountCalendar(true); setShowCalendar(true); }, []);

  const openDetails = useCallback(() => { setMountDetails(true); setShowDetails(true); }, []);
  const openSendEmail = useCallback(() => { setMountSendEmail(true); setShowSendEmail(true); }, []);
  const openHistory = useCallback(() => { setMountHistory(true); setShowHistory(true); }, []);
  const openInvite = useCallback(() => { setMountInvite(true); setShowInvite(true); }, []);
  const openCvPreview = useCallback(() => { setMountCvPreview(true); setShowCvPreview(true); }, []);
  const openInterviewResults = useCallback(() => { setMountInterviewResults(true); setShowInterviewResults(true); }, []);
  const openProfile = useCallback(() => { setMountProfile(true); setShowProfile(true); }, []);
  const openActivity = useCallback(() => { setMountActivity(true); setShowActivity(true); }, []);

  const [sendingPrepitch, setSendingPrepitch] = useState(false);
  const sendPrepitch = useCallback(async () => {
    if (!candidate.email) return toast.error('Applicant has no email address.');
    const firstName = (candidate.full_name || '').trim().split(/\s+/)[0] || candidate.full_name || '';
    if (!confirm(`Send OutSta Pre-Pitch Agreement to ${firstName} (${candidate.email})?`)) return;
    setSendingPrepitch(true);
    try {
      const { data: tpl, error: te } = await supabase
        .from('contract_templates')
        .select('id')
        .eq('name', 'OutSta Pre-Pitch Agreement')
        .maybeSingle();
      if (te) throw te;
      if (!tpl) throw new Error('Pre-Pitch Agreement template not found.');

      const { data: msgTpls } = await supabase
        .from('contract_message_templates')
        .select('message')
        .eq('category', 'prepitch')
        .order('created_at', { ascending: true })
        .limit(1);
      const rawMsg = msgTpls?.[0]?.message || '';
      const message = rawMsg.replace(/\{\{first_name\}\}/g, firstName);

      const { error } = await supabase.functions.invoke('send-contract-envelope', {
        body: {
          templateId: tpl.id,
          recipientName: candidate.full_name,
          recipientEmail: candidate.email,
          applicantId: candidate.id,
          adminPrefill: { first_name: firstName },
          message,
          category: 'prepitch',
        },
      });
      if (error) throw error;
      toast.success(`Pre-Pitch Agreement sent to ${candidate.email}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSendingPrepitch(false);
    }
  }, [candidate.id, candidate.email, candidate.full_name]);

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
            data-candidate-card="true"
            data-candidate-id={candidate.id}
            draggable
            onMouseDown={(e) => {
              // Ctrl/Cmd/Shift+click toggles selection. Use mousedown so the
              // action fires even if the browser interprets the gesture as a
              // drag-start or right-click (macOS treats Ctrl+click as right-click).
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                onSelectToggle?.();
              }
            }}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onContextMenu={(e) => {
              // Prevent macOS Ctrl+click from opening the context menu.
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDragStart={(e) => {
              // Don't allow drag while modifier keys are held — that gesture is
              // for multi-select, not for moving cards.
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', candidate.id);
              onDragStart?.();
            }}
            onDragEnd={() => onDragEnd?.()}
            className={cn(
              "bg-card rounded-md p-2.5 shadow-sm border border-border/50 hover:shadow-md transition-all space-y-1.5 cursor-grab active:cursor-grabbing",
              isDragging && "opacity-40 scale-95 shadow-lg",
              isSelected && "ring-2 ring-primary border-primary bg-primary/5"
            )}
          >
            <div className="space-y-1">
              <div className="flex items-start gap-1.5">
                <div className={cn('w-2 h-2 rounded-full mt-1 shrink-0', dotColor)} />
                <p className="text-xs font-semibold leading-tight flex-1 min-w-0" title={candidate.full_name}>
                  {candidate.full_name}
                </p>
                {(hasAdditionalProfile || hasPrimaryProfile) && (
                  <span
                    title={hasAdditionalProfile ? "Has additional profile(s)" : "Has candidate profile"}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500 text-white shadow-sm ring-1 ring-sky-600 shrink-0"
                  >
                    <UserCircle className="w-3 h-3" />
                    {hasAdditionalProfile ? '+P' : 'P'}
                  </span>
                )}
                {candidate.is_starred && (
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                )}
                {candidate.interview_invite_sent_at && (
                  <span
                    title={`Interview invite sent ${new Date(candidate.interview_invite_sent_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white shadow-sm ring-1 ring-indigo-600 shrink-0"
                  >
                    <Send className="w-3 h-3" />
                    Invited
                  </span>
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
                {(() => {
                  const cvScore = candidate.total_score ?? 0;
                  const isExpired = candidate.interview_status === 'in_progress' && candidate.interview_started_at
                    ? new Date().getTime() - new Date(candidate.interview_started_at).getTime() > 48 * 60 * 60 * 1000
                    : false;
                  const ivScore = candidate.interview_overall_score ?? (isExpired ? 0 : null);
                  if (ivScore === null && candidate.total_score === null) return null;
                  const combined = ivScore !== null
                    ? Math.round((cvScore + ivScore) / 2)
                    : cvScore;
                  const showCombined = ivScore !== null || isExpired;
                  if (!showCombined) return null;
                  return (
                    <span className={cn(
                      "inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded",
                      combined >= 70
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                        : combined >= 40
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    )}>
                      OA: {combined}
                    </span>
                  );
                })()}
                <ApplicationHistoryBadge email={candidate.email} currentId={candidate.id} phone={candidate.phone} />
              </div>
              {((candidate.tags && candidate.tags.length > 0) || (candidate.suitable_roles && candidate.suitable_roles.length > 0)) && (
                <div className="pl-3.5 flex items-center gap-1 flex-wrap">
                  {candidate.suitable_roles?.map(role => (
                    <span
                      key={`sr-${role}`}
                      className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                    >
                      <Briefcase className="w-2 h-2" />
                      {role}
                    </span>
                  ))}
                  {candidate.tags?.map(tag => (
                    <span
                      key={`t-${tag}`}
                      className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                    >
                      <TagIcon className="w-2 h-2" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {showRoleLabel && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <FileText className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate font-medium text-primary/80" title={candidate.job_title}>{candidate.job_title}</span>
                {isInactiveRole && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900 shrink-0">
                    Inactive
                  </Badge>
                )}
              </div>
            )}

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
          <ContextMenuItem onClick={openDetails}>
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
                  {getStageDisplayName(stage)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={openSendEmail}>
            <Send className="w-4 h-4 mr-2" />
            Send email
          </ContextMenuItem>

          <ContextMenuItem onClick={openHistory}>
            <History className="w-4 h-4 mr-2" />
            Communication history
          </ContextMenuItem>

          <ContextMenuItem onClick={openInvite}>
            <CalendarPlus className="w-4 h-4 mr-2" />
            Send interview invite
          </ContextMenuItem>

          <ContextMenuItem onClick={sendPrepitch} disabled={sendingPrepitch}>
            {sendingPrepitch ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSignature className="w-4 h-4 mr-2" />}
            Send Pre-pitch
          </ContextMenuItem>

          <ContextMenuItem onClick={openInterviewResults}>
            <ClipboardList className="w-4 h-4 mr-2" />
            Notes
          </ContextMenuItem>

          <ContextMenuItem onClick={openCalendar}>
            <Calendar className="w-4 h-4 mr-2" />
            Add to calendar
          </ContextMenuItem>

          <ContextMenuItem onClick={openProfile}>
            <UserCircle className="w-4 h-4 mr-2" />
            Profile
          </ContextMenuItem>

          <ContextMenuItem onClick={openActivity}>
            <Activity className="w-4 h-4 mr-2" />
            Activity
          </ContextMenuItem>

          <ContextMenuItem onClick={openTags}>
            <TagIcon className="w-4 h-4 mr-2" />
            Tags
            {candidate.tags && candidate.tags.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {candidate.tags.length}
              </span>
            )}
          </ContextMenuItem>

          <ContextMenuItem onClick={openReprofile}>
            <UserCog className="w-4 h-4 mr-2" />
            Reprofile
          </ContextMenuItem>

          <ContextMenuItem onClick={openSuitable}>
            <Briefcase className="w-4 h-4 mr-2" />
            Suitable Role
            {candidate.suitable_roles && candidate.suitable_roles.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {candidate.suitable_roles.length}
              </span>
            )}
          </ContextMenuItem>

          {candidate.cv_file_url && (
            <ContextMenuItem onClick={openCvPreview}>
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

      {mountDetails && (
        <CandidateDetailDialog
          open={showDetails}
          onOpenChange={(open) => { setShowDetails(open); if (!open) setShowDetailsTab(undefined); }}
          applicantId={candidate.id}
          initialApplicant={candidate as any}
        />
      )}

      {mountSendEmail && (
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
      )}

      {mountHistory && (
        <CommunicationHistory
          open={showHistory}
          onOpenChange={setShowHistory}
          applicantId={candidate.id}
          applicantName={candidate.full_name}
          applicantEmail={candidate.email}
        />
      )}

      {mountInvite && (
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
      )}

      {mountCvPreview && candidate.cv_file_url && (
        <Dialog open={showCvPreview} onOpenChange={setShowCvPreview}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>CV Preview — {candidate.full_name}</DialogTitle>
            </DialogHeader>
            <CVImagePreview pdfUrl={candidate.cv_file_url} fileName={candidate.full_name + '.pdf'} />
          </DialogContent>
        </Dialog>
      )}

      {mountInterviewResults && (
        <InterviewNotesDialog
          open={showInterviewResults}
          onOpenChange={setShowInterviewResults}
          applicantId={candidate.id}
          applicantName={candidate.full_name}
        />
      )}

      {mountProfile && (
        <CandidateProfileDialog
          open={showProfile}
          onOpenChange={setShowProfile}
          applicantId={candidate.id}
          applicantName={candidate.full_name}
        />
      )}

      {mountActivity && (
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
      )}

      {mountTags && (
        <TagEditorDialog
          open={showTags}
          onOpenChange={setShowTags}
          applicantId={candidate.id}
          applicantName={candidate.full_name}
          initialTags={candidate.tags || []}
          knownTags={knownTags}
          onSaved={(tags) => onTagsUpdated(candidate.id, tags)}
        />
      )}

      {mountSuitable && (
        <SuitableRoleEditorDialog
          open={showSuitable}
          onOpenChange={setShowSuitable}
          applicantId={candidate.id}
          applicantName={candidate.full_name}
          initialRoles={candidate.suitable_roles || []}
          knownRoles={knownSuitableRoles}
          onSaved={(roles) => onSuitableRolesUpdated(candidate.id, roles)}
        />
      )}

      {mountReprofile && (
        <ReprofilingDialog
          open={showReprofile}
          onOpenChange={setShowReprofile}
          applicant={{
            id: candidate.id,
            full_name: candidate.full_name,
            email: candidate.email,
            job_title: candidate.job_title,
            job_id: candidate.job_id,
            original_job_id: reprofileOrigin.original_job_id,
            original_job_title: reprofileOrigin.original_job_title,
            status: candidate.status,
          }}
          onReprofiled={onReprofiled}
        />
      )}

      {mountCalendar && (
        <AddCandidateCalendarDialog
          open={showCalendar}
          onOpenChange={setShowCalendar}
          applicantId={candidate.id}
          applicantName={candidate.full_name}
          jobId={candidate.job_id}
        />
      )}
    </>
  );
};
