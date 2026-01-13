import { useEffect, useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate, Link } from 'react-router-dom';
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
import { LogOut, Trash2, Eye, EyeOff, ArrowLeft, Users, Briefcase, MapPin, Clock, CheckCircle, XCircle, FileText, Mic, Star, Check, X, Zap, AlertTriangle, Download, Loader2, FolderOpen, Upload, Pencil, Save, Phone, Mail, User, StickyNote, Search as SearchIcon, CalendarPlus, Settings, History, Send, ClipboardList, Link2, UserCog, MessageCircle } from 'lucide-react';
import { generateJobUrl } from '@/lib/slugify';
import { InterviewResultsView } from '@/components/InterviewResultsView';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import BulkUploadDialog from '@/components/BulkUploadDialog';
import ApplicantSearchFilters from '@/components/ApplicantSearchFilters';
import ApplicantSearchResults from '@/components/ApplicantSearchResults';
import { InterviewInviteDialog } from '@/components/InterviewInviteDialog';
import { EmailTemplateEditor } from '@/components/EmailTemplateEditor';
import { CommunicationHistory } from '@/components/CommunicationHistory';
import { SendEmailDialog } from '@/components/SendEmailDialog';
import { CheckAvailabilityButton } from '@/components/CheckAvailabilityButton';
import { ReprofilingDialog } from '@/components/ReprofilingDialog';
import { CandidateProfileSection } from '@/components/CandidateProfileSection';
import { RoleHistorySection } from '@/components/RoleHistorySection';
import { ApplicantSourceBadge } from '@/components/ApplicantSourceBadge';
import { useEmailTemplates, statusToTrigger } from '@/hooks/useEmailTemplates';
import { addHours } from 'date-fns';

// Status options for applicant tracking - "For Review" is the default for new applicants
// Status options for applicant tracking - new pipeline order
const APPLICANT_STATUS_FOLDERS = [
  'For Review',
  'For Interview',
  'SIV',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject'
] as const;

// Dropdown options include all statuses (For Review can be selected to move back)
const APPLICANT_STATUS_OPTIONS = [
  'For Review',
  'For Interview',
  'SIV',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject'
] as const;

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

interface AssessmentDetails {
  matched_tools: ToolMatch[];
  missing_tools: string[];
  experience_highlights: ExperienceHighlight[];
  strengths: string[];
  concerns: string[];
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
}

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [adminUsersMap, setAdminUsersMap] = useState<Record<string, string>>({});
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(true);
  const [expandedApplicant, setExpandedApplicant] = useState<string | null>(null);
  const [downloadingCv, setDownloadingCv] = useState<string | null>(null);
  const [activeStatusFolder, setActiveStatusFolder] = useState<ApplicantStatusFolder>('For Review');
  const [previewCv, setPreviewCv] = useState<{ url: string; path: string; name: string; cvText: string | null } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Edit mode state
  const [editingApplicant, setEditingApplicant] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    full_name: string;
    email: string;
    phone: string;
    notes: string;
  }>({ full_name: '', email: '', phone: '', notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Notes popup state
  const [notesPopup, setNotesPopup] = useState<{ id: string; name: string; notes: string } | null>(null);
  
  // Interview invite state
  const [interviewInviteApplicant, setInterviewInviteApplicant] = useState<{ full_name: string; email: string; job_title: string } | null>(null);
  
  // Email system state
  const [emailTemplateEditorOpen, setEmailTemplateEditorOpen] = useState(false);
  const [communicationHistoryApplicant, setCommunicationHistoryApplicant] = useState<{ id: string; name: string; email: string } | null>(null);
  const [sendEmailApplicant, setSendEmailApplicant] = useState<{ id: string; full_name: string; email: string; job_title: string; status: string } | null>(null);
  const { templates, getTemplateByTrigger } = useEmailTemplates();
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [activeApplicantTab, setActiveApplicantTab] = useState<'folders' | 'search'>('folders');
  const [searchFilteredApplicants, setSearchFilteredApplicants] = useState<Applicant[]>([]);
  
  // Reprofiling state
  const [reprofilingApplicant, setReprofilingApplicant] = useState<Applicant | null>(null);
  
  // Drag and drop state
  const [draggedApplicant, setDraggedApplicant] = useState<Applicant | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<ApplicantStatusFolder | null>(null);

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
      setPreviewCv({ url, path: cvPath, name: applicantName, cvText });
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

  const handleDownloadFromPreview = () => {
    if (!previewCv) return;
    const a = document.createElement('a');
    a.href = previewCv.url;
    a.download = previewCv.path.split('/').pop() || 'cv.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({
      title: 'Success',
      description: 'CV downloaded successfully',
    });
  };

  const handleDownloadCv = async (applicantId: string, cvPath: string) => {
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
      a.download = cvPath.split('/').pop() || 'cv.pdf';
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

  const fetchApplicants = async () => {
    setApplicantsLoading(true);
    
    // Fetch applicants
    const { data: applicantsData, error: applicantsError } = await supabase
      .from('applicants_prescreen')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (applicantsError) {
      toast({
        title: 'Error',
        description: 'Failed to fetch applicants',
        variant: 'destructive',
      });
      setApplicantsLoading(false);
      return;
    }

    // Fetch interview sessions for all applicants
    const applicantIds = (applicantsData || []).map(a => a.id);
    let interviewSessions: Record<string, InterviewSession> = {};
    
    if (applicantIds.length > 0) {
      const { data: sessionsData } = await supabase
        .from('interview_sessions')
        .select('*')
        .in('applicant_id', applicantIds);
      
      if (sessionsData) {
        sessionsData.forEach(session => {
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
        });
      }
    }

    // Combine applicants with their interview sessions
    const applicantsWithInterviews = (applicantsData || []).map(item => ({
      ...item,
      ai_assessment_details: item.ai_assessment_details as unknown as AssessmentDetails | null,
      interview_session: interviewSessions[item.id] || null
    }));
    
    setApplicants(applicantsWithInterviews);
    setApplicantsLoading(false);
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchJobs();
      fetchApplicants();
      fetchAdminUsers();
    }
  }, [user, isAdmin]);

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
    if (!confirm('Are you sure you want to delete this applicant?')) return;

    const { error } = await supabase.from('applicants_prescreen').delete().eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Applicant deleted successfully',
      });
      fetchApplicants();
    }
  };

  const handleUpdateApplicantStatus = async (applicantId: string, newStatus: ApplicantStatusOption) => {
    const applicant = applicants.find(a => a.id === applicantId);
    if (!applicant) return;

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
        const template = getTemplateByTrigger(trigger);
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
          let scheduleFor: string | undefined;
          if (template.delay_hours > 0) {
            scheduleFor = addHours(new Date(), template.delay_hours).toISOString();
          }

          // For interview status, open the email dialog instead of auto-sending
          if (trigger === 'for_interview') {
            setSendEmailApplicant({
              id: applicant.id,
              full_name: applicant.full_name,
              email: applicant.email,
              job_title: applicant.job_title,
              status: newStatus,
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
      notes: applicant.notes || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingApplicant(null);
    setEditForm({ full_name: '', email: '', phone: '', notes: '' });
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

    setSavingEdit(true);
    const { error } = await supabase
      .from('applicants_prescreen')
      .update({
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        notes: editForm.notes.trim() || null,
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
              notes: editForm.notes.trim() || null,
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

  if (loading) {
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Site
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="jobs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="applicants" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Applicants
              {applicants.length > 0 && (
                <Badge variant="secondary" className="ml-1">{applicants.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">All Jobs</h2>
                <p className="text-muted-foreground">Manage your job listings</p>
              </div>
              <AddJobDialog onJobAdded={fetchJobs} />
            </div>

            {jobsLoading ? (
              <p className="text-center py-12">Loading jobs...</p>
            ) : jobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No jobs yet. Add your first job listing!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {jobs.map((job) => (
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
                                {adminUsersMap[job.assigned_admin_id]}
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
                              // Use production URL for shareable links
                              const productionOrigin = 'https://outstacareers.lovable.app';
                              const url = `${productionOrigin}${generateJobUrl(job.title, job.id)}`;
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
                <Button 
                  variant="outline" 
                  onClick={() => setEmailTemplateEditorOpen(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Email Templates
                </Button>
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

            {applicantsLoading ? (
              <p className="text-center py-12">Loading applicants...</p>
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

                  {/* Advanced Search Tab */}
                  <TabsContent value="search" className="space-y-4">
                    <ApplicantSearchFilters
                      applicants={applicants}
                      onFilteredApplicants={handleSearchFilteredApplicants}
                      allSkills={allSkills}
                      allTools={allTools}
                    />
                    
                    <ApplicantSearchResults
                      applicants={searchFilteredApplicants}
                      statusOptions={APPLICANT_STATUS_OPTIONS}
                      onUpdateStatus={handleUpdateApplicantStatus}
                      onViewDetails={(id) => setExpandedApplicant(expandedApplicant === id ? null : id)}
                      onDelete={handleDeleteApplicant}
                      onPreviewCv={handlePreviewCv}
                      onShowNotes={(id, name, notes) => setNotesPopup({ id, name, notes })}
                      onDownloadCv={handleDownloadCv}
                      onUpdateApplicant={async (applicantId, data) => {
                        const { error } = await supabase
                          .from('applicants_prescreen')
                          .update({
                            full_name: data.full_name,
                            email: data.email,
                            phone: data.phone,
                            notes: data.notes,
                          })
                          .eq('id', applicantId);
                        
                        if (error) {
                          toast({
                            title: 'Error',
                            description: 'Failed to update applicant: ' + error.message,
                            variant: 'destructive',
                          });
                        } else {
                          setApplicants(prev => prev.map(a => 
                            a.id === applicantId 
                              ? { ...a, ...data } 
                              : a
                          ));
                          toast({
                            title: 'Success',
                            description: 'Applicant information updated',
                          });
                        }
                      }}
                      onSendInvite={(applicant) => setInterviewInviteApplicant(applicant)}
                      onSendEmail={(applicant) => setSendEmailApplicant(applicant)}
                      onViewHistory={(applicant) => setCommunicationHistoryApplicant(applicant)}
                      onCheckAvailability={async (applicant) => {
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
                      expandedApplicant={expandedApplicant}
                      loadingPreview={loadingPreview}
                      downloadingCv={downloadingCv}
                    />
                  </TabsContent>

                  {/* Folder View Tab */}
                  <TabsContent value="folders" className="space-y-4">
                    {/* Quick search for folder view */}
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Quick search by name, email, or score..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                
                    <Tabs value={activeStatusFolder} onValueChange={(v) => setActiveStatusFolder(v as ApplicantStatusFolder)} className="space-y-4">
                    <TabsList className="flex-wrap h-auto gap-1">
                      {APPLICANT_STATUS_FOLDERS.map((status) => {
                        const count = applicants.filter(a => a.status === status).length;
                        const isDragOver = dragOverFolder === status;
                        return (
                          <TabsTrigger 
                            key={status} 
                            value={status} 
                            className={`flex items-center gap-2 transition-all ${
                              isDragOver ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 scale-105' : ''
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
                            {status}
                            {/* Only show count badge on "For Review" folder */}
                            {status === 'For Review' && count > 0 && (
                              <Badge variant="secondary" className="ml-1 text-xs">
                                {count}
                              </Badge>
                            )}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>

                {APPLICANT_STATUS_FOLDERS.map((status) => {
                  // Filter by status first, then by search term
                  const statusApplicants = applicants.filter(a => {
                    if (a.status !== status) return false;
                    if (!searchTerm.trim()) return true;
                    
                    const term = searchTerm.toLowerCase();
                    const matchesName = a.full_name.toLowerCase().includes(term);
                    const matchesEmail = a.email.toLowerCase().includes(term);
                    const matchesScore = a.total_score !== null && a.total_score.toString().includes(term);
                    
                    return matchesName || matchesEmail || matchesScore;
                  });
                  const groupedByRole = statusApplicants.reduce((groups, applicant) => {
                    const jobTitle = applicant.job_title;
                    if (!groups[jobTitle]) {
                      groups[jobTitle] = [];
                    }
                    groups[jobTitle].push(applicant);
                    return groups;
                  }, {} as Record<string, Applicant[]>);

                  return (
                    <TabsContent key={status} value={status} className="space-y-4">
                      {statusApplicants.length === 0 ? (
                        <Card>
                          <CardContent className="py-12 text-center">
                            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">No applicants in "{status}" folder.</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <Accordion type="multiple" className="space-y-4">
                          {Object.entries(groupedByRole).map(([jobTitle, jobApplicants]) => (
                            <AccordionItem key={jobTitle} value={jobTitle} className="border rounded-lg bg-card">
                              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                <div className="flex items-center gap-3">
                                  <Briefcase className="w-5 h-5 text-primary" />
                                  <span className="font-semibold text-lg">{jobTitle}</span>
                                  <Badge variant="secondary" className="ml-2">
                                    {jobApplicants.length} applicant{jobApplicants.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-4 pb-4">
                                <div className="grid gap-4">
                {jobApplicants.map((applicant) => {
                  const isUnreviewed = applicant.status === 'For Review';
                  const isDragging = draggedApplicant?.id === applicant.id;
                  return (
                  <Card 
                    key={applicant.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedApplicant(applicant);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', applicant.id);
                    }}
                    onDragEnd={() => {
                      setDraggedApplicant(null);
                      setDragOverFolder(null);
                    }}
                    className={`cursor-grab active:cursor-grabbing transition-all ${
                      isUnreviewed ? 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : ''
                    } ${isDragging ? 'opacity-50 scale-95 ring-2 ring-primary' : 'hover:shadow-md'}`}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold">{applicant.full_name}</h3>
                            {isUnreviewed && (
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
                            {applicant.total_score !== null && (
                              <Badge variant="outline" className="font-mono">
                                Score: {applicant.total_score}/100
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{applicant.email}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            {applicant.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {applicant.phone}
                              </span>
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedApplicant(applicant.id);
                                }}
                                className="flex items-center gap-1 text-green-600 hover:underline cursor-pointer"
                              >
                                <Star className="w-3.5 h-3.5" />
                                CV Assessment
                              </button>
                            )}

                            {/* Interview Results quick link */}
                            {applicant.interview_session?.status === 'completed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedApplicant(applicant.id);
                                }}
                                className="flex items-center gap-1 text-purple-600 hover:underline cursor-pointer"
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Interview Results
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
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedApplicant(expandedApplicant === applicant.id ? null : applicant.id)}
                          >
                            {expandedApplicant === applicant.id ? 'Hide Details' : 'View Details'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInterviewInviteApplicant({
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

                      {expandedApplicant === applicant.id && (
                        <div className="mt-4 pt-4 border-t border-border">
                          {/* Assessment Tabs - CV vs Interview */}
                          <Tabs defaultValue="cv" className="mb-6">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="cv" className="flex items-center gap-2">
                                <Star className="w-4 h-4" />
                                CV Assessment
                                {applicant.total_score !== null && (
                                  <Badge variant="secondary" className="ml-1">{applicant.total_score}/100</Badge>
                                )}
                              </TabsTrigger>
                              <TabsTrigger value="interview" className="flex items-center gap-2">
                                <ClipboardList className="w-4 h-4" />
                                Interview Results
                                {applicant.interview_session?.status === 'completed' && applicant.interview_session.overall_score !== null && (
                                  <Badge variant="secondary" className="ml-1 bg-purple-100 text-purple-700">{applicant.interview_session.overall_score}/100</Badge>
                                )}
                              </TabsTrigger>
                            </TabsList>

                            {/* CV Assessment Tab */}
                            <TabsContent value="cv" className="mt-4">
                              {applicant.total_score !== null ? (
                                <div className="p-4 bg-muted/50 rounded-lg">
                                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                                    <Star className="w-4 h-4" />
                                    AI CV Assessment
                                  </h4>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Role Experience</p>
                                      <p className="text-lg font-bold">{applicant.role_experience_score ?? '-'}/40</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Skills & Tools</p>
                                      <p className="text-lg font-bold">{applicant.skills_tools_score ?? '-'}/40</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Availability</p>
                                      <p className="text-lg font-bold">{applicant.availability_setup_score ?? '-'}/10</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Bonus/Red Flags</p>
                                      <p className="text-lg font-bold">{applicant.bonus_red_flag_score ?? '-'}/10</p>
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
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-6 bg-muted/30 rounded-lg text-center">
                                  <Star className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                  <p className="text-muted-foreground">No CV assessment available yet</p>
                                </div>
                              )}
                            </TabsContent>

                            {/* Interview Results Tab */}
                            <TabsContent value="interview" className="mt-4">
                              {applicant.interview_session ? (
                                <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-200/50 dark:border-purple-800/30">
                                  <InterviewResultsView 
                                    sessionId={applicant.interview_session.id}
                                    session={applicant.interview_session}
                                  />
                                </div>
                              ) : (
                                <div className="p-6 bg-muted/30 rounded-lg text-center">
                                  <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                  <p className="text-muted-foreground">No interview completed yet</p>
                                </div>
                              )}
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
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                              <Textarea
                                value={editForm.notes}
                                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder="Add notes about this applicant..."
                                className="min-h-[100px] bg-background"
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {applicant.notes || 'No notes yet. Click "Add Note" to add observations about this applicant.'}
                              </p>
                            )}
                          </div>

                          {/* Candidate Profile Section */}
                          <CandidateProfileSection
                            applicantId={applicant.id}
                            candidateProfile={applicant.candidate_profile}
                            onUpdate={(newProfile) => {
                              setApplicants(prev => prev.map(a => 
                                a.id === applicant.id ? { ...a, candidate_profile: newProfile } : a
                              ));
                            }}
                          />

                          {/* Role History Section */}
                          <div className="my-4">
                            <RoleHistorySection
                              currentJobTitle={applicant.job_title}
                              originalJobTitle={applicant.original_job_title}
                              reprofiledAt={applicant.reprofiled_at}
                            />
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
                                onClick={() => handleDownloadCv(applicant.id, applicant.cv_file_url!)}
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
                            <BooleanBadge value={applicant.currently_working} label="Currently Working" />
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
                ))}
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
        </Tabs>
      </main>

      {/* CV Preview Modal */}
      <Dialog open={!!previewCv} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span>CV Preview - {previewCv?.name}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadFromPreview}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden rounded-lg border bg-background">
            {(() => {
              // Check if cv_text is valid extracted text (not raw PDF/binary content)
              const isValidText = previewCv?.cvText && 
                !previewCv.cvText.startsWith('%PDF') && 
                !previewCv.cvText.includes('endobj') &&
                !previewCv.cvText.includes('/Type /') &&
                previewCv.cvText.length > 50;

              if (isValidText) {
                return (
                  <div className="h-full overflow-auto p-6">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b">
                      <h3 className="font-semibold text-lg">Extracted CV Content</h3>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            window.open(previewCv.url, '_blank');
                          }}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Open Original
                        </Button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
                      {previewCv.cvText}
                    </pre>
                  </div>
                );
              }

              return (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                  <FileText className="w-16 h-16 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Preview Not Available</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This document cannot be previewed here. Use the buttons below to view.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.open(previewCv?.url, '_blank');
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Open in New Tab
                    </Button>
                    <Button onClick={handleDownloadFromPreview}>
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              );
            })()}
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
          <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30 min-h-[100px]">
            {notesPopup?.notes ? (
              <p className="text-sm whitespace-pre-wrap">{notesPopup.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes have been added for this applicant yet.</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setNotesPopup(null)}>
              Close
            </Button>
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
        onOpenChange={(open) => !open && setCommunicationHistoryApplicant(null)}
        applicantId={communicationHistoryApplicant?.id || ''}
        applicantName={communicationHistoryApplicant?.name || ''}
        applicantEmail={communicationHistoryApplicant?.email || ''}
      />

      {/* Send Email Dialog */}
      <SendEmailDialog
        open={!!sendEmailApplicant}
        onOpenChange={(open) => !open && setSendEmailApplicant(null)}
        applicant={sendEmailApplicant}
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
    </div>
  );
};

export default Admin;
