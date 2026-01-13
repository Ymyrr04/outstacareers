-- Update the INSERT policy to also work with public role (not just anon)
DROP POLICY IF EXISTS "Public can create session for valid applicant" ON public.interview_sessions;

CREATE POLICY "Public can create session for valid applicant"
  ON public.interview_sessions
  FOR INSERT
  TO anon, public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applicants_prescreen
      WHERE applicants_prescreen.id = interview_sessions.applicant_id
    )
  );

-- The SELECT policy for newly created sessions needs to be able to return the inserted row
-- Add a policy that allows selecting a session immediately after creation
DROP POLICY IF EXISTS "Public can view recent active sessions" ON public.interview_sessions;

CREATE POLICY "Public can view own active sessions"
  ON public.interview_sessions
  FOR SELECT
  TO anon, public
  USING (
    status = 'in_progress'
    AND started_at > (now() - interval '2 hours')
  );