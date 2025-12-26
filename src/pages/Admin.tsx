import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import AddJobDialog from '@/components/AddJobDialog';
import EditJobDialog from '@/components/EditJobDialog';
import { LogOut, Trash2, Eye, EyeOff, ArrowLeft, Users, Briefcase, MapPin, Clock, CheckCircle, XCircle } from 'lucide-react';

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
      setApplicants(data || []);
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
            <div>
              <h2 className="text-2xl font-bold">Pre-Screening Submissions</h2>
              <p className="text-muted-foreground">View applicant pre-screening responses</p>
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
              <div className="grid gap-4">
                {applicants.map((applicant) => (
                  <Card key={applicant.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{applicant.full_name}</h3>
                            <Badge variant={applicant.status === 'new' ? 'default' : 'secondary'}>
                              {applicant.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{applicant.email}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
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
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                          <div className="mt-4">
                            <a 
                              href={applicant.apply_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              View Application Link →
                            </a>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
