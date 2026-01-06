import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Job } from "@/hooks/useJobs";
import PreScreeningForm from "@/components/PreScreeningForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, ArrowLeft, Loader2, Building2 } from "lucide-react";

// Fixed conversion values for Philippines
const USD_TO_PHP_RATE = 56;
const WEEKS_PER_MONTH = 4;
const MIN_HOURS_PER_WEEK = 40;
const MAX_HOURS_PER_WEEK = 50;

const parseUsdHourlyRate = (rate: string): number | null => {
  if (rate.startsWith('₱')) return null;
  const match = rate.match(/\$?([\d,]+(?:\.\d{2})?)\s*\/?\s*(hour|hr)?/i);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const period = match[2]?.toLowerCase() || '';
  if (period && period !== 'hour' && period !== 'hr') return null;
  return amount;
};

const convertToPhpMonthlyRange = (rate: string): string => {
  const hourlyRate = parseUsdHourlyRate(rate);
  if (!hourlyRate) return rate;
  const minMonthly = Math.round(hourlyRate * USD_TO_PHP_RATE * MIN_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const maxMonthly = Math.round(hourlyRate * USD_TO_PHP_RATE * MAX_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const formattedMin = minMonthly.toLocaleString('en-PH');
  const formattedMax = maxMonthly.toLocaleString('en-PH');
  return `₱${formattedMin} - ₱${formattedMax}/month`;
};

const JobApplication = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      if (!jobId) {
        setError("Invalid job link");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('is_active', true)
        .single();

      if (fetchError || !data) {
        setError("This job posting is no longer available");
        setLoading(false);
        return;
      }

      setJob(data as Job);
      setLoading(false);
    };

    fetchJob();
  }, [jobId]);

  const getDisplayRate = (job: Job): string | null => {
    if (!job.rate) return null;
    // Default to PHP conversion for direct links
    if (job.region === 'philippines' || !job.region) {
      return convertToPhpMonthlyRange(job.rate);
    }
    return job.rate;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Helmet>
          <title>Job Not Found | Outsta</title>
        </Helmet>
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle className="text-destructive">Job Not Available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error || "This job posting could not be found."}</p>
            <Button onClick={() => navigate('/')} variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              View All Jobs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayRate = getDisplayRate(job);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{job.title} | Outsta Careers</title>
        <meta name="description" content={job.description || `Apply for ${job.title} at Outsta. Remote position, full-time opportunity.`} />
        <meta property="og:title" content={`${job.title} | Outsta Careers`} />
        <meta property="og:description" content={job.description || `Apply for ${job.title} at Outsta`} />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/outsta-logo.png" alt="Outsta" className="h-8 w-auto" />
          </a>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            All Jobs
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {showForm ? (
          <div className="max-w-4xl mx-auto">
            {/* Job Summary Card */}
            <Card className="mb-6 border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl md:text-2xl text-primary">{job.title}</CardTitle>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>{job.department || 'General'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>Remote</span>
                      </div>
                    </div>
                  </div>
                  {displayRate && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">{displayRate}</p>
                      <p className="text-xs text-muted-foreground">Full-time</p>
                    </div>
                  )}
                </div>
              </CardHeader>
              
              {(job.description || job.responsibilities?.length || job.qualifications?.length) && (
                <CardContent className="pt-0 border-t border-border mt-3">
                  <div className="grid md:grid-cols-2 gap-4 pt-4">
                    {job.description && (
                      <div className="md:col-span-2">
                        <p className="text-sm text-muted-foreground">{job.description}</p>
                      </div>
                    )}
                    {job.responsibilities && job.responsibilities.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Key Responsibilities:</h4>
                        <ul className="space-y-1">
                          {job.responsibilities.slice(0, 4).map((resp, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-primary">•</span>
                              <span>{resp}</span>
                            </li>
                          ))}
                          {job.responsibilities.length > 4 && (
                            <li className="text-sm text-muted-foreground italic">
                              +{job.responsibilities.length - 4} more...
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    {job.qualifications && job.qualifications.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Key Qualifications:</h4>
                        <ul className="space-y-1">
                          {job.qualifications.slice(0, 4).map((qual, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-primary">•</span>
                              <span>{qual}</span>
                            </li>
                          ))}
                          {job.qualifications.length > 4 && (
                            <li className="text-sm text-muted-foreground italic">
                              +{job.qualifications.length - 4} more...
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Application Form */}
            <PreScreeningForm job={job} onClose={() => setShowForm(false)} />
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center">
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-xl font-bold text-primary mb-2">Application Submitted!</h2>
                <p className="text-muted-foreground mb-4">Thank you for your interest. We'll be in touch soon.</p>
                <Button onClick={() => navigate('/')} className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  View Other Opportunities
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobApplication;
