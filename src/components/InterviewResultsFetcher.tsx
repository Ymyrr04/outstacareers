import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InterviewResultsView } from './InterviewResultsView';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

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

interface InterviewResultsFetcherProps {
  applicantId: string;
  cachedSession: InterviewSession | null;
  onSessionFound?: (session: InterviewSession) => void;
}

export function InterviewResultsFetcher({ 
  applicantId, 
  cachedSession,
  onSessionFound 
}: InterviewResultsFetcherProps) {
  const [session, setSession] = useState<InterviewSession | null>(cachedSession);
  const [loading, setLoading] = useState(!cachedSession);
  const [checked, setChecked] = useState(!!cachedSession);

  const fetchSession = async () => {
    setLoading(true);
    
    const { data } = await supabase
      .from('interview_sessions')
      .select('*')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const sessionData: InterviewSession = {
        id: data.id,
        status: data.status,
        experience_score: data.experience_score,
        technical_score: data.technical_score,
        communication_score: data.communication_score,
        situational_score: data.situational_score,
        personality_score: data.personality_score,
        overall_score: data.overall_score,
        ai_summary: data.ai_summary,
        ai_strengths: data.ai_strengths,
        ai_concerns: data.ai_concerns,
        completed_at: data.completed_at,
      };
      setSession(sessionData);
      onSessionFound?.(sessionData);
    }
    
    setLoading(false);
    setChecked(true);
  };

  useEffect(() => {
    // If we don't have a cached session, check the database
    if (!cachedSession) {
      fetchSession();
    }
  }, [applicantId, cachedSession]);

  if (loading) {
    return (
      <div className="p-6 bg-muted/30 rounded-lg text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground animate-spin" />
        <p className="text-muted-foreground">Loading interview data...</p>
      </div>
    );
  }

  if (session) {
    const isInProgress = session.status === 'in_progress';
    
    if (isInProgress) {
      // Interview link expires 2 days after session started
      const startedAt = session.completed_at ? new Date(session.completed_at) : null;
      // Use the session's created_at-like field - we need started_at which we don't have, 
      // so we'll fetch it or estimate. Since we know the link expires 2 days from start,
      // let's show a general message.
      return (
        <div className="p-6 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30 text-center">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">Interview Not Yet Completed</p>
          <p className="text-sm text-muted-foreground mb-2">
            The candidate has started but has not yet finished the interview assessment.
          </p>
          <p className="text-xs text-muted-foreground">
            The interview link expires 48 hours after it was sent.
          </p>
        </div>
      );
    }
    
    return (
      <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-200/50 dark:border-purple-800/30">
        <InterviewResultsView 
          sessionId={session.id}
          session={session}
        />
      </div>
    );
  }

  return (
    <div className="p-6 bg-muted/30 rounded-lg text-center">
      <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-muted-foreground mb-3">No interview completed yet</p>
      {checked && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchSession}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Check Again
        </Button>
      )}
    </div>
  );
}
