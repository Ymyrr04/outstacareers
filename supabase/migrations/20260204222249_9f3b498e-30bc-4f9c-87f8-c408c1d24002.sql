
-- Update RLS policy to allow viewing sessions for 2 days instead of 3 hours
DROP POLICY IF EXISTS "Anyone can view own active sessions" ON public.interview_sessions;
CREATE POLICY "Anyone can view own active sessions" 
ON public.interview_sessions 
FOR SELECT 
USING (
  status = 'in_progress' 
  AND started_at > (now() - INTERVAL '2 days')
);

-- Also update the job_interview_questions policy to match the 2-day window
DROP POLICY IF EXISTS "Public can view questions only for active job sessions" ON public.job_interview_questions;
CREATE POLICY "Public can view questions only for active job sessions" 
ON public.job_interview_questions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM interview_sessions s
    WHERE s.job_id = job_interview_questions.job_id 
    AND s.status = 'in_progress'
    AND s.started_at > (now() - INTERVAL '2 days')
  )
);
