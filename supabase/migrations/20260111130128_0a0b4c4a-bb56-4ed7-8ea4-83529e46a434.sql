
-- Drop the permissive SELECT policy
DROP POLICY IF EXISTS "Public can view own session by id" ON public.interview_sessions;

-- Drop the restrictive UPDATE policy that won't work well
DROP POLICY IF EXISTS "Public can complete own session" ON public.interview_sessions;

-- Create a more restrictive SELECT policy - only for sessions created in the last 2 hours (interview window)
-- This limits exposure while allowing the interview flow to work
CREATE POLICY "Public can view recent active sessions"
ON public.interview_sessions
FOR SELECT
TO anon
USING (
  status = 'in_progress' AND 
  started_at > (now() - interval '2 hours')
);

-- For updates, we'll remove public access entirely
-- The assess-interview edge function uses service role key to update scores
-- This is the secure way to handle score updates
