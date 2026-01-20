import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
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
} from 'lucide-react';
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
import { useUnreadMessageCounts } from '@/hooks/useEmailTemplates';

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
  location: string;
  job_title: string;
  job_id: string | null;
  status: string;
  submitted_at: string;
  total_score: number | null;
  cv_file_url: string | null;
  voice_recording_url: string | null;
  is_starred: boolean;
  job_source: string | null;
  is_available: boolean | null;
  availability_checked_at: string | null;
  details_viewed_at: string | null;
  interview_session: InterviewSession | null;
}

type SortOption = 'newest' | 'score-desc' | 'score-asc' | 'starred';

export const MyApplicantsDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [adminUsersMap, setAdminUsersMap] = useState<Record<string, string>>({});
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [activeStatusFolder, setActiveStatusFolder] = useState<ApplicantStatusFolder>('For Review');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>('all');
  const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  
  // Drag and drop state
  const [draggedApplicant, setDraggedApplicant] = useState<Applicant | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<ApplicantStatusFolder | null>(null);
  
  // Communication state
  const [communicationHistoryApplicant, setCommunicationHistoryApplicant] = useState<{ id: string; name: string; email: string } | null>(null);
  const [sendEmailApplicant, setSendEmailApplicant] = useState<{ id: string; full_name: string; email: string; job_title: string; status: string } | null>(null);
  const [interviewInviteApplicant, setInterviewInviteApplicant] = useState<{ full_name: string; email: string; job_title: string } | null>(null);
  
  const { unreadCounts, markAsRead: markMessagesAsRead } = useUnreadMessageCounts();

  // Fetch admin users
  const fetchAdminUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-admin-users');
      if (error) throw error;
      
      const map: Record<string, string> = {};
      (data?.admins || []).forEach((admin: { id: string; email: string }) => {
        map[admin.id] = admin.email;
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
          id, full_name, email, phone, location, job_title, job_id, status, 
          submitted_at, total_score, cv_file_url, voice_recording_url, 
          is_starred, job_source, is_available, availability_checked_at, details_viewed_at
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

  // Filter applicants based on admin and job selection
  const filteredApplicants = useMemo(() => {
    // First filter by admin (via jobs assigned to that admin)
    const jobIdsForAdmin = filteredJobs.map(j => j.id);
    let filtered = applicants.filter(a => a.job_id && jobIdsForAdmin.includes(a.job_id));
    
    // Then filter by status folder
    filtered = filtered.filter(a => a.status === activeStatusFolder);
    
    // Then filter by specific job if selected
    if (selectedJobFilter !== 'all') {
      filtered = filtered.filter(a => a.job_id === selectedJobFilter);
    }
    
    // Then filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.full_name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        a.job_title.toLowerCase().includes(term) ||
        a.location.toLowerCase().includes(term)
      );
    }
    
    return sortApplicants(filtered);
  }, [applicants, filteredJobs, activeStatusFolder, selectedJobFilter, searchTerm, sortOption]);

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

  // Handle status change
  const handleStatusChange = async (applicantId: string, newStatus: string) => {
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
      toast({ title: 'Status updated' });
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
              : `${filteredJobs.length} job${filteredJobs.length !== 1 ? 's' : ''} • ${adminUsersMap[selectedAdminFilter] || 'Unknown Admin'}`
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
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
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
              <SelectItem key={id} value={id}>{email}</SelectItem>
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
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Status Folder Tabs */}
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
            {folder}
            {folderCounts[folder] > 0 && (
              <Badge variant="secondary" className="ml-2">
                {folderCounts[folder]}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Applicants Table */}
      {filteredApplicants.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No applicants in "{activeStatusFolder}" folder
              {selectedJobFilter !== 'all' && ' for this job'}
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
                <TableHead>Location</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApplicants.map(applicant => {
                const scoreData = getOverallScore(applicant);
                const unreadCount = unreadCounts[applicant.id] || 0;
                
                return (
                  <TableRow
                    key={applicant.id}
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
                            <span title="Has CV">
                              <FileText className="w-3 h-3 text-blue-500" />
                            </span>
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
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {applicant.location}
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
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
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
                        <CheckAvailabilityButton
                          applicantId={applicant.id}
                          applicantName={applicant.full_name}
                          applicantEmail={applicant.email}
                          isAvailable={applicant.is_available ?? null}
                          availabilityCheckedAt={applicant.availability_checked_at ?? null}
                          onUpdate={() => fetchData()}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
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
        />
      )}

      {interviewInviteApplicant && (
        <InterviewInviteDialog
          open={!!interviewInviteApplicant}
          onOpenChange={(open) => {
            if (!open) setInterviewInviteApplicant(null);
          }}
          applicant={{
            full_name: interviewInviteApplicant.full_name,
            email: interviewInviteApplicant.email,
            job_title: interviewInviteApplicant.job_title,
          }}
        />
      )}
    </div>
  );
};

export default MyApplicantsDashboard;
