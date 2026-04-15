import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InterviewResultsView } from './InterviewResultsView';
import { ClipboardList, Loader2, RefreshCw, CheckCircle2, Circle } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

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
  started_at?: string | null;
}

interface PartialProgress {
  totalQuestions: number;
  answeredQuestions: number;
  sectionProgress: { section: string; total: number; answered: number }[];
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
  const [startedAt, setStartedAt] = useState<string | null>(cachedSession?.started_at || null);
  const [partialProgress, setPartialProgress] = useState<PartialProgress | null>(null);

  const fetchPartialProgress = async (sessionId: string) => {
    const [questionsRes, answersRes] = await Promise.all([
      supabase.from('interview_questions').select('id, section').eq('session_id', sessionId),
      supabase.from('interview_answers').select('question_id').eq('session_id', sessionId),
    ]);

    const questions = questionsRes.data || [];
    const answeredIds = new Set((answersRes.data || []).map(a => a.question_id));

    const sectionMap: Record<string, { total: number; answered: number }> = {};
    for (const q of questions) {
      if (!sectionMap[q.section]) sectionMap[q.section] = { total: 0, answered: 0 };
      sectionMap[q.section].total++;
      if (answeredIds.has(q.id)) sectionMap[q.section].answered++;
    }

    setPartialProgress({
      totalQuestions: questions.length,
      answeredQuestions: answeredIds.size,
      sectionProgress: Object.entries(sectionMap).map(([section, data]) => ({ section, ...data })),
    });
  };

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
        started_at: data.started_at,
      };
      setStartedAt(data.started_at);
      setSession(sessionData);
      onSessionFound?.(sessionData);

      if (data.status === 'in_progress') {
        fetchPartialProgress(data.id);
      }
    }
    
    setLoading(false);
    setChecked(true);
  };

  useEffect(() => {
    if (!cachedSession) {
      fetchSession();
    } else if (cachedSession.status === 'in_progress') {
      if (!cachedSession.started_at) {
        supabase
          .from('interview_sessions')
          .select('started_at')
          .eq('applicant_id', applicantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.started_at) setStartedAt(data.started_at);
          });
      }
      fetchPartialProgress(cachedSession.id);
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
      const effectiveStartedAt = startedAt || session.started_at;
      const expiresAt = effectiveStartedAt
        ? new Date(new Date(effectiveStartedAt).getTime() + 48 * 60 * 60 * 1000) 
        : null;
      const now = new Date();
      const hoursLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))) : null;
      const isExpired = hoursLeft !== null && hoursLeft <= 0;
      const progressPct = partialProgress && partialProgress.totalQuestions > 0
        ? Math.round((partialProgress.answeredQuestions / partialProgress.totalQuestions) * 100)
        : 0;

      const sectionLabels: Record<string, string> = {
        experience: 'Experience',
        technical: 'Technical',
        communication: 'Communication',
        situational: 'Situational',
        personality: 'Personality',
      };

      return (
        <div className="p-6 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
          <div className="text-center mb-4">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 text-amber-500" />
            <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
              {isExpired ? 'Interview Link Expired' : 'Interview Not Yet Completed'}
            </p>
            {hoursLeft !== null ? (
              isExpired ? (
                <p className="text-xs text-red-500 font-medium">The interview link has expired.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Interview link expires in approximately <span className="font-medium text-amber-600 dark:text-amber-400">{hoursLeft} hour{hoursLeft !== 1 ? 's' : ''}</span>.
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">The interview link expires 48 hours after it was sent.</p>
            )}
          </div>

          {partialProgress && partialProgress.totalQuestions > 0 && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  Progress: {partialProgress.answeredQuestions}/{partialProgress.totalQuestions} questions answered
                </span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {partialProgress.sectionProgress.map(s => {
                  const done = s.answered === s.total;
                  const partial = s.answered > 0 && !done;
                  return (
                    <div key={s.section} className="flex items-center gap-1.5 text-xs p-1.5 rounded bg-background/50 border border-border/30">
                      {done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className={`w-3.5 h-3.5 shrink-0 ${partial ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                      )}
                      <span className={done ? 'text-emerald-700 dark:text-emerald-400 font-medium' : partial ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
                        {sectionLabels[s.section] || s.section} ({s.answered}/{s.total})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {partialProgress && partialProgress.totalQuestions === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              No questions generated yet — the candidate may not have started.
            </p>
          )}
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
