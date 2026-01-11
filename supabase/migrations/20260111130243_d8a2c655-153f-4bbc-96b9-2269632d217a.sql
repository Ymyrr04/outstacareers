
-- Restrict job_interview_questions to only be viewable when there's an active interview session for that job
DROP POLICY IF EXISTS "Anyone can view job questions for interviews" ON public.job_interview_questions;

CREATE POLICY "Public can view questions only for active job sessions"
ON public.job_interview_questions
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.interview_sessions s
    WHERE s.job_id = job_interview_questions.job_id 
    AND s.status = 'in_progress'
    AND s.started_at > (now() - interval '2 hours')
  )
);
