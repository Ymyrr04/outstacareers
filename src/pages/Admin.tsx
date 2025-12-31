import { useEffect, useState } from 'react';
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
import { LogOut, Trash2, Eye, EyeOff, ArrowLeft, Users, Briefcase, MapPin, Clock, CheckCircle, XCircle, FileText, Mic, Star, Check, X, Zap, AlertTriangle, Download, Loader2, FolderOpen, Upload } from 'lucide-react';
import BulkUploadDialog from '@/components/BulkUploadDialog';

// Status options for applicant tracking - "For Review" is the default for new applicants
const APPLICANT_STATUS_FOLDERS = [
  'For Review',
  'Reviewed',
  'Pass Screening',
  'Reject',
  '50/50',
  'For Interview',
  'Candidate Successful',
  'Bench'
] as const;

// Dropdown options include all statuses (For Review can be selected to move back)
const APPLICANT_STATUS_OPTIONS = [
  'For Review',
  'Reviewed',
  'Pass Screening',
  'Reject',
  '50/50',
  'For Interview',
  'Candidate Successful',
  'Bench'
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

interface Applicant {
  id: string;
  full_name: string;
  email: string;
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
  ai_assessment_details: AssessmentDetails | null;
}

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(true);
  const [expandedApplicant, setExpandedApplicant] = useState<string | null>(null);
  const [downloadingCv, setDownloadingCv] = useState<string | null>(null);
  const [activeStatusFolder, setActiveStatusFolder] = useState<ApplicantStatusFolder>('For Review');

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
    const { data, error } = await supabase
      .from('applicants_prescreen')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch applicants',
        variant: 'destructive',
      });
    } else {
      // Cast the data to handle JSON type for ai_assessment_details
      const applicantsData = (data || []).map(item => ({
        ...item,
        ai_assessment_details: item.ai_assessment_details as unknown as AssessmentDetails | null
      }));
      setApplicants(applicantsData);
    }
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
    }
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

            {applicantsLoading ? (
              <p className="text-center py-12">Loading applicants...</p>
            ) : applicants.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No applicants yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Tabs value={activeStatusFolder} onValueChange={(v) => setActiveStatusFolder(v as ApplicantStatusFolder)} className="space-y-4">
                <TabsList className="flex-wrap h-auto gap-1">
                  {APPLICANT_STATUS_FOLDERS.map((status) => {
                    const count = applicants.filter(a => a.status === status).length;
                    return (
                      <TabsTrigger key={status} value={status} className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
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
                  const statusApplicants = applicants.filter(a => a.status === status);
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
                  return (
                  <Card 
                    key={applicant.id}
                    className={isUnreviewed ? 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : ''}
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
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3.5 h-3.5" />
                              {applicant.job_title}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {applicant.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(applicant.submitted_at)}
                            </span>
                            {applicant.cv_file_url && (
                              <span className="flex items-center gap-1 text-primary">
                                <FileText className="w-3.5 h-3.5" />
                                CV
                              </span>
                            )}
                            {applicant.vocaroo_link && (
                              <span className="flex items-center gap-1 text-primary">
                                <Mic className="w-3.5 h-3.5" />
                                Voice
                              </span>
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
                          {/* CV Assessment Section */}
                          {applicant.total_score !== null && (
                            <div className="mb-6 p-4 bg-muted/50 rounded-lg">
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
                            {applicant.vocaroo_link && (
                              <a 
                                href={applicant.vocaroo_link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-600 rounded-md text-sm hover:bg-orange-500/20 transition-colors"
                              >
                                <Mic className="w-4 h-4" />
                                Listen to Voice Recording
                              </a>
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
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
