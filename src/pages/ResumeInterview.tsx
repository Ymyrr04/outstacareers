import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InterviewSession } from "@/components/interview/InterviewSession";

interface SessionData {
  id: string;
  status: string;
  applicant_id: string;
  job_id: string | null;
  started_at: string;
  completed_at: string | null;
}

interface ApplicantData {
  id: string;
  full_name: string;
  email: string;
  job_title: string;
  cv_text: string | null;
}

interface JobData {
  id: string;
  title: string;
  description: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
}

export default function ResumeInterview() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [applicant, setApplicant] = useState<ApplicantData | null>(null);
  const [job, setJob] = useState<JobData | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    if (!sessionId) {
      setError("Invalid interview link");
      setLoading(false);
      return;
    }

    try {
      // Load interview session
      const { data: sessionData, error: sessionError } = await supabase
        .from("interview_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionError || !sessionData) {
        setError("Interview session not found. This link may have expired.");
        setLoading(false);
        return;
      }

      setSession(sessionData);

      // Check if already completed
      if (sessionData.status === "completed" || sessionData.status === "completed_manual_review") {
        setIsComplete(true);
        setLoading(false);
        return;
      }

      // Load applicant data
      const { data: applicantData, error: applicantError } = await supabase
        .from("applicants_prescreen")
        .select("id, full_name, email, job_title, cv_text")
        .eq("id", sessionData.applicant_id)
        .single();

      if (applicantError || !applicantData) {
        setError("Could not load applicant information.");
        setLoading(false);
        return;
      }

      setApplicant(applicantData);

      // Load job data if available
      if (sessionData.job_id) {
        const { data: jobData } = await supabase
          .from("jobs")
          .select("id, title, description, qualifications, responsibilities")
          .eq("id", sessionData.job_id)
          .single();

        if (jobData) {
          setJob(jobData);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error("Error loading session:", err);
      setError("An error occurred while loading your interview.");
      setLoading(false);
    }
  };

  const handleInterviewComplete = () => {
    setIsComplete(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Helmet>
          <title>Loading Interview... | Outsta Careers</title>
        </Helmet>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading your interview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Helmet>
          <title>Interview Error | Outsta Careers</title>
        </Helmet>
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="w-16 h-16 mx-auto text-amber-500 mb-4" />
            <CardTitle>Interview Unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact our recruitment team.
            </p>
            <Button asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Helmet>
          <title>Interview Complete | Outsta Careers</title>
        </Helmet>
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <CardTitle>Interview Complete!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Thank you for completing your interview. Our recruitment team will review your responses and get back to you soon.
            </p>
            <Button asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!applicant || !session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Resume Interview - {applicant.job_title} | Outsta Careers</title>
      </Helmet>
      
      <div className="max-w-3xl mx-auto p-4 py-8">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Resume Your Interview</p>
                <CardTitle>{applicant.job_title}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <InterviewSession
              sessionId={session.id}
              jobId={job?.id}
              jobTitle={job?.title || applicant.job_title}
              jobDescription={job?.description || null}
              qualifications={job?.qualifications || null}
              responsibilities={job?.responsibilities || null}
              cvText={applicant.cv_text || ""}
              applicantName={applicant.full_name}
              onComplete={handleInterviewComplete}
              onBack={() => {}} // No back option for resume
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
