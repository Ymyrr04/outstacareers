import { useState, useEffect } from "react";
import { getErrorMessageSync } from "@/lib/errors";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, MapPin, Clock, Briefcase, Check, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateJobUrl } from "@/lib/slugify";
import Navigation from "@/components/ui/navigation";
import { useAnalytics } from "@/hooks/useAnalytics";

// Fixed conversion values for Philippines
const USD_TO_PHP_RATE = 56;
const WEEKS_PER_MONTH = 4;
const MIN_HOURS_PER_WEEK = 40;
const MAX_HOURS_PER_WEEK = 50;

interface Job {
  id: string;
  title: string;
  department: string | null;
  rate: string | null;
  apply_url: string | null;
  description: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
  region: string | null;
  is_active: boolean | null;
  created_at: string;
}

// Helper function to parse USD hourly rate
const parseUsdHourlyRate = (rate: string): number | null => {
  if (rate.startsWith('₱')) return null;
  
  const match = rate.match(/\$?([\d,]+(?:\.\d{2})?)\s*\/?\s*(hour|hr)?/i);
  if (!match) return null;
  
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const period = match[2]?.toLowerCase() || '';
  
  if (period && period !== 'hour' && period !== 'hr') return null;
  
  return amount;
};

// Helper function to convert USD hourly rate to PHP monthly range
const convertToPhpMonthlyRange = (rate: string, region: string | null): string => {
  if (region !== 'philippines' && region !== 'all') return rate;
  
  const hourlyRate = parseUsdHourlyRate(rate);
  if (!hourlyRate) return rate;
  
  const minMonthly = Math.round(hourlyRate * USD_TO_PHP_RATE * MIN_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const maxMonthly = Math.round(hourlyRate * USD_TO_PHP_RATE * MAX_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  
  const formattedMin = minMonthly.toLocaleString('en-PH');
  const formattedMax = maxMonthly.toLocaleString('en-PH');
  
  return `₱${formattedMin} - ₱${formattedMax}/month`;
};

const JobDetails = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { trackJobView, trackApplyClick } = useAnalytics();

  useEffect(() => {
    const fetchJob = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Error fetching job:', error);
        toast.error("Job not found");
        navigate('/#positions');
        return;
      }

      setJob(data);
      trackJobView(jobId);
      setLoading(false);
    };

    fetchJob();
  }, [jobId, navigate, trackJobView]);

  const handleApplyClick = () => {
    if (job) {
      trackApplyClick(job.id);
      navigate(`/apply/${job.id}`);
    }
  };

  const handleCopyLink = async () => {
    if (!job) return;
    
    const productionOrigin = 'https://outstahub.com';
    const jobUrl = `${productionOrigin}/job/${job.id}`;
    
    try {
      await navigator.clipboard.writeText(jobUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(getErrorMessageSync(err, "Failed to copy link"));
    }
  };

  const getDisplayRate = (job: Job): string | null => {
    if (!job.rate) return null;
    return convertToPhpMonthlyRange(job.rate, job.region);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">Job not found</p>
          <Button onClick={() => navigate('/#positions')}>Back to Jobs</Button>
        </div>
      </div>
    );
  }

  const displayRate = getDisplayRate(job);

  return (
    <>
      <Helmet>
        <title>{job.title} | OutSta Careers</title>
        <meta name="description" content={job.description || `Apply for ${job.title} at OutSta`} />
      </Helmet>


      <div className="min-h-screen bg-background">
        <Navigation />
        
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Back button */}
          <Button
            variant="ghost"
            onClick={() => navigate('/#positions')}
            className="mb-8 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to All Jobs
          </Button>

          <Card className="overflow-hidden">
            <CardContent className="p-8 md:p-12">
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                  {job.title}
                </h1>
                
                {/* Meta info */}
                <div className="flex flex-wrap gap-4 text-base text-muted-foreground mb-6">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-5 h-5 text-primary" />
                    <span>Remote</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-5 h-5 text-primary" />
                    <span>Full time</span>
                  </div>
                  {job.department && (
                    <div className="flex items-center gap-1">
                      <Briefcase className="w-5 h-5 text-primary" />
                      <span>{job.department}</span>
                    </div>
                  )}
                </div>

                {/* Rate */}
                {displayRate && (
                  <p className="text-3xl font-bold text-primary">
                    {displayRate}
                  </p>
                )}
              </div>

              {/* Description */}
              {job.description && (
                <div className="mb-8">
                  <p className="text-lg text-foreground/80 leading-relaxed">
                    {job.description}
                  </p>
                </div>
              )}

              {/* Responsibilities */}
              {job.responsibilities && job.responsibilities.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-2xl font-semibold text-foreground mb-4">
                    Key Responsibilities
                  </h2>
                  <ul className="space-y-3">
                    {job.responsibilities.map((resp, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-lg text-foreground/80">
                        <span className="text-primary mt-1 flex-shrink-0">•</span>
                        <span>{resp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Qualifications */}
              {job.qualifications && job.qualifications.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-2xl font-semibold text-foreground mb-4">
                    Key Qualifications
                  </h2>
                  <ul className="space-y-3">
                    {job.qualifications.map((qual, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-lg text-foreground/80">
                        <span className="text-primary mt-1 flex-shrink-0">•</span>
                        <span>{qual}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-border">
                <Button 
                  onClick={handleApplyClick}
                  size="lg"
                  className="flex-1 text-lg py-6"
                >
                  Apply Now
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default JobDetails;
