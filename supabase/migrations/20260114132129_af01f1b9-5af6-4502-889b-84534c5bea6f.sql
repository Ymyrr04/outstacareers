-- Add RLS policy to allow reading applicant data via interview session
-- This is needed for the resume interview page

-- Create a security definer function to check if an applicant has an active interview session
CREATE OR REPLACE FUNCTION public.has_active_interview_session(_applicant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.interview_sessions
    WHERE applicant_id = _applicant_id
      AND status = 'in_progress'
      AND started_at > (now() - INTERVAL '24 hours')
  )
$$;

-- Allow anonymous users to view applicant data if they have an active interview session
-- This is limited to active sessions within 24 hours for security
CREATE POLICY "Anon can view applicant for active interview"
ON public.applicants_prescreen
FOR SELECT
TO anon
USING (public.has_active_interview_session(id));