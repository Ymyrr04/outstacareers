import { useEffect, useState, useMemo, useCallback, useRef, useTransition } from 'react';
import { format } from 'date-fns';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import AddJobDialog from '@/components/AddJobDialog';
import EditJobDialog from '@/components/EditJobDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LogOut, Trash2, Eye, EyeOff, ArrowLeft, Users, Briefcase, MapPin, Clock, CheckCircle, XCircle, FileText, Mic, Star, Check, X, Zap, AlertTriangle, Download, Loader2, FolderOpen, Upload, Pencil, Save, Phone, Mail, User, StickyNote, Search as SearchIcon, CalendarPlus, Settings, History, Send, ClipboardList, Link2, UserCog, MessageCircle, Smartphone, Monitor, GripVertical, Building2, MailOpen, RefreshCw, Kanban, Shield, Archive, CheckCheck, UserCircle, Target, Globe, TrendingDown, FileSignature, FlaskConical, Flag, Calendar as CalendarIcon } from 'lucide-react';
import { PreScreeningResponsesCard } from '@/components/PreScreeningResponsesCard';

import { ContractsManager } from '@/components/contracts/ContractsManager';
import { exportJobs, exportApplicants, exportAllData } from '@/lib/exportUtils';
import { parseBooleanSearch } from '@/lib/booleanSearchParser';
import { useBackgroundExport } from '@/hooks/useBackgroundExport';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEmailReplies } from '@/hooks/useEmailTemplates';
import { ClientsDashboard, ContractorsDashboard, ClientAnalyticsDashboard, HiringPipelineKanban } from '@/components/clients';
import TeamCalendar from '@/components/calendar/TeamCalendar';
import MyCalendarDialog from '@/components/calendar/MyCalendarDialog';
import { SalesPipeline } from '@/components/sales/SalesPipeline';
import { PostHirePipelineKanban } from '@/components/clients/PostHirePipelineKanban';
import { generateJobUrl } from '@/lib/slugify';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import BulkUploadDialog from '@/components/BulkUploadDialog';
import ApplicantSearchFilters from '@/components/ApplicantSearchFilters';
import ApplicantSearchResults from '@/components/ApplicantSearchResults';
import { PaginatedSearchResults } from '@/components/PaginatedSearchResults';
import { PaginatedFolderView } from '@/components/PaginatedFolderView';
import { InterviewInviteDialog } from '@/components/InterviewInviteDialog';
import { EmailTemplateEditor } from '@/components/EmailTemplateEditor';
import { CommunicationHistory } from '@/components/CommunicationHistory';
import { SendEmailDialog } from '@/components/SendEmailDialog';
import { CheckAvailabilityButton } from '@/components/CheckAvailabilityButton';
import { ReprofilingDialog } from '@/components/ReprofilingDialog';
import { CandidateProfileSection } from '@/components/CandidateProfileSection';
import { RoleHistorySection } from '@/components/RoleHistorySection';
import { ApplicationHistorySection } from '@/components/ApplicationHistorySection';
import { ApplicantSourceBadge } from '@/components/ApplicantSourceBadge';
import { ApplicationHistoryBadge } from '@/components/ApplicationHistoryBadge';
import { CopyableText } from '@/components/CopyableText';
import { ApplicantNotesEditor, type ApplicantNotesEditorRef } from '@/components/ApplicantNotesEditor';
import { NotesEditor } from '@/components/NotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { CVImagePreview } from '@/components/CVImagePreview';
import { useEmailTemplates, statusToTrigger, useUnreadMessageCounts } from '@/hooks/useEmailTemplates';
import { addMinutes } from 'date-fns';
import { MyApplicantsDashboard } from '@/components/MyApplicantsDashboard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getAdminDisplayName, getAdminAvatar } from '@/lib/adminDisplayNames';
import { useTabPermissions, TabId } from '@/hooks/useTabPermissions';
import { AdminPermissionsManager } from '@/components/AdminPermissionsManager';
import { HiredAssignmentDialog } from '@/components/HiredAssignmentDialog';
import { BooleanSearchBuilder } from '@/components/BooleanSearchBuilder';
import { SearchApplicantExpandedView } from '@/components/SearchApplicantExpandedView';
import { TalentScoutDashboard } from '@/components/TalentScoutDashboard';
import { ExternalScoutDashboard } from '@/components/ExternalScoutDashboard';
import { RecruitmentFunnel } from '@/components/RecruitmentFunnel';
import { WorkflowBoard } from '@/components/WorkflowBoard';
import { PLDashboard } from '@/components/PLDashboard';

// Status options for applicant tracking - "For Review" is the default for new applicants
// Status options for applicant tracking - new pipeline order
const APPLICANT_STATUS_FOLDERS = [
  'For Review',
  'Qualified',
  'For Interview',
  'SIV',
  'Pitch',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Archive',
  'Talent Pool'
] as const;

// Dropdown options include all statuses (For Review can be selected to move back)
const APPLICANT_STATUS_OPTIONS = [
  'For Review',
  'Qualified',
  'For Interview',
  'SIV',
  'Pitch',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Archive',
  'Talent Pool'
] as const;


const getStageDisplayName = (stage: string): string => {
  if (stage === 'Talent Pool') return 'Bench';
  if (stage === 'Bench') return 'Talent Pipeline';
  return stage;
};

type ApplicantStatusFolder = typeof APPLICANT_STATUS_FOLDERS[number];
type ApplicantStatusOption = typeof APPLICANT_STATUS_OPTIONS[number];

interface Job {
  id: string;
  title: string;
  department: string;
  rate: string | null;
  apply_url: string;
  description: string | null;
  region: string;
  is_active: boolean;
  created_at: string;
  qualifications: string[] | null;
  responsibilities: string[] | null;
  assigned_admin_id: string | null;
}

interface ToolMatch {
  tool: string;
  found: boolean;
  context?: string;
}

interface ExperienceHighlight {
  role: string;
  company?: string;
  duration?: string;
  relevance: string;
}

interface RecommendedRole {
  role: string;
  fit_score: number;
  reason?: string;
}

interface AssessmentDetails {
  matched_tools: ToolMatch[];
  missing_tools: string[];
  experience_highlights: ExperienceHighlight[];
  strengths: string[];
  concerns: string[];
  recommended_roles?: RecommendedRole[];
}

interface InterviewSession {
  id: string;
  status: string;
  experience_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  situational_score: number | null;
  personality_score: number | null;
  overall_score: number | null;
  ai_summary: string | null;
  ai_strengths: string[] | null;
  ai_concerns: string[] | null;
  completed_at: string | null;
}

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  home_office: boolean;
  noise_canceling_headset: boolean;
  laptop_or_pc: boolean;
  good_internet: boolean;
  internet_speed: string;
  power_backup: boolean;
  can_work_40_50: boolean;
  us_timezone_ok: boolean;
  start_availability: string;
  has_experience: boolean;
  currently_working: boolean;
  location: string;
  job_title: string;
  job_id: string | null;
  apply_url: string;
  status: string;
  submitted_at: string;
  notes: string | null;
  // CV Assessment fields
  role_experience_score: number | null;
  skills_tools_score: number | null;
  availability_setup_score: number | null;
  bonus_red_flag_score: number | null;
  total_score: number | null;
  ranking_status: string | null;
  ai_summary: string | null;
  cv_file_url: string | null;
  cv_text: string | null;
  vocaroo_link: string | null;
  voice_recording_url: string | null;
  ai_assessment_details: AssessmentDetails | null;
  // Extracted metadata for search
  extracted_skills: string[] | null;
  extracted_tools: string[] | null;
  years_of_experience: number | null;
  // Interview session
  interview_session: InterviewSession | null;
  // New fields for enhanced features
  job_source: string | null;
  is_available: boolean | null;
  availability_checked_at: string | null;
  original_job_id: string | null;
  original_job_title: string | null;
  reprofiled_at: string | null;
  candidate_profile: string | null;
  details_viewed_at: string | null;
  is_starred: boolean;
  device_type: string | null;
  pre_screening_responses?: any;
  pre_screening_flagged?: boolean | null;
}


type SortOption = 'newest' | 'oldest' | 'score-desc' | 'score-asc' | 'starred' | 'completed-assessment';

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { tab: urlTab } = useParams<{ tab?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { canViewTab, loading: tabPermissionsLoading } = useTabPermissions();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [adminUsersMap, setAdminUsersMap] = useState<Record<string, string>>({});
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(true);
  const [expandedApplicant, setExpandedApplicant] = useState<string | null>(null);
  const [expandingApplicantId, setExpandingApplicantId] = useState<string | null>(null);
  const [downloadingCv, setDownloadingCv] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [activeStatusFolder, setActiveStatusFolder] = useState<ApplicantStatusFolder>('For Review');
  const [isFolderSwitching, setIsFolderSwitching] = useState(false);
  const [previewCv, setPreviewCv] = useState<{ url: string; path: string; name: string; cvText: string | null; applicantId?: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [replacingCv, setReplacingCv] = useState(false);
  const replaceCvInputRef = useRef<HTMLInputElement>(null);
  
  // Edit mode state
  const [editingApplicant, setEditingApplicant] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    full_name: string;
    email: string;
    phone: string;
    whatsapp: string;
    notes: string;
  }>({ full_name: '', email: '', phone: '', whatsapp: '', notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  // Ref for notes editor to get value on save (avoids re-renders on keystroke)
  const notesEditorRef = useRef<ApplicantNotesEditorRef>(null);
  
  // Notes popup state
  const [notesPopup, setNotesPopup] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [notesPopupEditing, setNotesPopupEditing] = useState(false);
  const [notesPopupValue, setNotesPopupValue] = useState('');
  const [notesPopupSaving, setNotesPopupSaving] = useState(false);
  
  // Interview invite state
  const [interviewInviteApplicant, setInterviewInviteApplicant] = useState<{ id?: string; full_name: string; email: string; job_title: string } | null>(null);
  
  // Email system state
  const [emailTemplateEditorOpen, setEmailTemplateEditorOpen] = useState(false);
  const [communicationHistoryApplicant, setCommunicationHistoryApplicant] = useState<{ id: string; name: string; email: string } | null>(null);
  const [sendEmailApplicant, setSendEmailApplicant] = useState<{ id: string; full_name: string; email: string; job_title: string; status: string; preselectedTemplate?: string } | null>(null);
  const { templates, getDefaultTemplateByTrigger } = useEmailTemplates();
  const { unreadCounts, unreadApplicants, markAsRead: markMessagesAsRead, markAllAsRead, fetchUnreadCounts } = useUnreadMessageCounts();
  const { replies: allReplies, fetching: fetchingReplies, fetchNewReplies } = useEmailReplies();
  const [unreadPopoverOpen, setUnreadPopoverOpen] = useState(false);

  // "Up for grabs" open tasks — shown as a Task notification in the header
  const [openTaskCount, setOpenTaskCount] = useState(0);
  const [myCalendarOpen, setMyCalendarOpen] = useState(false);
  const fetchOpenTaskCount = useCallback(async () => {
    const { count } = await supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('is_open_task', true);
    setOpenTaskCount(count ?? 0);
  }, []);
  useEffect(() => {
    void fetchOpenTaskCount();
    const intervalId = window.setInterval(() => void fetchOpenTaskCount(), 30000);
    const onChange = () => void fetchOpenTaskCount();
    window.addEventListener('open-tasks-changed', onChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('open-tasks-changed', onChange);
    };
  }, [fetchOpenTaskCount]);

  // Background auto-sync so new candidate replies are stored before opening a thread
  useEffect(() => {
    const runBackgroundReplySync = async () => {
      if (document.visibilityState !== 'visible') return;
      await fetchNewReplies({ silent: true });
      await fetchUnreadCounts(true);
    };

    void runBackgroundReplySync();
    const intervalId = window.setInterval(() => {
      void runBackgroundReplySync();
    }, 120000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchNewReplies, fetchUnreadCounts]);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [paginatedSearchTerm, setPaginatedSearchTerm] = useState('');
  const [paginatedSearchInput, setPaginatedSearchInput] = useState('');
  const [paginatedSortOption, setPaginatedSortOption] = useState<'newest' | 'oldest' | 'score-desc' | 'score-asc' | 'starred'>('newest');
  const [searchFolders, setSearchFolders] = useState<string[]>([...APPLICANT_STATUS_FOLDERS]);
  const [activeApplicantTab, setActiveApplicantTab] = useState<'folders' | 'search'>('folders');
  const [searchFilteredApplicants, setSearchFilteredApplicants] = useState<Applicant[]>([]);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  
  // Jobs filter state
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [jobRegionFilter, setJobRegionFilter] = useState<string>('all');
  const [jobAdminFilter, setJobAdminFilter] = useState<string>('all');
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('active');
  
  // Applicants admin filter state
  const [applicantAdminFilter, setApplicantAdminFilter] = useState<string>('all');
  const [preScreeningFlagFilter, setPreScreeningFlagFilter] = useState<string>('all');

  
  // Batch CV scan state
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchScanProgress, setBatchScanProgress] = useState<{ done: number; total: number } | null>(null);

  // Reprofiling state
  const [reprofilingApplicant, setReprofilingApplicant] = useState<Applicant | null>(null);
  
  // Hired assignment dialog state
  const [hiredAssignmentApplicant, setHiredAssignmentApplicant] = useState<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    location: string;
    job_title: string;
  } | null>(null);
  const [pendingHiredStatusApplicantId, setPendingHiredStatusApplicantId] = useState<string | null>(null);
  
  // Drag and drop state
  const [draggedApplicant, setDraggedApplicant] = useState<Applicant | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<ApplicantStatusFolder | null>(null);
  
  // Batch select state
  const [selectedApplicants, setSelectedApplicants] = useState<Set<string>>(new Set());
  
// Sort state
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  
  // Background export hook (survives page refresh)
  const { 
    exportJob, 
    isExporting: isBackgroundExporting, 
    isCompleted: exportCompleted, 
    isFailed: exportFailed,
    progress: exportProgress,
    isRestoring: isRestoringExport,
    startExport: startBackgroundExport,
    downloadExport,
    clearExport
  } = useBackgroundExport();
  
  // Legacy export state for CSV-only export
  const [isExporting, setIsExporting] = useState(false);
  
  // Main tab state for layout control
  const validTabs = ['jobs', 'applicants', 'funnel', 'pipeline', 'post-hire', 'clients', 'contractors', 'contracts', 'analytics', 'calendar', 'talent-scout', 'external-scout', 'workflow', 'settings'];
  const [activeMainTab, setActiveMainTab] = useState(() => {
    if (urlTab && validTabs.includes(urlTab)) return urlTab;
    return 'jobs';
  });
  const [isTabSwitching, startTabTransition] = useTransition();
  const [showDelayedLoader, setShowDelayedLoader] = useState(false);
  const [manualTabLoading, setManualTabLoading] = useState(false);
  
  // Heavy tabs that need loading indicator
  const heavyTabs = ['applicants', 'recruiter-dash', 'pipeline', 'post-hire', 'contractors'];
  
  // Show loading screen for heavy tabs - show immediately, hide after content renders
  useEffect(() => {
    if (manualTabLoading) {
      setShowDelayedLoader(true);
      // Auto-hide after a maximum of 5 seconds (safety fallback)
      const maxTimer = setTimeout(() => {
        setShowDelayedLoader(false);
        setManualTabLoading(false);
      }, 5000);
      return () => clearTimeout(maxTimer);
    }
  }, [manualTabLoading]);
  
  // Hide loader when tab content has rendered (detect via activeMainTab settling)
  useEffect(() => {
    if (manualTabLoading && !isTabSwitching) {
      // Give React time to render the content, then hide loader
      const hideTimer = setTimeout(() => {
        setShowDelayedLoader(false);
        setManualTabLoading(false);
      }, 100);
      return () => clearTimeout(hideTimer);
    }
  }, [manualTabLoading, isTabSwitching, activeMainTab]);
  
  // Sync tab from URL param changes (e.g. browser back/forward)
  useEffect(() => {
    if (urlTab && validTabs.includes(urlTab) && urlTab !== activeMainTab) {
      setActiveMainTab(urlTab);
    }
  }, [urlTab]);

  // Deep link: /admin/applicants?applicant=<id> — focus & expand that applicant
  const handledDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const applicantId = searchParams.get('applicant');
    if (!applicantId || applicantsLoading) return;
    if (handledDeepLinkRef.current === applicantId) return;
    const target = applicants.find(a => a.id === applicantId);
    if (!target) return;
    handledDeepLinkRef.current = applicantId;
    setSearchTerm(target.email || target.full_name || '');
    setExpandedApplicant(applicantId);
    setTimeout(() => {
      document.getElementById(`applicant-${applicantId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    const next = new URLSearchParams(searchParams);
    next.delete('applicant');
    setSearchParams(next, { replace: true });
  }, [searchParams, applicants, applicantsLoading]);



  // Handle tab switching with transition to prevent UI freeze
  const handleMainTabChange = useCallback((newTab: string) => {
    // Show loading immediately for heavy tabs
    if (heavyTabs.includes(newTab)) {
      setManualTabLoading(true);
    }
    // Update URL
    navigate(`/admin/${newTab}`, { replace: true });
    startTabTransition(() => {
      setActiveMainTab(newTab);
    });
  }, [navigate]);
  
  // Assessment tab state for CV/Interview navigation
  const [activeAssessmentTab, setActiveAssessmentTab] = useState<'cv' | 'interview'>('cv');
  
  // Ref for expanded applicant card (click-outside detection)
  const expandedCardRef = useRef<HTMLDivElement>(null);
  
  // Close expanded details on Escape key or click outside
  useEffect(() => {
    if (!expandedApplicant) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedApplicant(null);
      }
    };
    
    const handleClickOutside = (e: MouseEvent) => {
      if (expandedCardRef.current && !expandedCardRef.current.contains(e.target as Node)) {
        setExpandedApplicant(null);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedApplicant]);

  // Close accordion sections on Escape key (when no applicant is expanded)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !expandedApplicant && openAccordions.length > 0) {
        setOpenAccordions([]);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedApplicant, openAccordions]);
  
  // Show toast when background export completes
  useEffect(() => {
    if (exportCompleted && exportJob) {
      toast({ 
        title: 'Export Complete', 
        description: `Exported ${exportJob.processed_items} applicants with CVs. Click to download.`,
        action: (
          <Button size="sm" onClick={() => downloadExport(exportJob.id)}>
            Download
          </Button>
        )
      });
    } else if (exportFailed && exportJob) {
      toast({ 
        title: 'Export Failed', 
        description: exportJob.error_message || 'An error occurred during export',
        variant: 'destructive'
      });
      clearExport();
    }
  }, [exportCompleted, exportFailed, exportJob, toast, downloadExport, clearExport]);
  
  // Helper to calculate overall score (prioritizes candidates with both CV + Interview)
  const getOverallScore = (applicant: Applicant): { score: number; hasInterview: boolean } => {
    const cvScore = applicant.total_score ?? 0;
    const interviewScore = applicant.interview_session?.overall_score ?? null;
    
    if (interviewScore !== null) {
      // Average of both scores
      return { score: (cvScore + interviewScore) / 2, hasInterview: true };
    }
    return { score: cvScore, hasInterview: false };
  };
  
  // Sort applicants helper
  const sortApplicants = (applicantsToSort: Applicant[]): Applicant[] => {
    return [...applicantsToSort].sort((a, b) => {
      // Starred always comes first regardless of sort option
      if (sortOption === 'starred') {
        if (a.is_starred && !b.is_starred) return -1;
        if (!a.is_starred && b.is_starred) return 1;
        // Secondary sort by score for starred items
        const aScore = getOverallScore(a);
        const bScore = getOverallScore(b);
        if (aScore.hasInterview && !bScore.hasInterview) return -1;
        if (!aScore.hasInterview && bScore.hasInterview) return 1;
        return bScore.score - aScore.score;
      }
      
      if (sortOption === 'completed-assessment') {
        // Prioritize applicants with completed interview sessions
        const aHasCompleted = a.interview_session?.status === 'completed' || a.interview_session?.status === 'completed_manual_review';
        const bHasCompleted = b.interview_session?.status === 'completed' || b.interview_session?.status === 'completed_manual_review';
        if (aHasCompleted && !bHasCompleted) return -1;
        if (!aHasCompleted && bHasCompleted) return 1;
        // Secondary sort by score for those with completed assessments
        if (aHasCompleted && bHasCompleted) {
          const aScore = a.interview_session?.overall_score ?? 0;
          const bScore = b.interview_session?.overall_score ?? 0;
          return bScore - aScore;
        }
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      }
      
      if (sortOption === 'score-desc' || sortOption === 'score-asc') {
        const aScore = getOverallScore(a);
        const bScore = getOverallScore(b);
        
        // Prioritize candidates with complete assessments (CV + Interview)
        if (aScore.hasInterview && !bScore.hasInterview) return -1;
        if (!aScore.hasInterview && bScore.hasInterview) return 1;
        
        // Then sort by score
        const scoreDiff = sortOption === 'score-desc' 
          ? bScore.score - aScore.score 
          : aScore.score - bScore.score;
        return scoreDiff;
      }
      
      // Oldest first
      if (sortOption === 'oldest') {
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
      }
      
      // Default: newest first
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    });
  };
  
  // Toggle star handler
  const handleToggleStar = async (applicantId: string) => {
    const applicant = applicants.find(a => a.id === applicantId);
    if (!applicant) return;
    
    const newStarred = !applicant.is_starred;
    
    // Optimistic update
    setApplicants(prev => prev.map(a => 
      a.id === applicantId ? { ...a, is_starred: newStarred } : a
    ));
    
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ is_starred: newStarred })
      .eq('id', applicantId);
    
    if (error) {
      // Revert on error
      setApplicants(prev => prev.map(a => 
        a.id === applicantId ? { ...a, is_starred: !newStarred } : a
      ));
      toast({
        title: 'Error',
        description: 'Failed to update star status',
        variant: 'destructive',
      });
    }
  };

  // Compute unique skills and tools from all applicants
  const { allSkills, allTools } = useMemo(() => {
    const skillsSet = new Set<string>();
    const toolsSet = new Set<string>();
    
    applicants.forEach(a => {
      a.extracted_skills?.forEach(s => skillsSet.add(s));
      a.extracted_tools?.forEach(t => toolsSet.add(t));
    });
    
    return {
      allSkills: Array.from(skillsSet).sort((a, b) => a.localeCompare(b)),
      allTools: Array.from(toolsSet).sort((a, b) => a.localeCompare(b))
    };
  }, [applicants]);

  const handleSearchFilteredApplicants = useCallback((filtered: Applicant[]) => {
    setSearchFilteredApplicants(filtered);
  }, []);

  const handlePreviewCv = async (applicantId: string, cvPath: string, applicantName: string, cvText: string | null) => {
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.storage
        .from('cv-uploads')
        .download(cvPath);

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to load CV: ' + error.message,
          variant: 'destructive',
        });
        return;
      }

      // Determine MIME type based on file extension
      const extension = cvPath.split('.').pop()?.toLowerCase();
      let mimeType = 'application/pdf';
      if (extension === 'doc') {
        mimeType = 'application/msword';
      } else if (extension === 'docx') {
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }

      // Create blob with correct MIME type
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setPreviewCv({ url, path: cvPath, name: applicantName, cvText, applicantId });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load CV',
        variant: 'destructive',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    if (previewCv?.url) {
      URL.revokeObjectURL(previewCv.url);
    }
    setPreviewCv(null);
  };

  // Helper to generate filename from applicant name
  const generateCvFilename = (name: string, originalPath: string): string => {
    const extension = originalPath.split('.').pop()?.toLowerCase() || 'pdf';
    const sanitizedName = name
      .trim()
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase();
    return `${sanitizedName}-cv.${extension}`;
  };

  const handleDownloadFromPreview = () => {
    if (!previewCv) return;
    const a = document.createElement('a');
    a.href = previewCv.url;
    a.download = generateCvFilename(previewCv.name, previewCv.path);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({
      title: 'Success',
      description: 'CV downloaded successfully',
    });
  };

  const handleReplaceCv = async (file: File) => {
    if (!previewCv?.applicantId) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({ title: 'Invalid file', description: 'CV must be a PDF file.', variant: 'destructive' });
      return;
    }
    setReplacingCv(true);
    try {
      const filePath = `applications/${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('cv-uploads')
        .upload(filePath, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('applicants_prescreen')
        .update({ cv_file_url: filePath, cv_text: null })
        .eq('id', previewCv.applicantId);
      if (updateError) throw updateError;

      if (previewCv.path) {
        await supabase.storage.from('cv-uploads').remove([previewCv.path]).catch(() => {});
      }

      setApplicants(prev => prev.map(a =>
        a.id === previewCv.applicantId ? { ...a, cv_file_url: filePath, cv_text: null } : a
      ));

      toast({ title: 'CV updated', description: 'New CV uploaded successfully.' });

      if (previewCv.url) URL.revokeObjectURL(previewCv.url);
      const { data: blobData } = await supabase.storage.from('cv-uploads').download(filePath);
      if (blobData) {
        const newUrl = URL.createObjectURL(new Blob([blobData], { type: 'application/pdf' }));
        setPreviewCv({ ...previewCv, url: newUrl, path: filePath, cvText: null });
      } else {
        handleClosePreview();
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Failed to upload new CV', variant: 'destructive' });
    } finally {
      setReplacingCv(false);
      if (replaceCvInputRef.current) replaceCvInputRef.current.value = '';
    }
  };

  const handleDownloadCv = async (applicantId: string, cvPath: string, applicantName: string) => {
    setDownloadingCv(applicantId);
    try {
      // Download the file directly using Supabase storage
      const { data, error } = await supabase.storage
        .from('cv-uploads')
        .download(cvPath);

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to download CV: ' + error.message,
          variant: 'destructive',
        });
        return;
      }

      // Create a blob URL and trigger download
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = generateCvFilename(applicantName, cvPath);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: 'CV downloaded successfully',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to download CV',
        variant: 'destructive',
      });
    } finally {
      setDownloadingCv(null);
    }
  };

  const handleRescoreCv = async (applicantId: string) => {
    setRescoring(applicantId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      if (!token) {
        throw new Error('Not authenticated');
      }

      toast({
        title: 'Processing CV',
        description: 'Using AI vision to extract text and score the CV...',
      });

      const response = await supabase.functions.invoke('rescore-cv', {
        body: { applicant_id: applicantId, force_vision: true },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to rescore CV');
      }

      if (response.data?.error) {
        toast({
          title: 'Cannot rescore',
          description: response.data.error + (response.data.suggestion ? `\n${response.data.suggestion}` : ''),
          variant: 'destructive',
        });
        return;
      }

      const extractionMethod = response.data?.extraction_method === 'vision' 
        ? '(used AI vision)' 
        : '';

      toast({
        title: 'CV Rescored Successfully',
        description: `New score: ${response.data?.scores?.total_score || 'N/A'}/100 ${extractionMethod}`,
      });

      // Refresh the applicant data
      fetchApplicants();
    } catch (error) {
      console.error('Error rescoring CV:', error);
      toast({
        title: 'Error',
        description: 'Failed to rescore CV. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRescoring(null);
    }
  };

  const handleBatchScanCvs = async () => {
    setBatchScanning(true);
    setBatchScanProgress(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Find applicants with cv_file_url but missing/empty cv_text
      const { data: unprocessed, error } = await supabase
        .from('applicants_prescreen')
        .select('id, cv_file_url, cv_text')
        .not('cv_file_url', 'is', null)
        .or('cv_text.is.null,cv_text.eq.')
        .limit(50);

      if (error) throw error;
      if (!unprocessed || unprocessed.length === 0) {
        toast({ title: 'All CVs processed', description: 'No unprocessed CVs found.' });
        setBatchScanning(false);
        return;
      }

      setBatchScanProgress({ done: 0, total: unprocessed.length });
      toast({
        title: 'Scanning CVs',
        description: `Processing ${unprocessed.length} unprocessed CVs with AI Vision...`,
      });

      let successCount = 0;
      for (let i = 0; i < unprocessed.length; i++) {
        const applicant = unprocessed[i];
        try {
          const response = await supabase.functions.invoke('extract-cv-with-vision', {
            body: {
              applicant_id: applicant.id,
              cv_text: applicant.cv_text || '',
              cv_file_url: applicant.cv_file_url,
            },
          });
          if (response.data?.success) successCount++;
        } catch (e) {
          console.error(`Failed to extract CV for ${applicant.id}:`, e);
        }
        setBatchScanProgress({ done: i + 1, total: unprocessed.length });
      }

      toast({
        title: 'Batch Scan Complete',
        description: `Successfully extracted text from ${successCount}/${unprocessed.length} CVs.`,
      });
    } catch (error) {
      console.error('Batch scan error:', error);
      toast({
        title: 'Error',
        description: 'Failed to batch scan CVs.',
        variant: 'destructive',
      });
    } finally {
      setBatchScanning(false);
      setBatchScanProgress(null);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      if (!token) return;
      
      const response = await supabase.functions.invoke('get-admin-users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data?.adminUsers) {
        const map: Record<string, string> = {};
        response.data.adminUsers.forEach((admin: { user_id: string; email: string }) => {
          map[admin.user_id] = admin.email;
        });
        setAdminUsersMap(map);
      }
    } catch (err) {
      console.error('Error fetching admin users:', err);
    }
  };

  const fetchJobs = async () => {
    setJobsLoading(true);
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch jobs',
        variant: 'destructive',
      });
    } else {
      setJobs(data || []);
    }
    setJobsLoading(false);
  };

  const fetchApplicants = useCallback(async () => {
    setApplicantsLoading(true);
    
    // Fetch ALL applicants using pagination to bypass the 1000-row default limit
    const PAGE_SIZE = 1000;
    let allApplicants: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('applicants_prescreen')
        .select('*')
        .order('submitted_at', { ascending: false })
        .range(from, to);

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to fetch applicants',
          variant: 'destructive',
        });
        setApplicantsLoading(false);
        return;
      }

      allApplicants = allApplicants.concat(data || []);
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    const applicantsData = allApplicants;

    // Fetch interview sessions for all applicants in chunks to avoid URL length limits
    const applicantIds = (applicantsData || []).map(a => a.id);
    let interviewSessions: Record<string, InterviewSession> = {};
    
    if (applicantIds.length > 0) {
      // Chunk IDs into batches of 100 to avoid URL length limits
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < applicantIds.length; i += CHUNK_SIZE) {
        chunks.push(applicantIds.slice(i, i + CHUNK_SIZE));
      }
      
      // Fetch sessions for all chunks in parallel
      const sessionPromises = chunks.map(chunk =>
        supabase
          .from('interview_sessions')
          .select('*')
          .in('applicant_id', chunk)
          .order('completed_at', { ascending: false, nullsFirst: false })
      );
      
      const results = await Promise.all(sessionPromises);
      
      // Combine all session data
      results.forEach(({ data: sessionsData }) => {
        if (sessionsData) {
          // Group sessions by applicant_id, prioritizing completed sessions
          sessionsData.forEach(session => {
            const existing = interviewSessions[session.applicant_id];
            // Prefer completed sessions over in-progress ones
            if (!existing || 
                (session.status === 'completed' && existing.status !== 'completed') ||
                (session.status === 'completed_manual_review' && existing.status === 'in_progress')) {
              interviewSessions[session.applicant_id] = {
                id: session.id,
                status: session.status,
                experience_score: session.experience_score,
                technical_score: session.technical_score,
                communication_score: session.communication_score,
                situational_score: session.situational_score,
                personality_score: session.personality_score,
                overall_score: session.overall_score,
                ai_summary: session.ai_summary,
                ai_strengths: session.ai_strengths,
                ai_concerns: session.ai_concerns,
                completed_at: session.completed_at
              };
            }
          });
        }
      });
    }

    // Combine applicants with their interview sessions
    const applicantsWithInterviews = (applicantsData || []).map(item => ({
      ...item,
      ai_assessment_details: item.ai_assessment_details as unknown as AssessmentDetails | null,
      interview_session: interviewSessions[item.id] || null
    }));
    
    setApplicants(applicantsWithInterviews);
    setApplicantsLoading(false);
  }, [toast]);

  // Update a single applicant's interview session cache
  const updateApplicantInterviewSession = useCallback((applicantId: string, session: InterviewSession) => {
    setApplicants(prev => prev.map(app => 
      app.id === applicantId 
        ? { ...app, interview_session: session }
        : app
    ));
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Track if initial data has been loaded to prevent refetching on browser tab switches
  const hasLoadedInitialData = useRef(false);

  useEffect(() => {
    if (user && isAdmin && !hasLoadedInitialData.current) {
      hasLoadedInitialData.current = true;
      fetchJobs();
      fetchApplicants();
      fetchAdminUsers();
    }
  }, [user, isAdmin]);

  // Real-time subscription for applicants_prescreen changes to sync with Recruiter Dash
  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel('admin-applicants-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applicants_prescreen' },
        (payload) => {
          console.log('Admin: Applicant change detected:', payload.eventType);
          fetchApplicants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, fetchApplicants]);

  // Auto-score unscored applicants that have CV text but no total_score
  const autoScoringTriggered = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!applicants.length || applicantsLoading) return;
    
    const unscoredWithCv = applicants.filter(a => 
      a.cv_text && 
      a.cv_text.length > 50 && 
      a.total_score === null && 
      a.job_title &&
      !autoScoringTriggered.current.has(a.id)
    );

    if (unscoredWithCv.length === 0) return;

    console.log(`Auto-scoring ${unscoredWithCv.length} unscored applicants with CV text...`);
    
    // Score up to 5 at a time to avoid overloading
    const batch = unscoredWithCv.slice(0, 5);
    batch.forEach(applicant => {
      autoScoringTriggered.current.add(applicant.id);
      
      supabase.functions.invoke('rescore-cv', {
        body: { applicant_id: applicant.id }
      }).then(({ error }) => {
        if (error) {
          console.error(`Auto-score failed for ${applicant.id}:`, error);
        } else {
          console.log(`Auto-scored applicant ${applicant.full_name}`);
          fetchApplicants();
        }
      });
    });
  }, [applicants, applicantsLoading, jobs, fetchApplicants]);

  const handleToggleActive = async (job: Job) => {
    const { error } = await supabase
      .from('jobs')
      .update({ is_active: !job.is_active })
      .eq('id', job.id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      fetchJobs();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    const { error } = await supabase.from('jobs').delete().eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Job deleted successfully',
      });
      fetchJobs();
    }
  };

  const handleDeleteApplicant = async (id: string) => {
    if (!confirm('Are you sure you want to move this applicant to trash?')) return;

    // First, get the applicant data to archive
    const applicant = applicants.find(a => a.id === id);
    if (!applicant) {
      toast({
        title: 'Error',
        description: 'Applicant not found',
        variant: 'destructive',
      });
      return;
    }

    // Get current user ID for deleted_by
    const { data: { user } } = await supabase.auth.getUser();

    // Archive to deleted_applicants table - cast to any to bypass type checking for new table
    const { error: archiveError } = await supabase.from('deleted_applicants' as any).insert({
      original_id: applicant.id,
      full_name: applicant.full_name,
      email: applicant.email,
      phone: applicant.phone,
      location: applicant.location,
      job_title: applicant.job_title,
      job_id: applicant.job_id,
      status: applicant.status,
      cv_file_url: applicant.cv_file_url,
      cv_text: applicant.cv_text,
      voice_recording_url: applicant.voice_recording_url,
      vocaroo_link: applicant.vocaroo_link,
      notes: applicant.notes,
      candidate_profile: applicant.candidate_profile,
      total_score: applicant.total_score,
      role_experience_score: applicant.role_experience_score,
      skills_tools_score: applicant.skills_tools_score,
      availability_setup_score: applicant.availability_setup_score,
      bonus_red_flag_score: applicant.bonus_red_flag_score,
      ranking_status: applicant.ranking_status,
      ai_summary: applicant.ai_summary,
      ai_assessment_details: applicant.ai_assessment_details,
      extracted_skills: applicant.extracted_skills,
      extracted_tools: applicant.extracted_tools,
      years_of_experience: applicant.years_of_experience,
      is_starred: applicant.is_starred,
      home_office: applicant.home_office,
      noise_canceling_headset: applicant.noise_canceling_headset,
      laptop_or_pc: applicant.laptop_or_pc,
      good_internet: applicant.good_internet,
      power_backup: applicant.power_backup,
      can_work_40_50: applicant.can_work_40_50,
      us_timezone_ok: applicant.us_timezone_ok,
      has_experience: applicant.has_experience,
      currently_working: applicant.currently_working,
      internet_speed: applicant.internet_speed,
      start_availability: applicant.start_availability,
      device_type: applicant.device_type,
      apply_url: applicant.apply_url,
      job_source: applicant.job_source,
      original_job_id: applicant.original_job_id,
      original_job_title: applicant.original_job_title,
      reprofiled_at: applicant.reprofiled_at,
      submitted_at: applicant.submitted_at,
      deleted_by: user?.id,
    } as any);

    if (archiveError) {
      toast({
        title: 'Error',
        description: 'Failed to archive applicant: ' + archiveError.message,
        variant: 'destructive',
      });
      return;
    }

    // Now delete from original table
    const { error: deleteError } = await supabase.from('applicants_prescreen').delete().eq('id', id);

    if (deleteError) {
      toast({
        title: 'Error',
        description: deleteError.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Moved to Trash',
        description: 'Applicant moved to trash. Can be restored from the Trash tab.',
      });
      fetchApplicants();
    }
  };

  // Batch status update handler (with automated emails)
  const handleBatchUpdateStatus = async (newStatus: ApplicantStatusOption) => {
    if (selectedApplicants.size === 0) return;
    const ids = Array.from(selectedApplicants);
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ status: newStatus })
      .in('id', ids);
    if (error) {
      toast({ title: 'Error', description: 'Failed to update statuses: ' + error.message, variant: 'destructive' });
      return;
    }

    setApplicants(prev => prev.map(a => ids.includes(a.id) ? { ...a, status: newStatus } : a));
    setSelectedApplicants(new Set());

    // Send automated emails for each applicant (skip interview/SIV which need manual customization)
    const trigger = statusToTrigger[newStatus];
    const template = trigger ? getDefaultTemplateByTrigger(trigger) : null;
    let emailsSent = 0;
    let emailsScheduled = 0;
    let emailsFailed = 0;

    if (template && template.is_enabled && trigger !== 'for_interview' && trigger !== 'siv') {
      const batchApplicants = ids.map(id => applicants.find(a => a.id === id)).filter(Boolean);
      
      for (const applicant of batchApplicants) {
        if (!applicant) continue;
        const firstName = applicant.full_name.split(' ')[0];
        const processedSubject = template.subject
          .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{full_name\}\}/g, applicant.full_name)
          .replace(/\{\{job_title\}\}/g, applicant.job_title);
        const processedBody = template.body_html
          .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{full_name\}\}/g, applicant.full_name)
          .replace(/\{\{job_title\}\}/g, applicant.job_title);
        
        let scheduleFor: string | undefined;
        if (template.delay_hours > 0) {
          scheduleFor = addMinutes(new Date(), template.delay_hours).toISOString();
        }

        try {
          const { data, error: emailError } = await supabase.functions.invoke('send-applicant-email', {
            body: {
              applicantId: applicant.id,
              templateId: template.id,
              subject: processedSubject,
              bodyHtml: processedBody,
              recipientEmail: applicant.email,
              applicantStatusAtSend: newStatus,
              isAutomated: true,
              scheduleFor,
            },
          });
          if (emailError) throw emailError;
          if (data?.scheduled) emailsScheduled++;
          else emailsSent++;
        } catch {
          emailsFailed++;
        }
      }
    }

    const parts = [`${ids.length} applicant(s) moved to "${newStatus}"`];
    if (emailsSent > 0) parts.push(`${emailsSent} email(s) sent`);
    if (emailsScheduled > 0) parts.push(`${emailsScheduled} email(s) scheduled`);
    if (emailsFailed > 0) parts.push(`${emailsFailed} email(s) failed`);
    if (trigger === 'for_interview' || trigger === 'siv') parts.push('Emails skipped (use individual status change for interview/SIV)');
    toast({ title: 'Batch Update', description: parts.join('. ') });
  };

  const toggleSelectApplicant = (id: string) => {
    setSelectedApplicants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (applicantIds: string[]) => {
    setSelectedApplicants(prev => {
      const allSelected = applicantIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        applicantIds.forEach(id => next.delete(id));
      } else {
        applicantIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleUpdateApplicantStatus = async (applicantId: string, newStatus: ApplicantStatusOption) => {
    let applicant = applicants.find(a => a.id === applicantId);
    
    // If not in local state (e.g. from search view), fetch from DB
    if (!applicant) {
      const { data } = await supabase
        .from('applicants_prescreen')
        .select('*')
        .eq('id', applicantId)
        .single();
      if (!data) return;
      applicant = data as any;
    }

    // If moving to Hired, open the assignment dialog first
    if (newStatus === 'Hired' && applicant.status !== 'Hired') {
      setPendingHiredStatusApplicantId(applicantId);
      setHiredAssignmentApplicant({
        id: applicant.id,
        full_name: applicant.full_name,
        email: applicant.email,
        phone: applicant.phone,
        location: applicant.location,
        job_title: applicant.job_title,
      });
      // Still update the status immediately
    }

    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ status: newStatus })
      .eq('id', applicantId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status: ' + error.message,
        variant: 'destructive',
      });
    } else {
      // Update locally for immediate UI feedback
      setApplicants(prev => prev.map(a => 
        a.id === applicantId ? { ...a, status: newStatus } : a
      ));
      toast({
        title: 'Status Updated',
        description: `Applicant moved to "${newStatus}"`,
      });

      // Send automated email if template is enabled
      const trigger = statusToTrigger[newStatus];
      if (trigger) {
        const template = getDefaultTemplateByTrigger(trigger);
        if (template && template.is_enabled) {
          // Process template variables - extract first name from full name
          const firstName = applicant.full_name.split(' ')[0];
          
          let processedSubject = template.subject
            .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
            .replace(/\{\{first_name\}\}/g, firstName)
            .replace(/\{\{full_name\}\}/g, applicant.full_name)
            .replace(/\{\{job_title\}\}/g, applicant.job_title);
          
          let processedBody = template.body_html
            .replace(/\{\{applicant_name\}\}/g, applicant.full_name)
            .replace(/\{\{first_name\}\}/g, firstName)
            .replace(/\{\{full_name\}\}/g, applicant.full_name)
            .replace(/\{\{job_title\}\}/g, applicant.job_title);

          // Calculate schedule time for delayed emails (like rejection)
          // delay_hours stores minutes for consistency
          let scheduleFor: string | undefined;
          if (template.delay_hours > 0) {
            scheduleFor = addMinutes(new Date(), template.delay_hours).toISOString();
          }

          // For interview or SIV status, open the email dialog instead of auto-sending
          if (trigger === 'for_interview' || trigger === 'siv') {
            setSendEmailApplicant({
              id: applicant.id,
              full_name: applicant.full_name,
              email: applicant.email,
              job_title: applicant.job_title,
              status: newStatus,
              preselectedTemplate: trigger,
            });
            return;
          }

          // Send email
          try {
            const { data, error: emailError } = await supabase.functions.invoke('send-applicant-email', {
              body: {
                applicantId: applicant.id,
                templateId: template.id,
                subject: processedSubject,
                bodyHtml: processedBody,
                recipientEmail: applicant.email,
                applicantStatusAtSend: newStatus,
                isAutomated: true,
                scheduleFor,
              },
            });

            if (emailError) throw emailError;

            toast({
              title: data.scheduled ? 'Email Scheduled' : 'Email Sent',
              description: data.scheduled 
                ? `Email scheduled for ${applicant.email}`
                : `Automated email sent to ${applicant.email}`,
            });
          } catch (emailErr: any) {
            console.error('Failed to send automated email:', emailErr);
            toast({
              title: 'Email Failed',
              description: 'Status updated but email failed to send',
              variant: 'destructive',
            });
          }
        }
      }
    }
  };

  const handleStartEdit = (applicant: Applicant) => {
    setEditingApplicant(applicant.id);
    setEditForm({
      full_name: applicant.full_name,
      email: applicant.email,
      phone: applicant.phone || '',
      whatsapp: applicant.whatsapp || '',
      notes: applicant.notes || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingApplicant(null);
    setEditForm({ full_name: '', email: '', phone: '', whatsapp: '', notes: '' });
  };

  const handleSaveEdit = async (applicantId: string) => {
    if (!editForm.full_name.trim() || !editForm.email.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and email are required',
        variant: 'destructive',
      });
      return;
    }

    // Get notes value from ref (isolated component) to avoid re-renders during typing
    const notesValue = notesEditorRef.current?.getValue() ?? editForm.notes;

    setSavingEdit(true);
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        whatsapp: editForm.whatsapp.trim() || null,
        notes: notesValue.trim() || null,
      })
      .eq('id', applicantId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update applicant: ' + error.message,
        variant: 'destructive',
      });
    } else {
      // Update locally for immediate UI feedback
      setApplicants(prev => prev.map(a => 
        a.id === applicantId 
          ? { 
              ...a, 
              full_name: editForm.full_name.trim(),
              email: editForm.email.trim(),
              phone: editForm.phone.trim() || null,
              whatsapp: editForm.whatsapp.trim() || null,
              notes: notesValue.trim() || null,
            } 
          : a
      ));
      toast({
        title: 'Success',
        description: 'Applicant information updated',
      });
      setEditingApplicant(null);
    }
    setSavingEdit(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const BooleanBadge = ({ value, label }: { value: boolean; label: string }) => (
    <div className="flex items-center gap-1.5 text-sm">
      {value ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500" />
      )}
      <span className={value ? 'text-green-700' : 'text-red-700'}>{label}</span>
    </div>
  );

  if (loading || tabPermissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You don't have admin privileges. Contact an administrator to get access.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/')}>
                Go Home
              </Button>
              <Button variant="destructive" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-background">
      <MyCalendarDialog open={myCalendarOpen} onOpenChange={setMyCalendarOpen} currentUserId={user?.id} />
      <header className="admin-header">
        <div className="admin-header-inner max-w-full mx-auto px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="admin-logo-ring" aria-hidden="true" />
              <span className="text-sm font-semibold tracking-tight">
                Out<span style={{ color: 'hsl(var(--brand))' }}>Sta</span>
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Hub</span>
            </Link>
            <span className="admin-divider" />
            <h1 className="text-[11px] text-muted-foreground">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setMyCalendarOpen(true)}>
              <CalendarIcon className="w-3 h-3 mr-1.5" />
              My Calendar
            </Button>
            {openTaskCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => handleMainTabChange('calendar')}
                title={`${openTaskCount} up-for-grabs task${openTaskCount === 1 ? '' : 's'}`}
              >
                <ClipboardList className="w-3 h-3 mr-1.5" />
                Task
                <Badge variant="destructive" className="ml-1.5 h-4 min-w-[16px] px-1 text-[9px] justify-center">
                  {openTaskCount}
                </Badge>
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-[11px]"
              onClick={async () => {
                toast({ title: 'Exporting...', description: 'Preparing your data...' });
                const result = await exportAllData();
                if (result.success) {
                  toast({ title: 'Success', description: 'All data exported as ZIP file' });
                } else {
                  toast({ title: 'Error', description: result.error || 'Export failed', variant: 'destructive' });
                }
              }}
            >
              <Archive className="w-3 h-3 mr-1.5" />
              Export All
            </Button>
            <span className="admin-divider mx-1" />
            <span className="admin-avatar" title={user?.email}>
              {(user?.email || '?').slice(0, 2).toUpperCase()}
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={signOut}>
              <LogOut className="w-3 h-3 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>


      <main className="px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        <Tabs defaultValue="jobs" className="space-y-6" value={activeMainTab} onValueChange={handleMainTabChange}>
          <TabsList className="flex-wrap">
            {canViewTab('jobs') && (
              <TabsTrigger value="jobs" className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Jobs
              </TabsTrigger>
            )}
            {canViewTab('applicants') && (
              <TabsTrigger value="applicants" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Applicants
                {applicants.length > 0 && (
                  <Badge className="ml-1 text-[9px] px-1.5 py-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary">{applicants.length}</Badge>
                )}
                {(() => {
                  const newCount = applicants.filter(a => a.status === 'For Review' && !a.details_viewed_at).length;
                  return newCount > 0 ? (
                    <Badge className="text-[9px] px-1.5 py-0 rounded-lg text-white ml-1" style={{ background: '#E24B4A' }}>
                      {newCount} new
                    </Badge>
                  ) : null;
                })()}
              </TabsTrigger>
            )}
            {canViewTab('funnel') && (
              <TabsTrigger value="funnel" className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Recruitment Pipeline / Funnel
              </TabsTrigger>
            )}
            {canViewTab('pipeline') && (
              <TabsTrigger value="pipeline" className="flex items-center gap-2">
                <Kanban className="w-4 h-4" />
                Client Pipeline
              </TabsTrigger>
            )}
            {canViewTab('calendar') && (
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <CalendarPlus className="w-4 h-4" />
                Calendar
              </TabsTrigger>
            )}
            {canViewTab('sales-pipeline') && (
              <TabsTrigger value="sales-pipeline" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Sales Pipeline
              </TabsTrigger>
            )}
            {canViewTab('post-hire') && (
              <TabsTrigger value="post-hire" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Post-Hire
              </TabsTrigger>
            )}
            {canViewTab('clients') && (
              <TabsTrigger value="clients" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Clients
              </TabsTrigger>
            )}
            {canViewTab('contractors') && (
              <TabsTrigger value="contractors" className="flex items-center gap-2">
                <UserCog className="w-4 h-4" />
                Contractors
              </TabsTrigger>
            )}
            {canViewTab('pl') && (
              <TabsTrigger value="pl" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                PL
              </TabsTrigger>
            )}
            {canViewTab('analytics') && (
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Analytics
              </TabsTrigger>
            )}


            {canViewTab('talent-scout') && (
              <TabsTrigger value="talent-scout" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Talent Scout
              </TabsTrigger>
            )}
            {canViewTab('external-scout') && (
              <TabsTrigger value="external-scout" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                External Scout
              </TabsTrigger>
            )}
            {canViewTab('workflow') && (
              <TabsTrigger value="workflow" className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                Workflow
              </TabsTrigger>
            )}
            {canViewTab('contracts') && (
              <TabsTrigger value="contracts" className="flex items-center gap-2">
                <FileSignature className="w-4 h-4" />
                Contracts
              </TabsTrigger>
            )}
            {/* Settings tab - only for super admins (mark@outsta.io) */}
            {user?.email?.toLowerCase() === 'mark@outsta.io' && (
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Permissions
              </TabsTrigger>
            )}
          </TabsList>

          {/* Delayed loading overlay - shows only if tab switching takes more than 2 seconds */}
          {showDelayedLoader && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground animate-fade-in">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p className="text-lg">Loading tab content...</p>
              <p className="text-sm mt-1">This may take a moment for large datasets</p>
            </div>
          )}


          <TabsContent value="jobs" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">All Jobs</h2>
                <p className="text-muted-foreground">Manage your job listings</p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    const result = await exportJobs();
                    if (result.success) {
                      toast({ title: 'Success', description: `Exported ${result.count} jobs` });
                    } else {
                      toast({ title: 'Error', description: result.error || 'Export failed', variant: 'destructive' });
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <AddJobDialog onJobAdded={fetchJobs} />
              </div>
            </div>

            {/* Jobs Search and Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs..."
                  value={jobSearchTerm}
                  onChange={(e) => setJobSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={jobRegionFilter} onValueChange={setJobRegionFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="philippines">Philippines</SelectItem>
                  <SelectItem value="latin-america">Latin America</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
              <Select value={jobAdminFilter} onValueChange={setJobAdminFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Assigned Admin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Admins</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {Object.entries(adminUsersMap).map(([id, email]) => (
                    <SelectItem key={id} value={id}>{getAdminDisplayName(email)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {(jobSearchTerm || jobRegionFilter !== 'all' || jobAdminFilter !== 'all' || jobStatusFilter !== 'active') && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setJobSearchTerm('');
                    setJobRegionFilter('all');
                    setJobAdminFilter('all');
                    setJobStatusFilter('active');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>

            {jobsLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading jobs...</span>
              </div>
            ) : jobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No jobs yet. Add your first job listing!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {jobs
                  .filter((job) => {
                    // Search filter
                    const searchLower = jobSearchTerm.toLowerCase();
                    const matchesSearch = !jobSearchTerm || 
                      job.title.toLowerCase().includes(searchLower) ||
                      job.department?.toLowerCase().includes(searchLower) ||
                      job.description?.toLowerCase().includes(searchLower);
                    
                    // Region filter
                    const matchesRegion = jobRegionFilter === 'all' || 
                      job.region === jobRegionFilter ||
                      (jobRegionFilter === 'global' && job.region === 'all');
                    
                    // Admin filter
                    const matchesAdmin = jobAdminFilter === 'all' ||
                      (jobAdminFilter === 'unassigned' && !job.assigned_admin_id) ||
                      job.assigned_admin_id === jobAdminFilter;
                    
                    // Status filter
                    const matchesStatus = jobStatusFilter === 'all' ||
                      (jobStatusFilter === 'active' && job.is_active !== false) ||
                      (jobStatusFilter === 'inactive' && job.is_active === false);
                    
                    return matchesSearch && matchesRegion && matchesAdmin && matchesStatus;
                  })
                  .map((job) => (
                  <Card key={job.id} className={!job.is_active ? 'opacity-60' : ''}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{job.title}</h3>
                            {!job.is_active && (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                            {job.assigned_admin_id && adminUsersMap[job.assigned_admin_id] && (
                              <Badge variant="outline" className="text-xs">
                                <UserCog className="w-3 h-3 mr-1" />
                                {getAdminDisplayName(adminUsersMap[job.assigned_admin_id])}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {job.department} • {job.region === 'all' ? 'All Regions' : job.region}
                            {job.rate && ` • ${job.rate}`}
                          </p>
                          {job.description && (
                            <p className="text-sm mt-2 text-muted-foreground line-clamp-2">
                              {job.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Use production URL for shareable links - links to dedicated job page
                              const productionOrigin = 'https://outstahub.com';
                              const url = `${productionOrigin}/job/${job.id}`;
                              navigator.clipboard.writeText(url);
                              toast({
                                title: "Link copied!",
                                description: `Application link for "${job.title}" copied to clipboard.`,
                              });
                            }}
                          >
                            <Link2 className="w-4 h-4 mr-1" />
                            Copy Link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const url = `${window.location.origin}/apply/${job.id}?preview=1`;
                              navigator.clipboard.writeText(url).catch(() => {});
                              window.open(url, '_blank', 'noopener,noreferrer');
                              toast({
                                title: "Test flow opened",
                                description: `Preview link for "${job.title}" copied to clipboard.`,
                              });
                            }}
                          >
                            <FlaskConical className="w-4 h-4 mr-1" />
                            Test Flow
                          </Button>

                          <EditJobDialog job={job} onJobUpdated={fetchJobs} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(job)}
                          >
                            {job.is_active ? (
                              <>
                                <EyeOff className="w-4 h-4 mr-1" />
                                Hide
                              </>
                            ) : (
                              <>
                                <Eye className="w-4 h-4 mr-1" />
                                Show
                              </>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(job.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {jobs.filter((job) => {
                  const searchLower = jobSearchTerm.toLowerCase();
                  const matchesSearch = !jobSearchTerm || 
                    job.title.toLowerCase().includes(searchLower) ||
                    job.department?.toLowerCase().includes(searchLower) ||
                    job.description?.toLowerCase().includes(searchLower);
                  const matchesRegion = jobRegionFilter === 'all' || 
                    job.region === jobRegionFilter ||
                    (jobRegionFilter === 'global' && job.region === 'all');
                  const matchesAdmin = jobAdminFilter === 'all' ||
                    (jobAdminFilter === 'unassigned' && !job.assigned_admin_id) ||
                    job.assigned_admin_id === jobAdminFilter;
                  const matchesStatus = jobStatusFilter === 'all' ||
                    (jobStatusFilter === 'active' && job.is_active !== false) ||
                    (jobStatusFilter === 'inactive' && job.is_active === false);
                  return matchesSearch && matchesRegion && matchesAdmin && matchesStatus;
                }).length === 0 && jobs.length > 0 && (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No jobs match your filters.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="applicants" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Pre-Screening Submissions</h2>
                <p className="text-muted-foreground">View applicants organized by status and role</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Unread Replies Button */}
                <Popover open={unreadPopoverOpen} onOpenChange={setUnreadPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="relative"
                      title="Unread email replies"
                    >
                      <MailOpen className="w-4 h-4" />
                      {Object.keys(unreadCounts).length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                            {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
                          </span>
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <h4 className="font-semibold text-sm">Unread Replies</h4>
                      <div className="flex items-center gap-1">
                        {Object.keys(unreadCounts).length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-xs"
                            onClick={markAllAsRead}
                          >
                            <CheckCheck className="w-3 h-3 mr-1" />
                            Mark all read
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs"
                          onClick={async () => {
                            await fetchNewReplies();
                            await fetchUnreadCounts();
                          }}
                          disabled={fetchingReplies}
                        >
                          <RefreshCw className={`w-3 h-3 mr-1 ${fetchingReplies ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {Object.keys(unreadCounts).length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                          No unread replies
                        </div>
                      ) : (
                        <div className="divide-y">
                          {unreadApplicants.map((applicant) => (
                            <div
                              key={applicant.id}
                              className="w-full px-4 py-3 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {/* Admin avatar indicator */}
                                  {applicant.assigned_admin_id && (
                                    <div className="shrink-0" title={getAdminDisplayName(applicant.assigned_admin_id)}>
                                      {getAdminAvatar(applicant.assigned_admin_id) ? (
                                        <img
                                          src={getAdminAvatar(applicant.assigned_admin_id)}
                                          alt={getAdminDisplayName(applicant.assigned_admin_id)}
                                          className="w-6 h-6 rounded-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-medium">
                                          {getAdminDisplayName(applicant.assigned_admin_id).charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{applicant.full_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{applicant.email}</p>
                                  </div>
                                </div>
                                <Badge variant="destructive" className="shrink-0">
                                  {applicant.count} new
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                {/* CV Assessment link */}
                                {applicant.total_score !== null && (
                                  <button
                                    onClick={() => {
                                      setActiveAssessmentTab('cv');
                                      setActiveMainTab('applicants');
                                      setExpandedApplicant(applicant.id);
                                      setUnreadPopoverOpen(false);
                                    }}
                                    className="flex items-center gap-1 text-green-600 hover:underline"
                                  >
                                    <Star className="w-3 h-3" />
                                    CV Assessment
                                  </button>
                                )}
                                {/* Communication History link - keeps popover open */}
                                <button
                                  onClick={() => {
                                    setCommunicationHistoryApplicant({
                                      id: applicant.id,
                                      name: applicant.full_name,
                                      email: applicant.email
                                    });
                                    // Don't close popover - let user continue browsing
                                  }}
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <History className="w-3 h-3" />
                                  Messages
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
                <Button 
                  variant="outline"
                  onClick={() => setEmailTemplateEditorOpen(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Email Templates
                </Button>
                {/* Export Dropdown */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="relative">
                      {isBackgroundExporting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Export
                      {isBackgroundExporting && exportProgress && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {exportProgress.percentage}%
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="end">
                    <div className="space-y-1">
                      {isBackgroundExporting ? (
                        <div className="p-3 text-center">
                          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-primary" />
                          <p className="text-sm font-medium">
                            {isRestoringExport ? 'Resuming export...' : 'Exporting CVs...'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {exportProgress && exportProgress.total > 0 
                              ? `${exportProgress.processed} / ${exportProgress.total} files`
                              : 'Preparing files...'}
                          </p>
                          {exportProgress && exportProgress.total > 0 && (
                            <div className="w-full bg-secondary rounded-full h-2 mt-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all duration-300" 
                                style={{ width: `${exportProgress.percentage}%` }}
                              />
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            You can refresh or navigate away safely
                          </p>
                        </div>
                      ) : exportCompleted && exportJob ? (
                        <div className="p-3 text-center">
                          <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
                          <p className="text-sm font-medium">Export Ready!</p>
                          <Button 
                            size="sm" 
                            className="mt-2 w-full"
                            onClick={() => {
                              downloadExport(exportJob.id);
                              clearExport();
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download ZIP
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-sm"
                            disabled={isExporting || isBackgroundExporting}
                            onClick={async () => {
                              setIsExporting(true);
                              try {
                                const result = await exportApplicants();
                                if (result.success) {
                                  toast({ title: 'Export Complete', description: `Exported ${result.count} applicants` });
                                } else {
                                  toast({ title: 'Error', description: result.error || 'Export failed', variant: 'destructive' });
                                }
                              } finally {
                                setIsExporting(false);
                              }
                            }}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Export CSV Only
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-sm"
                            disabled={isExporting || isBackgroundExporting}
                            onClick={async () => {
                              try {
                                await startBackgroundExport();
                                toast({ title: 'Export Started', description: 'Processing in background. You can refresh or navigate away.' });
                              } catch (error) {
                                toast({ title: 'Error', description: 'Failed to start export', variant: 'destructive' });
                              }
                            }}
                          >
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Export with CVs (ZIP)
                          </Button>
                          <p className="text-xs text-muted-foreground px-2 pt-2">
                            CV export runs in background and survives page refresh
                          </p>
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <BulkUploadDialog 
                  jobs={jobs.map(j => ({ 
                    id: j.id, 
                    title: j.title, 
                    description: j.description,
                    qualifications: j.qualifications,
                    responsibilities: j.responsibilities
                  }))} 
                  onUploadComplete={fetchApplicants} 
                />
              </div>
            </div>

            {(applicantsLoading || isTabSwitching) ? (
              <div className="space-y-4 animate-fade-in">
                {/* Skeleton tabs */}
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 w-36" />
                </div>
                
                {/* Skeleton search bar */}
                <Skeleton className="h-10 w-full max-w-md" />
                
                {/* Skeleton folder tabs */}
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-9 w-24" />
                  ))}
                </div>
                
                {/* Skeleton applicant cards */}
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-4 w-64" />
                            <div className="flex gap-2">
                              <Skeleton className="h-6 w-20" />
                              <Skeleton className="h-6 w-16" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Skeleton className="h-9 w-9" />
                            <Skeleton className="h-9 w-9" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isTabSwitching ? 'Preparing view...' : `Loading ${applicants.length > 0 ? applicants.length : ''} applicants...`}</span>
                </div>
              </div>
            ) : applicants.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No applicants yet.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Toggle between Folder View and Search View */}
                <Tabs value={activeApplicantTab} onValueChange={(v) => setActiveApplicantTab(v as 'folders' | 'search')} className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="folders" className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      Folders View
                    </TabsTrigger>
                    <TabsTrigger value="search" className="flex items-center gap-2">
                      <SearchIcon className="w-4 h-4" />
                      Advanced Search
                    </TabsTrigger>
                  </TabsList>

                  {/* Advanced Search Tab - Server-side Paginated */}
                  <TabsContent value="search" className="space-y-4" keepMounted>
                    {/* Search controls */}
                    <div className="flex gap-3 items-start">
                      <div className="flex-1">
                        <BooleanSearchBuilder
                          onSearch={(query) => {
                            setPaginatedSearchInput(query);
                            setPaginatedSearchTerm(query);
                          }}
                          placeholder="Search by name, email, job title, skills, CV text..."
                          folders={APPLICANT_STATUS_FOLDERS}
                          selectedFolders={searchFolders}
                          onFoldersChange={setSearchFolders}
                        />
                      </div>
                      <Select value={paginatedSortOption} onValueChange={(v) => setPaginatedSortOption(v as any)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="oldest">Oldest First</SelectItem>
                          <SelectItem value="score-desc">Score: High to Low</SelectItem>
                          <SelectItem value="score-asc">Score: Low to High</SelectItem>
                          <SelectItem value="starred">Starred First</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBatchScanCvs}
                        disabled={batchScanning}
                        className="gap-2 whitespace-nowrap"
                        title="Extract text from CVs that haven't been processed yet using AI Vision"
                      >
                        {batchScanning ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {batchScanProgress ? `${batchScanProgress.done}/${batchScanProgress.total}` : 'Scanning...'}
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            Scan Unprocessed CVs
                          </>
                        )}
                      </Button>
                    </div>


                    <PaginatedSearchResults
                      searchTerm={paginatedSearchTerm}
                      sortBy={paginatedSortOption}
                      statuses={searchFolders.length === APPLICANT_STATUS_FOLDERS.length ? undefined : searchFolders}
                      statusOptions={APPLICANT_STATUS_OPTIONS}
                      onUpdateStatus={handleUpdateApplicantStatus}
                      onViewDetails={async (id) => {
                        if (expandedApplicant === id) {
                          setExpandedApplicant(null);
                          return;
                        }
                        setExpandingApplicantId(id);
                        await new Promise(resolve => setTimeout(resolve, 50));
                        setExpandedApplicant(id);
                        setExpandingApplicantId(null);
                        // Mark as viewed
                        await supabase
                          .from('applicants_prescreen')
                          .update({ details_viewed_at: new Date().toISOString() })
                          .eq('id', id);
                      }}
                      onNavigateToFolder={async (id, status) => {
                        // Switch to folders view and navigate to the correct folder
                        setActiveApplicantTab('folders');
                        setActiveStatusFolder(status as ApplicantStatusFolder);
                        // Small delay to let the tab/folder switch render
                        await new Promise(resolve => setTimeout(resolve, 100));
                        setExpandingApplicantId(id);
                        await new Promise(resolve => setTimeout(resolve, 50));
                        setExpandedApplicant(id);
                        setExpandingApplicantId(null);
                        // Mark as viewed
                        await supabase
                          .from('applicants_prescreen')
                          .update({ details_viewed_at: new Date().toISOString() })
                          .eq('id', id);
                      }}
                      onDelete={handleDeleteApplicant}
                      onPreviewCv={(id, path, name, cvText) => handlePreviewCv(id, path, name, cvText)}
                      onDownloadCv={handleDownloadCv}
                      onToggleStar={handleToggleStar}
                      onSendEmail={(applicant) => setSendEmailApplicant(applicant)}
                      onViewHistory={(applicant) => setCommunicationHistoryApplicant(applicant)}
                      onSendInvite={(applicant: any) => setInterviewInviteApplicant({ id: applicant.id, full_name: applicant.name || applicant.full_name, email: applicant.email, job_title: applicant.jobTitle || applicant.job_title })}
                      onRescoreCv={handleRescoreCv}
                      expandedApplicant={expandedApplicant}
                      expandingApplicantId={expandingApplicantId}
                      loadingPreview={loadingPreview}
                      downloadingCv={downloadingCv}
                      rescoring={rescoring}
                      unreadCounts={unreadCounts}
                      enabled={activeApplicantTab === 'search'}
                      renderExpandedContent={(applicant) => (
                        <SearchApplicantExpandedView
                          applicant={applicant}
                          onRescoreCv={handleRescoreCv}
                          onDownloadCv={handleDownloadCv}
                          rescoring={rescoring}
                          downloadingCv={downloadingCv}
                        />
                      )}
                    />
                  </TabsContent>

                  {/* Folder View Tab */}
                  <TabsContent value="folders" className="space-y-4" keepMounted>
                    {/* Quick search, admin filter, and sort for folder view */}
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by name, email, job title, skills..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={applicantAdminFilter} onValueChange={setApplicantAdminFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Filter by admin..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Admins</SelectItem>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {Object.entries(adminUsersMap).map(([id, email]) => (
                            <SelectItem key={id} value={id}>{getAdminDisplayName(email)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={preScreeningFlagFilter} onValueChange={setPreScreeningFlagFilter}>
                        <SelectTrigger className="w-[190px]">
                          <SelectValue placeholder="Pre-screening flag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Pre-screening: All</SelectItem>
                          <SelectItem value="flagged">Flagged</SelectItem>
                          <SelectItem value="not-flagged">Not flagged</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="oldest">Oldest First</SelectItem>
                          <SelectItem value="score-desc">Score: High to Low</SelectItem>
                          <SelectItem value="score-asc">Score: Low to High</SelectItem>
                          <SelectItem value="starred">Starred First</SelectItem>
                          <SelectItem value="completed-assessment">Completed Assessment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Batch action bar */}
                    {selectedApplicants.size > 0 && (
                      <div className="sticky top-0 z-20 flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 backdrop-blur-sm">
                        <Badge variant="secondary" className="bg-primary text-primary-foreground">
                          {selectedApplicants.size} selected
                        </Badge>
                        <Select onValueChange={(v) => handleBatchUpdateStatus(v as ApplicantStatusOption)}>
                          <SelectTrigger className="w-[180px] h-8 text-sm">
                            <SelectValue placeholder="Move to status..." />
                          </SelectTrigger>
                          <SelectContent>
                            {APPLICANT_STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedApplicants(new Set())} className="text-muted-foreground">
                          Clear selection
                        </Button>
                      </div>
                    )}
                
                    <Tabs value={activeStatusFolder} onValueChange={async (v) => {
                      setIsFolderSwitching(true);
                      setSelectedApplicants(new Set());
                      await new Promise(resolve => setTimeout(resolve, 50));
                      setActiveStatusFolder(v as ApplicantStatusFolder);
                      setIsFolderSwitching(false);
                    }} className="space-y-4">
                    <TabsList className="flex-wrap h-auto gap-0 p-1 bg-muted/50 rounded-lg">
                      {APPLICANT_STATUS_FOLDERS.map((status, index) => {
                        const count = applicants.filter(a => a.status === status).length;
                        const isDragOver = dragOverFolder === status;
                        const isLast = index === APPLICANT_STATUS_FOLDERS.length - 1;
                        return (
                          <div key={status} className="flex items-center">
                            <TabsTrigger 
                              value={status} 
                              className={`flex items-center gap-2 transition-all px-3 py-1.5 rounded-md ${
                                isDragOver ? 'ring-2 ring-primary bg-primary/10' : ''
                              }`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (draggedApplicant && draggedApplicant.status !== status) {
                                  setDragOverFolder(status);
                                }
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault();
                                setDragOverFolder(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverFolder(null);
                                if (draggedApplicant && draggedApplicant.status !== status) {
                                  handleUpdateApplicantStatus(draggedApplicant.id, status);
                                  setDraggedApplicant(null);
                                }
                              }}
                            >
                              <FolderOpen className={`w-4 h-4 ${isDragOver ? 'text-primary' : ''}`} />
                              {getStageDisplayName(status)}
                              {/* Only show count badge on "For Review" folder */}
                              {status === 'For Review' && count > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs">
                                  {count}
                                </Badge>
                              )}
                            </TabsTrigger>
                            {!isLast && (
                              <div className="h-4 w-px bg-border mx-1" />
                            )}
                          </div>
                        );
                      })}
                    </TabsList>

                {APPLICANT_STATUS_FOLDERS.map((status) => {
                  // Filter by status first, then by admin filter, then by search term (with Boolean support)
                  const statusApplicants = applicants.filter(a => {
                    if (a.status !== status) return false;

                    // Pre-screening flag filter
                    if (preScreeningFlagFilter === 'flagged' && !a.pre_screening_flagged) return false;
                    if (preScreeningFlagFilter === 'not-flagged' && a.pre_screening_flagged) return false;
                    

                    
                    // Admin filter: match by job's assigned admin
                    if (applicantAdminFilter !== 'all') {
                      const job = jobs.find(j => j.id === a.job_id);
                      if (applicantAdminFilter === 'unassigned') {
                        if (job?.assigned_admin_id) return false;
                      } else {
                        if (job?.assigned_admin_id !== applicantAdminFilter) return false;
                      }
                    }
                    
                    if (!searchTerm.trim()) return true;
                    
                    const parsed = parseBooleanSearch(searchTerm.trim());
                    
                    if (!parsed.isBoolean) {
                      // Simple search
                      const term = searchTerm.toLowerCase().trim();
                      const matchesName = a.full_name.toLowerCase().includes(term);
                      const matchesEmail = a.email.toLowerCase().includes(term);
                      const matchesScore = a.total_score !== null && a.total_score.toString().includes(term);
                      const matchesJobTitle = a.job_title.toLowerCase().includes(term);
                      const matchesPhone = a.phone?.toLowerCase().includes(term) || false;
                      const matchesCv = a.cv_text?.toLowerCase().includes(term) || false;
                      const matchesSkills = a.extracted_skills?.some(s => s.toLowerCase().includes(term)) || false;
                      const matchesTools = a.extracted_tools?.some(t => t.toLowerCase().includes(term)) || false;
                      const matchesLocation = a.location?.toLowerCase().includes(term) || false;
                      return matchesName || matchesEmail || matchesScore || matchesJobTitle || matchesPhone || matchesCv || matchesSkills || matchesTools || matchesLocation;
                    }
                    
                    // Boolean search - check each clause
                    const searchableText = [
                      a.full_name, a.email, a.job_title, a.phone,
                      a.cv_text, a.location,
                      ...(a.extracted_skills || []),
                      ...(a.extracted_tools || []),
                    ].filter(Boolean).join(' ').toLowerCase();
                    
                    for (const clause of parsed.clauses) {
                      const term = clause.term.toLowerCase();
                      const found = searchableText.includes(term);
                      if (clause.type === 'AND' && !found) return false;
                      if (clause.type === 'NOT' && found) return false;
                    }
                    
                    // OR clauses: at least one must match
                    const orClauses = parsed.clauses.filter(c => c.type === 'OR');
                    if (orClauses.length > 0) {
                      const anyOrMatch = orClauses.some(c => searchableText.includes(c.term.toLowerCase()));
                      if (!anyOrMatch) return false;
                    }
                    
                    return true;
                  });
                  // Sort applicants first, then group by role
                  const sortedApplicants = sortApplicants(statusApplicants);
                  const groupedByRole = sortedApplicants.reduce((groups, applicant) => {
                    const jobTitle = applicant.job_title;
                    if (!groups[jobTitle]) {
                      groups[jobTitle] = [];
                    }
                    groups[jobTitle].push(applicant);
                    return groups;
                  }, {} as Record<string, Applicant[]>);

                  return (
                    <TabsContent key={status} value={status} className="space-y-4">
                      {isFolderSwitching ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          Loading applicants...
                        </div>
                      ) : statusApplicants.length === 0 ? (
                        <Card>
                          <CardContent className="py-12 text-center">
                            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">No applicants in "{getStageDisplayName(status)}" folder.</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <Accordion type="multiple" value={openAccordions} onValueChange={setOpenAccordions} className="space-y-4">
                          {Object.entries(groupedByRole).map(([jobTitle, jobApplicants]) => {
                            const newCount = jobApplicants.filter(a => !a.details_viewed_at).length;
                            return (
                            <AccordionItem key={jobTitle} value={jobTitle} className="border rounded-lg bg-card">
                              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                <div className="flex items-center gap-3">
                                  <Briefcase className="w-5 h-5 text-primary" />
                                  <span className="font-semibold text-lg">{jobTitle}</span>
                                  <Badge variant="secondary" className="ml-2 bg-primary/90 text-primary-foreground">
                                    {jobApplicants.length} applicant{jobApplicants.length !== 1 ? 's' : ''}
                                  </Badge>
                                  {newCount > 0 && (
                                    <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                                      {newCount} new
                                    </Badge>
                                  )}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-4 pb-4">
                                {/* Select all for this role group */}
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                                  <input
                                    type="checkbox"
                                    checked={jobApplicants.every(a => selectedApplicants.has(a.id))}
                                    onChange={() => toggleSelectAll(jobApplicants.map(a => a.id))}
                                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    Select all ({jobApplicants.length})
                                  </span>
                                </div>
                                <div className="grid gap-4">
                {jobApplicants.map((applicant) => {
                  const isNew = applicant.status === 'For Review' && !applicant.details_viewed_at;
                  const isUnreviewed = applicant.status === 'For Review';
                  const isDragging = draggedApplicant?.id === applicant.id;
                  return (
                  <Card 
                    key={applicant.id}
                    id={`applicant-${applicant.id}`}
                    ref={expandedApplicant === applicant.id ? expandedCardRef : undefined}
                    draggable={!expandedApplicant}
                    onDragStart={(e) => {
                      if (expandedApplicant) {
                        e.preventDefault();
                        return;
                      }
                      setDraggedApplicant(applicant);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', applicant.id);
                    }}
                    onDragEnd={() => {
                      setDraggedApplicant(null);
                      setDragOverFolder(null);
                    }}
                    className={`group transition-all ${
                      isDragging ? 'opacity-60 scale-[0.98] shadow-lg' : 'hover:shadow-md'
                    }`}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Checkbox + Drag handle */}
                        <div className="flex items-center gap-1 flex-shrink-0 self-center">
                          <input
                            type="checkbox"
                            checked={selectedApplicants.has(applicant.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectApplicant(applicant.id);
                            }}
                            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                          />
                          <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {/* Star button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStar(applicant.id);
                              }}
                              className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                                applicant.is_starred 
                                  ? 'text-yellow-500 hover:text-yellow-600' 
                                  : 'text-gray-300 hover:text-yellow-400'
                              }`}
                              title={applicant.is_starred ? 'Remove star' : 'Add star'}
                            >
                              <Star className={`w-4 h-4 ${applicant.is_starred ? 'fill-current' : ''}`} />
                            </button>
                            <CopyableText text={applicant.full_name} className="font-semibold hover:underline" />
                            {applicant.pre_screening_flagged && (
                              <span className="flex-shrink-0 text-amber-500" title="Pre-screening flag">
                                <Flag className="w-4 h-4 fill-current" />
                              </span>
                            )}

                            {/* Device type icon */}
                            {applicant.device_type && (
                              <span 
                                className={`flex-shrink-0 ${applicant.device_type === 'mobile' ? 'text-blue-500' : 'text-gray-500'}`}
                                title={`Applied from ${applicant.device_type}`}
                              >
                                {applicant.device_type === 'mobile' ? (
                                  <Smartphone className="w-4 h-4" />
                                ) : (
                                  <Monitor className="w-4 h-4" />
                                )}
                              </span>
                            )}
                            {isNew && (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
                                NEW
                              </Badge>
                            )}
                            {applicant.ranking_status && (
                              <Badge 
                                variant={
                                  applicant.ranking_status === 'Strong Match' ? 'default' :
                                  applicant.ranking_status === 'Good Fit' ? 'secondary' :
                                  'outline'
                                }
                                className={
                                  applicant.ranking_status === 'Strong Match' ? 'bg-green-600' :
                                  applicant.ranking_status === 'Good Fit' ? 'bg-blue-600 text-white' :
                                  ''
                                }
                              >
                                <Star className="w-3 h-3 mr-1" />
                                {applicant.ranking_status}
                              </Badge>
                            )}
                            {/* Overall Score - Always average of CV (or 0) and Interview (or 0) */}
                            {(() => {
                              const cvScore = applicant.total_score ?? 0;
                              const interviewScore = (applicant.interview_session?.status === 'completed' || applicant.interview_session?.status === 'completed_manual_review') 
                                ? (applicant.interview_session?.overall_score ?? 0)
                                : 0;
                              
                              // Only show if at least one assessment exists
                              if (applicant.total_score !== null || 
                                  ((applicant.interview_session?.status === 'completed' || applicant.interview_session?.status === 'completed_manual_review') && applicant.interview_session?.overall_score != null)) {
                                const avgScore = Math.round((cvScore + interviewScore) / 2);
                                return (
                                  <Badge variant="outline" className="font-mono bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-900/50 dark:border-purple-600 dark:text-purple-200">
                                    Overall Score: {avgScore}/100
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                            <ApplicationHistoryBadge email={applicant.email} currentId={applicant.id} phone={applicant.phone} />
                          </div>
                          <CopyableText text={applicant.email} className="text-sm text-muted-foreground hover:underline" />
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            {applicant.phone && (
                              <CopyableText text={applicant.phone} className="flex items-center gap-1 hover:underline">
                                <Phone className="w-3 h-3" />
                                {applicant.phone}
                              </CopyableText>
                            )}
                            {(applicant.whatsapp || applicant.phone) && (
                              <a 
                                href={`https://wa.me/${(applicant.whatsapp || applicant.phone || '').replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MessageCircle className="w-3 h-3" />
                                {applicant.whatsapp || applicant.phone}
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3.5 h-3.5" />
                              {applicant.job_title}
                            </span>
                            {applicant.original_job_title && applicant.original_job_title !== applicant.job_title && (
                              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                Originally: {applicant.original_job_title}
                              </Badge>
                            )}
                            <ApplicantSourceBadge source={applicant.job_source} />
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {applicant.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(applicant.submitted_at)}
                            </span>
                            {applicant.cv_file_url && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewCv(applicant.id, applicant.cv_file_url!, applicant.full_name, applicant.cv_text);
                                }}
                                disabled={loadingPreview}
                                className="flex items-center gap-1 text-primary hover:underline cursor-pointer disabled:opacity-50"
                              >
                                {loadingPreview ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5" />
                                )}
                                CV
                              </button>
                            )}
                            {(applicant.vocaroo_link || applicant.voice_recording_url) && (
                              applicant.voice_recording_url ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Mic className="w-3.5 h-3.5 text-primary" />
                                  <audio controls className="h-8 w-32" src={applicant.voice_recording_url}>
                                    Your browser does not support audio.
                                  </audio>
                                </div>
                              ) : (
                                <a
                                  href={applicant.vocaroo_link!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                                >
                                  <Mic className="w-3.5 h-3.5" />
                                  Voice
                                </a>
                              )
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotesPopup({
                                  id: applicant.id,
                                  name: applicant.full_name,
                                  notes: applicant.notes || ''
                                });
                              }}
                              className={`flex items-center gap-1 cursor-pointer hover:underline ${applicant.notes ? 'text-amber-600' : 'text-muted-foreground'}`}
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                              Notes
                            </button>
                            
                            {/* CV Assessment quick link */}
                            {applicant.total_score !== null && (
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setActiveAssessmentTab('cv');
                                  if (expandedApplicant !== applicant.id) {
                                    setExpandingApplicantId(applicant.id);
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    setExpandedApplicant(applicant.id);
                                    setExpandingApplicantId(null);
                                  }
                                }}
                                className="flex items-center gap-1 text-green-600 hover:underline cursor-pointer"
                              >
                                {expandingApplicantId === applicant.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Star className="w-3.5 h-3.5" />
                                )}
                                CV Assessment
                                <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px] px-1.5 py-0 h-4 font-medium">
                                  {applicant.total_score}/100
                                </Badge>
                                {unreadCounts[applicant.id] && unreadCounts[applicant.id] > 0 && (
                                  <span className="relative flex h-2 w-2 ml-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                  </span>
                                )}
                              </button>
                            )}

                            {/* Interview Results quick link */}
                            {(applicant.interview_session?.status === 'completed' || applicant.interview_session?.status === 'completed_manual_review') && (
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setActiveAssessmentTab('interview');
                                  if (expandedApplicant !== applicant.id) {
                                    setExpandingApplicantId(applicant.id);
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    setExpandedApplicant(applicant.id);
                                    setExpandingApplicantId(null);
                                  }
                                }}
                                className="flex items-center gap-1.5 text-purple-600 hover:underline cursor-pointer"
                              >
                                {expandingApplicantId === applicant.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ClipboardList className="w-3.5 h-3.5" />
                                )}
                                Interview Results
                                {applicant.interview_session?.overall_score != null && (
                                  <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] px-1.5 py-0 h-4 font-medium">
                                    {applicant.interview_session.overall_score}/100
                                  </Badge>
                                )}
                                {unreadCounts[applicant.id] && unreadCounts[applicant.id] > 0 && (
                                  <span className="relative flex h-2 w-2 ml-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                  </span>
                                )}
                              </button>
                            )}

                            {/* Candidate Profile quick link */}
                            {applicant.candidate_profile && (
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (expandedApplicant !== applicant.id) {
                                    setExpandingApplicantId(applicant.id);
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    setExpandedApplicant(applicant.id);
                                    setExpandingApplicantId(null);
                                  }
                                  setTimeout(() => {
                                    document.getElementById(`candidate-profile-${applicant.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }, 150);
                                }}
                                className="flex items-center gap-1 text-blue-500 hover:underline cursor-pointer"
                              >
                                <UserCircle className="w-3.5 h-3.5" />
                                Profile
                              </button>
                            )}

                            {/* Check Availability button for Bench candidates */}
                            {applicant.status === 'Bench' && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const { error } = await supabase.functions.invoke('send-availability-check', {
                                      body: { applicantId: applicant.id },
                                    });
                                    if (error) throw error;
                                    toast({
                                      title: 'Availability check sent',
                                      description: `Email sent to ${applicant.email}`,
                                    });
                                  } catch (error: any) {
                                    toast({
                                      title: 'Failed to send',
                                      description: error.message || 'Please try again',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                                className="flex items-center gap-1 text-blue-600 hover:underline cursor-pointer"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                Check Availability
                                {applicant.is_available !== null && applicant.is_available !== undefined && (
                                  <>
                                    <Badge 
                                      variant="secondary" 
                                      className={`ml-1 text-xs ${applicant.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                                    >
                                      {applicant.is_available ? 'Available' : 'Not Available'}
                                    </Badge>
                                    {applicant.availability_checked_at && (
                                      <span className="text-xs text-muted-foreground ml-1">
                                        {format(new Date(applicant.availability_checked_at), 'MM/dd/yy')}
                                      </span>
                                    )}
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={applicant.status === 'For Review' ? '' : applicant.status}
                            onValueChange={(value) => handleUpdateApplicantStatus(applicant.id, value as ApplicantStatusOption)}
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {APPLICANT_STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {getStageDisplayName(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={expandingApplicantId === applicant.id}
                            onClick={async () => {
                              if (expandedApplicant === applicant.id) {
                                setExpandedApplicant(null);
                                return;
                              }
                              // Show loading state
                              setExpandingApplicantId(applicant.id);
                              // Small delay to show loading state before heavy render
                              await new Promise(resolve => setTimeout(resolve, 50));
                              setExpandedApplicant(applicant.id);
                              setExpandingApplicantId(null);
                              // Mark as viewed when expanding details
                              if (!applicant.details_viewed_at) {
                                await supabase
                                  .from('applicants_prescreen')
                                  .update({ details_viewed_at: new Date().toISOString() })
                                  .eq('id', applicant.id);
                                // Update local state
                                setApplicants(prev => prev.map(a => 
                                  a.id === applicant.id ? { ...a, details_viewed_at: new Date().toISOString() } : a
                                ));
                              }
                            }}
                          >
                            {expandingApplicantId === applicant.id ? (
                              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Loading...</>
                            ) : expandedApplicant === applicant.id ? 'Hide Details' : 'View Details'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInterviewInviteApplicant({
                              id: applicant.id,
                              full_name: applicant.full_name,
                              email: applicant.email,
                              job_title: applicant.job_title
                            })}
                            title="Send Interview Invite"
                          >
                            <CalendarPlus className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSendEmailApplicant({
                              id: applicant.id,
                              full_name: applicant.full_name,
                              email: applicant.email,
                              job_title: applicant.job_title,
                              status: applicant.status
                            })}
                            title="Send Email"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReprofilingApplicant(applicant)}
                            title="Reprofile Applicant"
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCommunicationHistoryApplicant({
                              id: applicant.id,
                              name: applicant.full_name,
                              email: applicant.email
                            })}
                            title="Communication History"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteApplicant(applicant.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Loading skeleton when expanding */}
                      {expandingApplicantId === applicant.id && (
                        <div className="mt-4 pt-4 border-t border-border animate-pulse">
                          <div className="flex items-center gap-2 mb-4">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Loading applicant details...</span>
                          </div>
                          <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <Skeleton className="h-20 w-full" />
                              <Skeleton className="h-20 w-full" />
                              <Skeleton className="h-20 w-full" />
                              <Skeleton className="h-20 w-full" />
                            </div>
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-32 w-full" />
                          </div>
                        </div>
                      )}

                      {expandedApplicant === applicant.id && (
                        <div className="mt-4 pt-4 border-t border-border" onMouseDown={(e) => e.stopPropagation()}>
                          <div className="mb-6">
                            <PreScreeningResponsesCard
                              responses={applicant.pre_screening_responses}
                              flagged={applicant.pre_screening_flagged}
                            />
                          </div>
                          {/* Assessment Tabs - CV vs Interview */}

                          <Tabs value={activeAssessmentTab} onValueChange={(val) => setActiveAssessmentTab(val as 'cv' | 'interview')} className="mb-6">
                            <TabsList className="grid w-full grid-cols-2" onMouseDown={(e) => e.stopPropagation()}>
                              <TabsTrigger value="cv" className="flex items-center gap-2">
                                <Star className="w-4 h-4" />
                                CV Assessment
                                {applicant.total_score !== null && (
                                  <Badge className="ml-1 bg-blue-600 text-white hover:bg-blue-600">{applicant.total_score}/100</Badge>
                                )}
                              </TabsTrigger>
                              <TabsTrigger value="interview" className="flex items-center gap-2">
                                <ClipboardList className="w-4 h-4" />
                                Interview Results
                                {applicant.interview_session?.overall_score != null && (
                                  <Badge className="ml-1 bg-purple-600 text-white hover:bg-purple-600">{applicant.interview_session.overall_score}/100</Badge>
                                )}
                              </TabsTrigger>
                            </TabsList>

                            {/* CV Assessment Tab */}
                            <TabsContent value="cv" className="mt-4">
                              {applicant.total_score !== null ? (
                                <div className="p-4 bg-muted/50 rounded-lg">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold flex items-center gap-2">
                                      <Star className="w-4 h-4" />
                                      AI CV Assessment
                                    </h4>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleRescoreCv(applicant.id)}
                                      disabled={rescoring === applicant.id}
                                      className="gap-1"
                                    >
                                      {rescoring === applicant.id ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Rescoring...
                                        </>
                                      ) : (
                                        <>
                                          <RefreshCw className="w-3 h-3" />
                                          Rescore CV
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Role Experience</p>
                                      <p className="text-lg font-bold">{applicant.role_experience_score ?? '-'}/50</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Skills & Tools</p>
                                      <p className="text-lg font-bold">{applicant.skills_tools_score ?? '-'}/45</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Availability</p>
                                      <p className="text-lg font-bold">{applicant.availability_setup_score ?? '-'}/5</p>
                                    </div>
                                    <div className="text-center p-2 bg-primary/10 rounded border border-primary/20">
                                      <p className="text-xs text-muted-foreground">Total Score</p>
                                      <p className="text-xl font-bold text-primary">{applicant.total_score}/100</p>
                                    </div>
                                  </div>
                                  {applicant.ai_summary && (
                                    <div className="mt-3">
                                      <p className="text-sm font-medium mb-1">AI Summary</p>
                                      <p className="text-sm text-muted-foreground">{applicant.ai_summary}</p>
                                    </div>
                                  )}

                                  {/* Detailed Assessment Breakdown */}
                                  {applicant.ai_assessment_details && (
                                    <div className="mt-4 space-y-4">
                                      {/* Skills & Tools Match */}
                                      {(applicant.ai_assessment_details.matched_tools?.length > 0 || 
                                        applicant.ai_assessment_details.missing_tools?.length > 0) && (
                                        <div>
                                          <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                            <Zap className="w-4 h-4" />
                                            Skills & Tools Match
                                          </p>
                                          <div className="space-y-2">
                                            {applicant.ai_assessment_details.matched_tools?.map((tool, idx) => (
                                              <div key={idx} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-sm">
                                                <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                                <div>
                                                  <span className="font-medium text-green-700 dark:text-green-400">{tool.tool}</span>
                                                  {tool.context && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">"{tool.context}"</p>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                            {applicant.ai_assessment_details.missing_tools?.map((tool, idx) => (
                                              <div key={idx} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm">
                                                <X className="w-4 h-4 text-red-600 flex-shrink-0" />
                                                <span className="text-red-700 dark:text-red-400">{tool}</span>
                                                <span className="text-xs text-muted-foreground ml-1">(not found)</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Relevant Experience */}
                                      {applicant.ai_assessment_details.experience_highlights?.length > 0 && (
                                        <div>
                                          <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                            <Briefcase className="w-4 h-4" />
                                            Relevant Experience
                                          </p>
                                          <div className="space-y-2">
                                            {applicant.ai_assessment_details.experience_highlights.map((exp, idx) => (
                                              <div key={idx} className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-sm">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-medium text-blue-700 dark:text-blue-400">{exp.role}</span>
                                                  {exp.company && (
                                                    <span className="text-muted-foreground">at {exp.company}</span>
                                                  )}
                                                  {exp.duration && (
                                                    <Badge variant="outline" className="text-xs">{exp.duration}</Badge>
                                                  )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">{exp.relevance}</p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Strengths & Concerns */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {applicant.ai_assessment_details.strengths?.length > 0 && (
                                          <div>
                                            <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                              <CheckCircle className="w-4 h-4 text-green-600" />
                                              Strengths
                                            </p>
                                            <ul className="space-y-1">
                                              {applicant.ai_assessment_details.strengths.map((strength, idx) => (
                                                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                                  <span className="text-green-600">•</span>
                                                  {strength}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {applicant.ai_assessment_details.concerns?.length > 0 && (
                                          <div>
                                            <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                                              Concerns
                                            </p>
                                            <ul className="space-y-1">
                                              {applicant.ai_assessment_details.concerns.map((concern, idx) => (
                                                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                                  <span className="text-amber-600">•</span>
                                                  {concern}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>

                                      {applicant.ai_assessment_details.recommended_roles?.length > 0 && (
                                        <div>
                                          <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                            <Target className="w-4 h-4 text-purple-600" />
                                            Other Roles They May Fit
                                          </p>
                                          <div className="space-y-2">
                                            {applicant.ai_assessment_details.recommended_roles.map((r, idx) => (
                                              <div key={idx} className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded text-sm">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-medium text-purple-700 dark:text-purple-400">{r.role}</span>
                                                  <Badge variant="outline" className="text-xs">{r.fit_score}/100 fit</Badge>
                                                </div>
                                                {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-6 bg-muted/30 rounded-lg text-center">
                                  <Star className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                  <p className="text-muted-foreground mb-4">No CV assessment available yet</p>
                                  {applicant.cv_file_url && (
                                    <Button
                                      variant="default"
                                      onClick={() => handleRescoreCv(applicant.id)}
                                      disabled={rescoring === applicant.id}
                                      className="gap-2"
                                    >
                                      {rescoring === applicant.id ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          Processing with AI Vision...
                                        </>
                                      ) : (
                                        <>
                                          <RefreshCw className="w-4 h-4" />
                                          Score CV with AI Vision
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TabsContent>

                            {/* Interview Results Tab */}
                            <TabsContent value="interview" className="mt-4">
                              <InterviewResultsFetcher 
                                applicantId={applicant.id}
                                cachedSession={applicant.interview_session}
                                onSessionFound={(session) => updateApplicantInterviewSession(applicant.id, session)}
                              />
                            </TabsContent>
                          </Tabs>

                          {/* Editable Contact Info Section */}
                          <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Contact Information
                              </h4>
                              {editingApplicant === applicant.id ? (
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelEdit}
                                    disabled={savingEdit}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveEdit(applicant.id)}
                                    disabled={savingEdit}
                                  >
                                    {savingEdit ? (
                                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    ) : (
                                      <Save className="w-4 h-4 mr-1" />
                                    )}
                                    Save
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleStartEdit(applicant)}
                                >
                                  <Pencil className="w-4 h-4 mr-1" />
                                  Edit
                                </Button>
                              )}
                            </div>
                            
                            {editingApplicant === applicant.id ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="edit-name" className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    Full Name
                                  </Label>
                                  <Input
                                    id="edit-name"
                                    value={editForm.full_name}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                                    placeholder="Full name"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-email" className="flex items-center gap-1">
                                    <Mail className="w-3.5 h-3.5" />
                                    Email
                                  </Label>
                                  <Input
                                    id="edit-email"
                                    type="email"
                                    value={editForm.email}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder="Email address"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-phone" className="flex items-center gap-1">
                                    <Phone className="w-3.5 h-3.5" />
                                    Phone
                                  </Label>
                                  <Input
                                    id="edit-phone"
                                    type="tel"
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="Phone number"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-whatsapp" className="flex items-center gap-1">
                                    <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                                    WhatsApp
                                  </Label>
                                  <Input
                                    id="edit-whatsapp"
                                    type="tel"
                                    value={editForm.whatsapp}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, whatsapp: e.target.value }))}
                                    placeholder="WhatsApp number"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm">{applicant.full_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-muted-foreground" />
                                  <a href={`mailto:${applicant.email}`} className="text-sm text-primary hover:underline">
                                    {applicant.email}
                                  </a>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4 text-muted-foreground" />
                                  {applicant.phone ? (
                                    <a href={`tel:${applicant.phone}`} className="text-sm text-primary hover:underline">
                                      {applicant.phone}
                                    </a>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Not provided</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <MessageCircle className="w-4 h-4 text-green-600" />
                                  {applicant.whatsapp ? (
                                    <a 
                                      href={`https://wa.me/${applicant.whatsapp.replace(/[^0-9]/g, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-green-600 hover:underline flex items-center gap-1"
                                    >
                                      {applicant.whatsapp}
                                    </a>
                                  ) : applicant.phone ? (
                                    <a 
                                      href={`https://wa.me/${applicant.phone.replace(/[^0-9]/g, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-green-600 hover:underline flex items-center gap-1"
                                    >
                                      {applicant.phone}
                                      <span className="text-xs text-muted-foreground">(phone)</span>
                                    </a>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Not provided</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Notes Section */}
                          <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold flex items-center gap-2">
                                <StickyNote className="w-4 h-4 text-amber-600" />
                                Notes
                              </h4>
                              {editingApplicant !== applicant.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleStartEdit(applicant)}
                                  className="text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                                >
                                  <Pencil className="w-4 h-4 mr-1" />
                                  {applicant.notes ? 'Edit Note' : 'Add Note'}
                                </Button>
                              )}
                            </div>
                            
                            {editingApplicant === applicant.id ? (
                              <ApplicantNotesEditor
                                ref={notesEditorRef}
                                initialValue={editForm.notes}
                                placeholder="Add notes about this applicant..."
                              />
                            ) : applicant.notes ? (
                              <FormattedNotes content={applicant.notes} />
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No notes yet. Click "Add Note" to add observations about this applicant.
                              </p>
                            )}
                          </div>

                          {/* Candidate Profile Section */}
                          <div id={`candidate-profile-${applicant.id}`}>
                          <CandidateProfileSection
                            applicantId={applicant.id}
                            candidateProfile={applicant.candidate_profile}
                            onUpdate={(newProfile) => {
                              setApplicants(prev => prev.map(a => 
                                a.id === applicant.id ? { ...a, candidate_profile: newProfile } : a
                              ));
                            }}
                          />
                          </div>

                          {/* Role History Section */}
                          <div className="my-4">
                            <RoleHistorySection
                              currentJobTitle={applicant.job_title}
                              originalJobTitle={applicant.original_job_title}
                              reprofiledAt={applicant.reprofiled_at}
                            />
                            <div className="mt-3">
                              <ApplicationHistorySection email={applicant.email} currentId={applicant.id} phone={applicant.phone} />
                            </div>
                          </div>

                          {/* Check Availability for Bench applicants */}
                          {applicant.status === 'Bench' && (
                            <div className="mb-6 p-4 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-lg border border-cyan-200/50 dark:border-cyan-800/30">
                              <h4 className="font-semibold flex items-center gap-2 mb-3">
                                <CalendarPlus className="w-4 h-4 text-cyan-600" />
                                Availability Check
                              </h4>
                              <CheckAvailabilityButton
                                applicantId={applicant.id}
                                applicantEmail={applicant.email}
                                applicantName={applicant.full_name}
                                isAvailable={applicant.is_available}
                                availabilityCheckedAt={applicant.availability_checked_at}
                                onUpdate={(isAvailable, checkedAt) => {
                                  setApplicants(prev => prev.map(a => 
                                    a.id === applicant.id 
                                      ? { ...a, is_available: isAvailable, availability_checked_at: checkedAt } 
                                      : a
                                  ));
                                }}
                              />
                            </div>
                          )}

                          {/* CV and Vocaroo Links */}
                          <div className="flex flex-wrap gap-3 mb-4">
                            {applicant.cv_file_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadCv(applicant.id, applicant.cv_file_url!, applicant.full_name)}
                                disabled={downloadingCv === applicant.id}
                                className="inline-flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20"
                              >
                                {downloadingCv === applicant.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                                Download CV
                              </Button>
                            )}
                            {(applicant.vocaroo_link || applicant.voice_recording_url) && (
                              applicant.voice_recording_url ? (
                                <div className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm">
                                  <Mic className="w-4 h-4" />
                                  <audio controls className="h-8" src={applicant.voice_recording_url}>
                                    Your browser does not support audio.
                                  </audio>
                                </div>
                              ) : (
                                <a 
                                  href={applicant.vocaroo_link!} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm hover:bg-orange-500/20 transition-colors"
                                >
                                  <Mic className="w-4 h-4" />
                                  Listen to Voice Recording
                                </a>
                              )
                            )}
                          </div>

                          {/* Pre-screening Questions */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <BooleanBadge value={applicant.home_office} label="Home Office Setup" />
                            <BooleanBadge value={applicant.noise_canceling_headset} label="Noise-Canceling Headset" />
                            <BooleanBadge value={applicant.laptop_or_pc} label="Laptop/PC" />
                            <BooleanBadge value={applicant.good_internet} label="Good Internet" />
                            <BooleanBadge value={applicant.power_backup} label="Power Backup" />
                            <BooleanBadge value={applicant.can_work_40_50} label="40-50 hrs/week" />
                            <BooleanBadge value={applicant.us_timezone_ok} label="US Timezone OK" />
                            <BooleanBadge value={applicant.has_experience} label="Has Experience" />
                            <BooleanBadge value={!applicant.currently_working} label={applicant.currently_working ? `Employment Status: ${(applicant as any).employment_status || 'Employed'}` : 'Availability: Available'} />
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                              <p className="text-sm font-medium">Internet Speed</p>
                              <p className="text-sm text-muted-foreground">{applicant.internet_speed}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Start Availability</p>
                              <p className="text-sm text-muted-foreground">{applicant.start_availability}</p>
                            </div>
                            {(applicant as any).employment_status && (
                              <div>
                                <p className="text-sm font-medium">Employment Status</p>
                                <p className="text-sm text-muted-foreground">{(applicant as any).employment_status}</p>
                              </div>
                            )}
                            {(applicant as any).last_day_with_employer && (
                              <div>
                                <p className="text-sm font-medium">Last Day With Employer</p>
                                <p className="text-sm text-muted-foreground">{(applicant as any).last_day_with_employer}</p>
                              </div>
                            )}
                            {(applicant as any).upcoming_plans && (
                              <div className="col-span-2">
                                <p className="text-sm font-medium">Plans Next 3 Months</p>
                                <p className="text-sm text-muted-foreground">{(applicant as any).upcoming_plans}</p>
                              </div>
                            )}
                          </div>

                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                            );
                          })}
              </Accordion>
                      )}
                    </TabsContent>
                  );
                })}
                    </Tabs>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </TabsContent>

          {/* Pipeline Kanban Tab */}
          <TabsContent value="pipeline" className="space-y-1">
            <div className="px-4 pt-1">
              <h2 className="text-sm font-semibold">Client Hiring Pipeline</h2>
              <p className="text-[11px] text-muted-foreground">Track client hiring requests through the recruitment pipeline</p>
            </div>
            <HiringPipelineKanban />
          </TabsContent>

          {/* Sales Pipeline Tab */}
          <TabsContent value="sales-pipeline" className="space-y-1">
            <SalesPipeline />
          </TabsContent>

          {/* Post-Hire Pipeline Tab */}
          <TabsContent value="post-hire" className="space-y-1">
            <div className="px-4 pt-1">
              <h2 className="text-sm font-semibold">Post-Hire Pipeline</h2>
              <p className="text-[11px] text-muted-foreground">Track contractor milestones and send client check-in emails</p>
            </div>
            <PostHirePipelineKanban />
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-6">
            <ClientsDashboard />
          </TabsContent>

          {/* Contractors Tab */}
          <TabsContent value="contractors" className="space-y-6">
            <ContractorsDashboard />
          </TabsContent>

          {/* PL Tab */}
          <TabsContent value="pl" className="space-y-6">
            <PLDashboard />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <ClientAnalyticsDashboard />
          </TabsContent>

          {/* Team Activity Calendar Tab */}
          <TabsContent value="calendar" className="space-y-6">
            <TeamCalendar />
          </TabsContent>


          {/* Funnel Tab */}
          <TabsContent value="funnel" className="space-y-6" keepMounted>
            <RecruitmentFunnel />
          </TabsContent>

          <TabsContent value="talent-scout" className="space-y-6">
            <TalentScoutDashboard />
          </TabsContent>

          {/* External Scout Tab */}
          <TabsContent value="external-scout" className="space-y-6">
            <ExternalScoutDashboard />
          </TabsContent>

          {/* Workflow Tab */}
          <TabsContent value="workflow" className="space-y-6">
            <WorkflowBoard />
          </TabsContent>

          <TabsContent value="contracts" className="space-y-6">
            <ContractsManager />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Admin Permissions</h2>
                <p className="text-muted-foreground">Control which tabs each admin can access</p>
              </div>
            </div>
            <AdminPermissionsManager />
          </TabsContent>
        </Tabs>
      </main>

      {/* CV Preview Modal */}
      <Dialog open={!!previewCv} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span>CV Preview - {previewCv?.name}</span>
              <div className="flex gap-2">
                <input
                  ref={replaceCvInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleReplaceCv(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => replaceCvInputRef.current?.click()}
                  disabled={replacingCv || !previewCv?.applicantId}
                  className="flex items-center gap-2"
                >
                  {replacingCv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {replacingCv ? 'Uploading...' : 'Upload New CV'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(previewCv?.url, '_blank')}
                  className="flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Open Original
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadFromPreview}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden rounded-lg border bg-background">
            {previewCv && (
              <CVImagePreview 
                pdfUrl={previewCv.url} 
                fileName={previewCv.path} 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Popup Modal */}
      <Dialog open={!!notesPopup} onOpenChange={(open) => !open && setNotesPopup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-600" />
              Notes - {notesPopup?.name}
            </DialogTitle>
          </DialogHeader>
          {notesPopupEditing ? (
            <NotesEditor
              value={notesPopupValue}
              onChange={setNotesPopupValue}
              placeholder="Add notes about this applicant..."
              minHeight="120px"
            />
          ) : (
            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30 min-h-[100px]">
              {notesPopup?.notes ? (
                <FormattedNotes content={notesPopup.notes} />
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes have been added for this applicant yet.</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            {notesPopupEditing ? (
              <>
                <Button variant="outline" onClick={() => setNotesPopupEditing(false)} disabled={notesPopupSaving}>
                  Cancel
                </Button>
                <Button 
                  onClick={async () => {
                    if (!notesPopup) return;
                    setNotesPopupSaving(true);
                    try {
                      const { error } = await supabase
                        .from('applicants_prescreen')
                        .update({ notes: notesPopupValue.trim() || null })
                        .eq('id', notesPopup.id);
                      if (error) throw error;
                      // Update local state
                      setNotesPopup({ ...notesPopup, notes: notesPopupValue.trim() });
                      setApplicants(prev => prev.map(a => a.id === notesPopup.id ? { ...a, notes: notesPopupValue.trim() || null } : a));
                      setNotesPopupEditing(false);
                      toast({ title: 'Notes saved' });
                    } catch (err: any) {
                      toast({ title: 'Error saving notes', description: err.message, variant: 'destructive' });
                    } finally {
                      setNotesPopupSaving(false);
                    }
                  }}
                  disabled={notesPopupSaving}
                >
                  {notesPopupSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  setNotesPopupValue(notesPopup?.notes || '');
                  setNotesPopupEditing(true);
                }}>
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button variant="outline" onClick={() => { setNotesPopup(null); setNotesPopupEditing(false); }}>
                  Close
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Interview Invite Dialog */}
      <InterviewInviteDialog
        open={!!interviewInviteApplicant}
        onOpenChange={(open) => !open && setInterviewInviteApplicant(null)}
        applicant={interviewInviteApplicant}
      />

      {/* Email Template Editor */}
      <EmailTemplateEditor
        open={emailTemplateEditorOpen}
        onOpenChange={setEmailTemplateEditorOpen}
      />

      {/* Communication History */}
      <CommunicationHistory
        open={!!communicationHistoryApplicant}
        onOpenChange={(open) => {
          if (!open) {
            setCommunicationHistoryApplicant(null);
          }
        }}
        applicantId={communicationHistoryApplicant?.id || ''}
        applicantName={communicationHistoryApplicant?.name || ''}
        applicantEmail={communicationHistoryApplicant?.email || ''}
        onMarkAsRead={markMessagesAsRead}
      />

      {/* Send Email Dialog */}
      <SendEmailDialog
        open={!!sendEmailApplicant}
        onOpenChange={(open) => !open && setSendEmailApplicant(null)}
        applicant={sendEmailApplicant}
        preselectedTemplate={sendEmailApplicant?.preselectedTemplate}
        onEmailSent={() => {
          // Optionally refresh data
        }}
      />

      {/* Reprofiling Dialog */}
      <ReprofilingDialog
        open={!!reprofilingApplicant}
        onOpenChange={(open) => !open && setReprofilingApplicant(null)}
        applicant={reprofilingApplicant ? {
          id: reprofilingApplicant.id,
          full_name: reprofilingApplicant.full_name,
          email: reprofilingApplicant.email,
          job_title: reprofilingApplicant.job_title,
          job_id: reprofilingApplicant.job_id,
          original_job_id: reprofilingApplicant.original_job_id,
          original_job_title: reprofilingApplicant.original_job_title,
          status: reprofilingApplicant.status,
        } : null}
        onReprofiled={() => {
          fetchApplicants();
          setReprofilingApplicant(null);
        }}
      />

      {/* Hired Assignment Dialog */}
      <HiredAssignmentDialog
        open={!!hiredAssignmentApplicant}
        onOpenChange={(open) => {
          if (!open) {
            setHiredAssignmentApplicant(null);
            setPendingHiredStatusApplicantId(null);
          }
        }}
        applicant={hiredAssignmentApplicant}
        onComplete={() => {
          fetchApplicants();
          setHiredAssignmentApplicant(null);
          setPendingHiredStatusApplicantId(null);
        }}
      />

    </div>
  );
};

export default Admin;
