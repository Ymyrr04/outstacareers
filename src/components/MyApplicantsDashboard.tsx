import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import { format, addMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  Users,
  Briefcase,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Mic,
  Star,
  AlertTriangle,
  Download,
  Loader2,
  Search as SearchIcon,
  Send,
  History,
  MessageCircle,
  GripVertical,
  RefreshCw,
  FolderOpen,
  Eye,
  ChevronDown,
  ChevronUp,
  User,
  ClipboardList,
  StickyNote,
  ExternalLink,
  Zap,
  Check,
  X,
} from 'lucide-react';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CommunicationHistory } from '@/components/CommunicationHistory';
import { SendEmailDialog } from '@/components/SendEmailDialog';
import { CheckAvailabilityButton } from '@/components/CheckAvailabilityButton';
import { ApplicantSourceBadge } from '@/components/ApplicantSourceBadge';
import { InterviewInviteDialog } from '@/components/InterviewInviteDialog';
import { useUnreadMessageCounts, useEmailTemplates, statusToTrigger } from '@/hooks/useEmailTemplates';
import { CVImagePreview } from '@/components/CVImagePreview';
import { InterviewResultsFetcher } from '@/components/InterviewResultsFetcher';
import { ApplicantNotesEditor, ApplicantNotesEditorRef } from '@/components/ApplicantNotesEditor';
import { FormattedNotes } from '@/components/FormattedNotes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Status options for applicant tracking
const APPLICANT_STATUS_FOLDERS = [
  'For Review',
  'For Interview',
  'SIV',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Archive',
] as const;

const getStageDisplayName = (stage: string): string => {
  if (stage === 'Talent Pool') return 'Bench';
  if (stage === 'Bench') return 'Talent Pipeline';
  return stage;
};

type ApplicantStatusFolder = (typeof APPLICANT_STATUS_FOLDERS)[number];

interface Job {
  id: string;
  title: string;
  department: string;
  region: string;
  assigned_admin_id: string | null;
}

interface InterviewSession {
  id: string;
  status: string;
  overall_score: number | null;
  completed_at: string | null;
}

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  location: string;
  job_title: string;
  job_id: string | null;
  status: string;
  submitted_at: string;
  total_score: number | null;
  role_experience_score: number | null;
  skills_tools_score: number | null;
  availability_setup_score: number | null;
  cv_file_url: string | null;
  voice_recording_url: string | null;
  is_starred: boolean;
  job_source: string | null;
  is_available: boolean | null;
  availability_checked_at: string | null;
  details_viewed_at: string | null;
  interview_session: InterviewSession | null;
  // Additional fields for expanded view
  notes: string | null;
  candidate_profile: string | null;
  ai_summary: string | null;
  ai_assessment_details: any;
}

type SortOption = 'newest' | 'score-desc' | 'score-asc' | 'starred' | 'completed-assessment';

export const MyApplicantsDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [adminUsersMap, setAdminUsersMap] = useState<Record<string, string>>({});
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [activeStatusFolder, setActiveStatusFolder] = useState<ApplicantStatusFolder>('For Review');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const deferredSearchInput = useDeferredValue(searchInput);
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>('all');
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  
  // Drag and drop state
  const [draggedApplicant, setDraggedApplicant] = useState<Applicant | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<ApplicantStatusFolder | null>(null);
  
  // Communication state
  const [communicationHistoryApplicant, setCommunicationHistoryApplicant] = useState<{ id: string; name: string; email: string } | null>(null);
  const [sendEmailApplicant, setSendEmailApplicant] = useState<{ id: string; full_name: string; email: string; job_title: string; status: string; preselectedTemplate?: string } | null>(null);
  const [interviewInviteApplicant, setInterviewInviteApplicant] = useState<{ id?: string; full_name: string; email: string; job_title: string } | null>(null);
  
  // Expanded view state
  const [expandedApplicantId, setExpandedApplicantId] = useState<string | null>(null);
  const [cvPreviewApplicant, setCvPreviewApplicant] = useState<{ url: string; path: string; name: string } | null>(null);
  const [loadingCvPreview, setLoadingCvPreview] = useState(false);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const notesEditorRef = useRef<ApplicantNotesEditorRef>(null);
  const profileEditorRef = useRef<ApplicantNotesEditorRef>(null);
  const expandedRowRef = useRef<HTMLTableRowElement>(null);
  
  const { unreadCounts, markAsRead: markMessagesAsRead } = useUnreadMessageCounts();
  const { templates, getDefaultTemplateByTrigger } = useEmailTemplates();

  // Handle Escape key and click-outside to close expanded row
  useEffect(() => {
    if (!expandedApplicantId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedApplicantId(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (expandedRowRef.current && !expandedRowRef.current.contains(e.target as Node)) {
        // Check if click is on a dialog/popover (don't close if interacting with overlays)
        const target = e.target as HTMLElement;
        if (target.closest('[role="dialog"]') || target.closest('[data-radix-popper-content-wrapper]')) {
          return;
        }
        setExpandedApplicantId(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedApplicantId]);

  // Fetch admin users
  const fetchAdminUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-admin-users');
      if (error) throw error;
      
      const map: Record<string, string> = {};
      (data?.adminUsers || []).forEach((admin: { user_id: string; email: string }) => {
        map[admin.user_id] = admin.email;
      });
      setAdminUsersMap(map);
    } catch (error) {
      console.error('Failed to fetch admin users:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // 1. Fetch all jobs with assigned admins
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, title, department, region, assigned_admin_id')
        .not('assigned_admin_id', 'is', null);

      if (jobsError) throw jobsError;

      const assignedJobs = jobsData || [];
      setAllJobs(assignedJobs);

      if (assignedJobs.length === 0) {
        setApplicants([]);
        setLoading(false);
        return;
      }

      // 2. Fetch applicants for all assigned jobs
      const jobIds = assignedJobs.map(j => j.id);
      const { data: applicantsData, error: applicantsError } = await supabase
        .from('applicants_prescreen')
        .select(`
          id, full_name, email, phone, whatsapp, location, job_title, job_id, status, 
          submitted_at, total_score, role_experience_score, skills_tools_score, availability_setup_score,
          cv_file_url, voice_recording_url, 
          is_starred, job_source, is_available, availability_checked_at, details_viewed_at,
          notes, candidate_profile, ai_summary, ai_assessment_details
        `)
        .in('job_id', jobIds)
        .order('submitted_at', { ascending: false });

      if (applicantsError) throw applicantsError;

      // 3. Fetch interview sessions for these applicants
      const applicantIds = (applicantsData || []).map(a => a.id);
      let interviewMap: Record<string, InterviewSession> = {};
      
      if (applicantIds.length > 0) {
        const { data: sessions } = await supabase
          .from('interview_sessions')
          .select('id, applicant_id, status, overall_score, completed_at')
          .in('applicant_id', applicantIds);

        if (sessions) {
          sessions.forEach(s => {
            interviewMap[s.applicant_id] = {
              id: s.id,
              status: s.status,
              overall_score: s.overall_score,
              completed_at: s.completed_at,
            };
          });
        }
      }

      // Merge interview data
      const applicantsWithInterviews = (applicantsData || []).map(a => ({
        ...a,
        is_starred: a.is_starred ?? false,
        interview_session: interviewMap[a.id] || null,
        notes: a.notes ?? null,
        candidate_profile: a.candidate_profile ?? null,
        ai_summary: a.ai_summary ?? null,
        ai_assessment_details: a.ai_assessment_details ?? null,
      }));

      setApplicants(applicantsWithInterviews);
    } catch (error: any) {
      toast({
        title: 'Error loading data',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchAdminUsers();
    fetchData();
  }, [fetchAdminUsers, fetchData]);

  // Refresh when a job's assigned admin (or other details) changes elsewhere in the app
  useEffect(() => {
    const onJobUpdated = () => fetchData();
    window.addEventListener('job-updated', onJobUpdated);
    return () => window.removeEventListener('job-updated', onJobUpdated);
  }, [fetchData]);


  // Real-time subscription for applicants_prescreen changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('recruiter-dash-applicants-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applicants_prescreen' },
        (payload) => {
          console.log('RecruiterDash: Applicant change detected:', payload.eventType);
          // Refetch data to sync with other views
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchData]);

  // Get jobs filtered by selected admin
  const filteredJobs = useMemo(() => {
    if (selectedAdminFilter === 'all') return allJobs;
    return allJobs.filter(j => j.assigned_admin_id === selectedAdminFilter);
  }, [allJobs, selectedAdminFilter]);

  // Helper to calculate overall score
  const getOverallScore = (applicant: Applicant): { score: number; hasInterview: boolean } => {
    const cvScore = applicant.total_score ?? 0;
    const interviewScore = applicant.interview_session?.overall_score ?? null;
    
    if (interviewScore !== null) {
      return { score: (cvScore + interviewScore) / 2, hasInterview: true };
    }
    return { score: cvScore, hasInterview: false };
  };

  // Sort applicants
  const sortApplicants = (applicantsToSort: Applicant[]): Applicant[] => {
    return [...applicantsToSort].sort((a, b) => {
      if (sortOption === 'starred') {
        if (a.is_starred && !b.is_starred) return -1;
        if (!a.is_starred && b.is_starred) return 1;
        const aScore = getOverallScore(a);
        const bScore = getOverallScore(b);
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
        if (aScore.hasInterview && !bScore.hasInterview) return -1;
        if (!aScore.hasInterview && bScore.hasInterview) return 1;
        return sortOption === 'score-desc' 
          ? bScore.score - aScore.score 
          : aScore.score - bScore.score;
      }
      
      return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    });
  };

  // Check if we're in search mode (searching across all folders)
  const isSearchMode = searchTerm.trim().length > 0;

  // Filter applicants based on admin and job selection
  const filteredApplicants = useMemo(() => {
    // First filter by admin (via jobs assigned to that admin)
    const jobIdsForAdmin = filteredJobs.map(j => j.id);
    let filtered = applicants.filter(a => a.job_id && jobIdsForAdmin.includes(a.job_id));
    
    // When searching, scan ALL folders; otherwise filter by active folder
    if (!isSearchMode) {
      filtered = filtered.filter(a => a.status === activeStatusFolder);
    }
    
    // Then filter by specific job if selected
    if (selectedJobFilter !== 'all') {
      filtered = filtered.filter(a => a.job_id === selectedJobFilter);
    }
    
    // Then filter by search term (searches across all folders)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.full_name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        a.job_title.toLowerCase().includes(term) ||
        a.location.toLowerCase().includes(term) ||
        (a.phone && a.phone.toLowerCase().includes(term))
      );
    }
    
    return sortApplicants(filtered);
  }, [applicants, filteredJobs, activeStatusFolder, selectedJobFilter, searchTerm, sortOption, isSearchMode]);

  // Folder counts - based on filtered admin jobs
  const folderCounts = useMemo(() => {
    const jobIdsForAdmin = filteredJobs.map(j => j.id);
    const adminApplicants = applicants.filter(a => a.job_id && jobIdsForAdmin.includes(a.job_id));
    
    const counts: Record<ApplicantStatusFolder, number> = {} as any;
    APPLICANT_STATUS_FOLDERS.forEach(folder => {
      let filtered = adminApplicants.filter(a => a.status === folder);
      if (selectedJobFilter !== 'all') {
        filtered = filtered.filter(a => a.job_id === selectedJobFilter);
      }
      counts[folder] = filtered.length;
    });
    return counts;
  }, [applicants, filteredJobs, selectedJobFilter]);

  // Handle status change with email automation (same as Applicants tab)
  const handleStatusChange = async (applicantId: string, newStatus: string) => {
    const applicant = applicants.find(a => a.id === applicantId);
    if (!applicant) return;

    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ status: newStatus })
      .eq('id', applicantId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    } else {
      setApplicants(prev =>
        prev.map(a => (a.id === applicantId ? { ...a, status: newStatus } : a))
      );
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

  // Toggle star
  const handleToggleStar = async (applicantId: string) => {
    const applicant = applicants.find(a => a.id === applicantId);
    if (!applicant) return;
    
    const newStarred = !applicant.is_starred;
    
    setApplicants(prev => prev.map(a => 
      a.id === applicantId ? { ...a, is_starred: newStarred } : a
    ));
    
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ is_starred: newStarred })
      .eq('id', applicantId);
    
    if (error) {
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, applicant: Applicant) => {
    setDraggedApplicant(applicant);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedApplicant(null);
    setDragOverFolder(null);
  };

  const handleDragOver = (e: React.DragEvent, folder: ApplicantStatusFolder) => {
    e.preventDefault();
    if (draggedApplicant && draggedApplicant.status !== folder) {
      setDragOverFolder(folder);
    }
  };

  const handleDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleDrop = async (e: React.DragEvent, folder: ApplicantStatusFolder) => {
    e.preventDefault();
    if (draggedApplicant && draggedApplicant.status !== folder) {
      await handleStatusChange(draggedApplicant.id, folder);
    }
    setDraggedApplicant(null);
    setDragOverFolder(null);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Get job title by ID
  const getJobTitle = (jobId: string | null) => {
    if (!jobId) return 'Unknown';
    const job = allJobs.find(j => j.id === jobId);
    return job?.title || 'Unknown';
  };

  // Save notes
  const handleSaveNotes = async (applicantId: string) => {
    if (!notesEditorRef.current) return;
    setSavingNotes(true);
    const newNotes = notesEditorRef.current.getValue();
    
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ notes: newNotes })
      .eq('id', applicantId);
    
    if (error) {
      toast({ title: 'Error', description: 'Failed to save notes', variant: 'destructive' });
    } else {
      setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, notes: newNotes } : a));
      setEditingNotesId(null);
      toast({ title: 'Notes saved' });
    }
    setSavingNotes(false);
  };

  // Save profile
  const handleSaveProfile = async (applicantId: string) => {
    if (!profileEditorRef.current) return;
    setSavingNotes(true);
    const newProfile = profileEditorRef.current.getValue();
    
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({ candidate_profile: newProfile })
      .eq('id', applicantId);
    
    if (error) {
      toast({ title: 'Error', description: 'Failed to save profile', variant: 'destructive' });
    } else {
      setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, candidate_profile: newProfile } : a));
      setEditingProfileId(null);
      toast({ title: 'Profile saved' });
    }
    setSavingNotes(false);
  };

  // Extract file path from CV URL or return as-is if it's already a relative path
  const extractCvPath = (url: string): string | null => {
    try {
      // If it's already a relative path (e.g., "applications/xxx.pdf" or "bulk/xxx.pdf"), return as-is
      if (!url.includes('://') && !url.startsWith('/')) {
        return url;
      }
      
      // URL format: https://<project>.supabase.co/storage/v1/object/public/cv-uploads/<path>
      const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/cv-uploads\/(.+?)(?:\?|$)/);
      if (match) return decodeURIComponent(match[1]);
      
      // Fallback: try to get everything after cv-uploads/
      const fallbackMatch = url.match(/cv-uploads\/(.+?)(?:\?|$)/);
      if (fallbackMatch) return decodeURIComponent(fallbackMatch[1]);
      
      return null;
    } catch {
      return null;
    }
  };

  // Handle CV preview - download and create blob URL
  const handlePreviewCv = async (cvUrl: string, applicantName: string) => {
    const cvPath = extractCvPath(cvUrl);
    if (!cvPath) {
      toast({ title: 'Error', description: 'Could not extract CV path', variant: 'destructive' });
      return;
    }

    setLoadingCvPreview(true);
    try {
      const { data, error } = await supabase.storage
        .from('cv-uploads')
        .download(cvPath);

      if (error) {
        toast({ title: 'Error', description: 'Failed to load CV: ' + error.message, variant: 'destructive' });
        return;
      }

      // Determine MIME type and file extension
      const extension = cvPath.split('.').pop()?.toLowerCase() || 'pdf';
      let mimeType = 'application/pdf';
      if (extension === 'doc') {
        mimeType = 'application/msword';
      } else if (extension === 'docx') {
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }

      // Create blob with correct MIME type
      const blob = new Blob([data], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      // Use the actual file extension in the name so CVImagePreview can correctly identify the file type
      setCvPreviewApplicant({ url: blobUrl, path: cvPath, name: `${applicantName}-CV.${extension}` });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load CV', variant: 'destructive' });
    } finally {
      setLoadingCvPreview(false);
    }
  };

  // Close CV preview and revoke blob URL
  const handleCloseCvPreview = () => {
    if (cvPreviewApplicant?.url) {
      URL.revokeObjectURL(cvPreviewApplicant.url);
    }
    setCvPreviewApplicant(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading applicants...</span>
      </div>
    );
  }

  if (allJobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Jobs With Assigned Admins</h3>
          <p className="text-muted-foreground">
            There are no jobs with assigned admins yet. Assign admins to jobs in the Jobs tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Applicants by Role Owner</h2>
          <p className="text-muted-foreground">
            {selectedAdminFilter === 'all' 
              ? `Viewing applicants across ${allJobs.length} assigned jobs`
              : `${filteredJobs.length} job${filteredJobs.length !== 1 ? 's' : ''} • ${getAdminDisplayName(adminUsersMap[selectedAdminFilter], 'Unknown Admin')}`
            }
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search applicants..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearchTerm(searchInput);
              }
            }}
            className={`pl-9 ${deferredSearchInput && deferredSearchInput !== searchTerm ? 'pr-24' : deferredSearchInput ? 'pr-10' : ''}`}
          />
          {deferredSearchInput && deferredSearchInput !== searchTerm && (
            <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Press Enter
            </span>
          )}
          {deferredSearchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearchTerm('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={selectedAdminFilter} onValueChange={(v) => {
          setSelectedAdminFilter(v);
          setSelectedJobFilter('all'); // Reset job filter when admin changes
        }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by admin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Admins</SelectItem>
            {Object.entries(adminUsersMap).map(([id, email]) => (
              <SelectItem key={id} value={id}>{getAdminDisplayName(email)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedJobFilter} onValueChange={setSelectedJobFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by job" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {filteredJobs.map(job => (
              <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="score-desc">Score: High → Low</SelectItem>
            <SelectItem value="score-asc">Score: Low → High</SelectItem>
            <SelectItem value="starred">Starred First</SelectItem>
            <SelectItem value="completed-assessment">Completed Assessment</SelectItem>
          </SelectContent>
        </Select>
        {(selectedAdminFilter !== 'all' || selectedJobFilter !== 'all' || searchTerm) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedAdminFilter('all');
              setSelectedJobFilter('all');
              setSearchTerm('');
              setSearchInput('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Status Folder Tabs - hidden when searching */}
      {isSearchMode ? (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Searching across all folders for "<span className="font-medium text-foreground">{searchTerm}</span>"
          </span>
          <Badge variant="secondary">{filteredApplicants.length} result{filteredApplicants.length !== 1 ? 's' : ''}</Badge>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {APPLICANT_STATUS_FOLDERS.map(folder => (
            <Button
              key={folder}
              variant={activeStatusFolder === folder ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveStatusFolder(folder)}
              onDragOver={(e) => handleDragOver(e, folder)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder)}
              className={`transition-all ${
                dragOverFolder === folder ? 'ring-2 ring-primary ring-offset-2' : ''
              }`}
            >
              {getStageDisplayName(folder)}
              {folderCounts[folder] > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {folderCounts[folder]}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      )}

      {/* Applicants Table */}
      {filteredApplicants.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {isSearchMode 
                ? `No applicants found matching "${searchTerm}"`
                : `No applicants in "${activeStatusFolder}" folder${selectedJobFilter !== 'all' ? ' for this job' : ''}`
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>{isSearchMode ? 'Folder' : 'Status'}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApplicants.map(applicant => {
                const scoreData = getOverallScore(applicant);
                const unreadCount = unreadCounts[applicant.id] || 0;
                const isExpanded = expandedApplicantId === applicant.id;
                
                return (
                  <React.Fragment key={applicant.id}>
                    <TableRow
                      draggable
                      onDragStart={(e) => handleDragStart(e, applicant)}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleToggleStar(applicant.id)}
                          >
                            <Star
                              className={`w-4 h-4 ${
                                applicant.is_starred
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {applicant.full_name}
                            {unreadCount > 0 && (
                              <Badge className="bg-red-500 hover:bg-red-500 text-white text-xs">
                                {unreadCount}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{applicant.email}</div>
                          <div className="flex items-center gap-1 mt-1">
                            {applicant.cv_file_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                title="Preview CV"
                                disabled={loadingCvPreview}
                                onClick={() => handlePreviewCv(applicant.cv_file_url!, applicant.full_name)}
                              >
                                {loadingCvPreview ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FileText className="w-3 h-3 text-blue-500" />
                                )}
                              </Button>
                            )}
                            {applicant.voice_recording_url && (
                              <span title="Has Voice Recording">
                                <Mic className="w-3 h-3 text-purple-500" />
                              </span>
                            )}
                            {applicant.interview_session?.status === 'completed' && (
                              <span title="Interview Completed">
                                <CheckCircle className="w-3 h-3 text-green-500" />
                              </span>
                            )}
                            <ApplicantSourceBadge source={applicant.job_source} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{applicant.job_title}</div>
                        <div className="text-xs text-muted-foreground">
                          {getJobTitle(applicant.job_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(applicant.email);
                              toast({ title: "Copied!", description: "Email copied to clipboard" });
                            }}
                            className="text-blue-600 hover:underline truncate max-w-[180px] text-left cursor-pointer"
                            title="Click to copy email"
                          >
                            {applicant.email}
                          </button>
                          {applicant.phone && (
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(applicant.phone!);
                                toast({ title: "Copied!", description: "Phone copied to clipboard" });
                              }}
                              className="text-muted-foreground hover:underline text-left cursor-pointer"
                              title="Click to copy phone"
                            >
                              {applicant.phone}
                            </button>
                          )}
                          {applicant.whatsapp && (
                            <a 
                              href={`https://wa.me/${applicant.whatsapp.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:underline"
                              title="Open WhatsApp"
                            >
                              WA: {applicant.whatsapp}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {scoreData.score > 0 ? (
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={
                                scoreData.score >= 80
                                  ? 'default'
                                  : scoreData.score >= 60
                                  ? 'secondary'
                                  : 'outline'
                              }
                              className={
                                scoreData.score >= 80
                                  ? 'bg-green-500 hover:bg-green-500'
                                  : scoreData.score >= 60
                                  ? 'bg-amber-500 hover:bg-amber-500 text-white'
                                  : ''
                              }
                            >
                              {scoreData.score.toFixed(0)}
                            </Badge>
                            {scoreData.hasInterview && (
                              <span className="text-xs text-muted-foreground" title="Includes interview">
                                +IV
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatDate(applicant.submitted_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={applicant.status}
                          onValueChange={(v) => handleStatusChange(applicant.id, v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {APPLICANT_STATUS_FOLDERS.map(status => (
                              <SelectItem key={status} value={status}>
                                {getStageDisplayName(status)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant={isExpanded ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 px-2"
                            title={isExpanded ? 'Collapse Details' : 'View Details'}
                            onClick={() => setExpandedApplicantId(isExpanded ? null : applicant.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                            {isExpanded ? 'Close' : 'Details'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="View History"
                            onClick={() => setCommunicationHistoryApplicant({
                              id: applicant.id,
                              name: applicant.full_name,
                              email: applicant.email,
                            })}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Send Email"
                            onClick={() => setSendEmailApplicant({
                              id: applicant.id,
                              full_name: applicant.full_name,
                              email: applicant.email,
                              job_title: applicant.job_title,
                              status: applicant.status,
                            })}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                          {applicant.status === 'Bench' && (
                            <CheckAvailabilityButton
                              applicantId={applicant.id}
                              applicantName={applicant.full_name}
                              applicantEmail={applicant.email}
                              isAvailable={applicant.is_available ?? null}
                              availabilityCheckedAt={applicant.availability_checked_at ?? null}
                              onUpdate={() => fetchData()}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Details Row */}
                    {isExpanded && (
                      <TableRow ref={expandedRowRef} onMouseDown={(e) => e.stopPropagation()}>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-4" onMouseDown={(e) => e.stopPropagation()}>
                            <Tabs defaultValue="cv-assessment" className="w-full">
                              <TabsList className="grid w-full grid-cols-4 max-w-lg">
                                <TabsTrigger value="cv-assessment" className="flex items-center gap-1">
                                  <ClipboardList className="w-3 h-3" />
                                  CV Assessment
                                </TabsTrigger>
                                <TabsTrigger value="interview" className="flex items-center gap-1">
                                  <Mic className="w-3 h-3" />
                                  Interview
                                </TabsTrigger>
                                <TabsTrigger value="notes" className="flex items-center gap-1">
                                  <StickyNote className="w-3 h-3" />
                                  Notes
                                </TabsTrigger>
                                <TabsTrigger value="profile" className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  Profile
                                </TabsTrigger>
                              </TabsList>
                              
                              {/* CV Assessment Tab */}
                              <TabsContent value="cv-assessment" className="mt-4">
                                <div className="space-y-4">
                                  {applicant.cv_file_url && (
                                    <div className="flex items-center gap-2 mb-4">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={loadingCvPreview}
                                        onClick={() => handlePreviewCv(applicant.cv_file_url!, applicant.full_name)}
                                      >
                                        {loadingCvPreview ? (
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                          <Eye className="w-4 h-4 mr-2" />
                                        )}
                                        Preview CV
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(applicant.cv_file_url!, '_blank')}
                                      >
                                        <ExternalLink className="w-4 h-4 mr-2" />
                                        Open Original
                                      </Button>
                                    </div>
                                  )}
                                  
                                  {applicant.ai_summary && (
                                    <div className="bg-background rounded-lg p-4 border">
                                      <h4 className="font-medium mb-2 text-sm">AI Summary</h4>
                                      <p className="text-sm text-muted-foreground">{applicant.ai_summary}</p>
                                    </div>
                                  )}
                                  
                                  {applicant.total_score !== null && (
                                    <div className="p-4 bg-muted/50 rounded-lg">
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Star className="w-4 h-4" />
                                        AI CV Assessment
                                      </h4>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                        <div className="text-center p-2 bg-background rounded">
                                          <p className="text-xs text-muted-foreground">Role Experience</p>
                                          <p className="text-lg font-bold">{applicant.role_experience_score ?? applicant.ai_assessment_details?.roleExperienceScore ?? '-'}/50</p>
                                        </div>
                                        <div className="text-center p-2 bg-background rounded">
                                          <p className="text-xs text-muted-foreground">Skills & Tools</p>
                                          <p className="text-lg font-bold">{applicant.skills_tools_score ?? applicant.ai_assessment_details?.skillsToolsScore ?? '-'}/45</p>
                                        </div>
                                        <div className="text-center p-2 bg-background rounded">
                                          <p className="text-xs text-muted-foreground">Availability</p>
                                          <p className="text-lg font-bold">{applicant.availability_setup_score ?? applicant.ai_assessment_details?.availabilitySetupScore ?? '-'}/5</p>
                                        </div>
                                        <div className="text-center p-2 bg-primary/10 rounded border border-primary/20">
                                          <p className="text-xs text-muted-foreground">Total Score</p>
                                          <p className="text-xl font-bold text-primary">{applicant.total_score}/100</p>
                                        </div>
                                      </div>

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
                                                {applicant.ai_assessment_details.matched_tools?.map((tool: any, idx: number) => (
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
                                                {applicant.ai_assessment_details.missing_tools?.map((tool: string, idx: number) => (
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
                                                {applicant.ai_assessment_details.experience_highlights.map((exp: any, idx: number) => (
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
                                                    {exp.relevance && (
                                                      <p className="text-xs text-muted-foreground mt-1">{exp.relevance}</p>
                                                    )}
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
                                                  {applicant.ai_assessment_details.strengths.map((strength: string, idx: number) => (
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
                                                  {applicant.ai_assessment_details.concerns.map((concern: string, idx: number) => (
                                                    <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                                      <span className="text-amber-600">•</span>
                                                      {concern}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {!applicant.ai_summary && applicant.total_score === null && (
                                    <div className="p-6 bg-muted/30 rounded-lg text-center">
                                      <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                      <p className="text-muted-foreground">No CV assessment available yet.</p>
                                    </div>
                                  )}
                                </div>
                              </TabsContent>
                              
                              {/* Interview Tab */}
                              <TabsContent value="interview" className="mt-4">
                                <InterviewResultsFetcher 
                                  applicantId={applicant.id}
                                  cachedSession={null}
                                />
                              </TabsContent>
                              
                              {/* Notes Tab */}
                              <TabsContent value="notes" className="mt-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-sm">Notes</h4>
                                    {editingNotesId === applicant.id ? (
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setEditingNotesId(null)}
                                          disabled={savingNotes}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => handleSaveNotes(applicant.id)}
                                          disabled={savingNotes}
                                        >
                                          {savingNotes && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                          Save
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingNotesId(applicant.id)}
                                      >
                                        {applicant.notes ? 'Edit' : 'Add Notes'}
                                      </Button>
                                    )}
                                  </div>
                                  {editingNotesId === applicant.id ? (
                                    <ApplicantNotesEditor
                                      ref={notesEditorRef}
                                      initialValue={applicant.notes || ''}
                                      placeholder="Add notes about this applicant..."
                                    />
                                  ) : applicant.notes ? (
                                    <div className="bg-background rounded-lg p-4 border">
                                      <FormattedNotes content={applicant.notes} />
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                                  )}
                                </div>
                              </TabsContent>
                              
                              {/* Profile Tab */}
                              <TabsContent value="profile" className="mt-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-sm">Candidate Profile</h4>
                                    {editingProfileId === applicant.id ? (
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setEditingProfileId(null)}
                                          disabled={savingNotes}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => handleSaveProfile(applicant.id)}
                                          disabled={savingNotes}
                                        >
                                          {savingNotes && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                          Save
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingProfileId(applicant.id)}
                                      >
                                        {applicant.candidate_profile ? 'Edit' : 'Add Profile'}
                                      </Button>
                                    )}
                                  </div>
                                  {editingProfileId === applicant.id ? (
                                    <ApplicantNotesEditor
                                      ref={profileEditorRef}
                                      initialValue={applicant.candidate_profile || ''}
                                      placeholder="Add candidate profile summary..."
                                    />
                                  ) : applicant.candidate_profile ? (
                                    <div className="bg-background rounded-lg p-4 border">
                                      <FormattedNotes content={applicant.candidate_profile} />
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No profile summary yet.</p>
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialogs */}
      {communicationHistoryApplicant && (
        <CommunicationHistory
          applicantId={communicationHistoryApplicant.id}
          applicantName={communicationHistoryApplicant.name}
          applicantEmail={communicationHistoryApplicant.email}
          open={!!communicationHistoryApplicant}
          onOpenChange={(open) => {
            if (!open) {
              setCommunicationHistoryApplicant(null);
            }
          }}
          onMarkAsRead={() => markMessagesAsRead(communicationHistoryApplicant.id)}
        />
      )}

      {sendEmailApplicant && (
        <SendEmailDialog
          open={!!sendEmailApplicant}
          onOpenChange={(open) => {
            if (!open) setSendEmailApplicant(null);
          }}
          applicant={{
            id: sendEmailApplicant.id,
            full_name: sendEmailApplicant.full_name,
            email: sendEmailApplicant.email,
            job_title: sendEmailApplicant.job_title,
            status: sendEmailApplicant.status,
          }}
          preselectedTemplate={sendEmailApplicant.preselectedTemplate}
        />
      )}

      {interviewInviteApplicant && (
        <InterviewInviteDialog
          open={!!interviewInviteApplicant}
          onOpenChange={(open) => {
            if (!open) setInterviewInviteApplicant(null);
          }}
          applicant={{
            id: interviewInviteApplicant.id,
            full_name: interviewInviteApplicant.full_name,
            email: interviewInviteApplicant.email,
            job_title: interviewInviteApplicant.job_title,
          }}
        />
      )}

      {/* CV Preview Dialog */}
      <Dialog open={!!cvPreviewApplicant} onOpenChange={(open) => { if (!open) handleCloseCvPreview(); }}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                CV Preview - {cvPreviewApplicant?.name}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(cvPreviewApplicant?.url, '_blank')}
                  className="flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Open Original
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden rounded-lg">
            {cvPreviewApplicant && (
              <CVImagePreview 
                pdfUrl={cvPreviewApplicant.url} 
                fileName={cvPreviewApplicant.path}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyApplicantsDashboard;
