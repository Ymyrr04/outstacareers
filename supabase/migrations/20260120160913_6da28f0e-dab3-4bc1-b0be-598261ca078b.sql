-- Drop the existing policy
DROP POLICY IF EXISTS "Anyone can view own active sessions" ON public.interview_sessions;

-- Create updated policy with 3-hour window
CREATE POLICY "Anyone can view own active sessions" 
ON public.interview_sessions 
FOR SELECT 
USING (
  status = 'in_progress' 
  AND started_at > (now() - INTERVAL '3 hours')
);