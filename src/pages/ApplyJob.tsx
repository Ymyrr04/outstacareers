import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Navigation from "@/components/ui/navigation";
import PreScreeningForm from "@/components/PreScreeningForm";

interface Job {
  id: string;
  title: string;
  apply_url: string | null;
  description: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
}

const ApplyJob = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, apply_url, description, qualifications, responsibilities')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Error fetching job:', error);
        toast.error("Job not found");
        navigate('/');
        return;
      }

      setJob(data);
      setLoading(false);
    };

    fetchJob();
  }, [jobId, navigate]);

  const handleComplete = () => {
    // Navigate back to jobs after successful application
    navigate('/#positions');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading...</p>
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
          <Button onClick={() => navigate('/')}>Back to Jobs</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Apply - {job.title} | OutSta Careers</title>
        <meta name="description" content={`Apply for ${job.title} at OutSta`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Navigation />
        
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back button */}
          <Button
            variant="ghost"
            onClick={() => navigate(`/job/${jobId}`)}
            className="mb-6 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Job Details
          </Button>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <PreScreeningForm
                job={{
                  id: job.id,
                  title: job.title,
                  apply_url: job.apply_url || '',
                  description: job.description,
                  qualifications: job.qualifications,
                  responsibilities: job.responsibilities,
                }}
                onClose={handleComplete}
                mode="page"
              />
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default ApplyJob;
