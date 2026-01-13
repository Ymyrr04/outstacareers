-- Fix the INSERT policy to include anon role (for anonymous applicants)
DROP POLICY IF EXISTS "Public can create session for valid applicant" ON public.interview_sessions;

CREATE POLICY "Anon can create session for valid applicant"
  ON public.interview_sessions
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applicants_prescreen
      WHERE applicants_prescreen.id = interview_sessions.applicant_id
    )
  );

-- Fix the SELECT policy to also include anon role
DROP POLICY IF EXISTS "Public can view own active sessions" ON public.interview_sessions;

CREATE POLICY "Anon can view own active sessions"
  ON public.interview_sessions
  FOR SELECT
  TO anon
  USING (
    status = 'in_progress'
    AND started_at > (now() - interval '2 hours')
  );