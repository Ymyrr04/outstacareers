-- Allow anon users to see only the existence of their own applicant record
-- This is needed for the interview_sessions INSERT policy check
-- We only allow checking if the ID exists, not reading sensitive data
CREATE POLICY "Anon can check applicant exists for interview"
  ON public.applicants_prescreen
  FOR SELECT
  TO anon
  USING (true);

-- Note: This allows anon to read applicant data, but since the form already 
-- has all the applicant's own data, we need to tighten this.
-- Better approach: use a security definer function instead

-- Actually, let's drop that and use a more secure approach
DROP POLICY IF EXISTS "Anon can check applicant exists for interview" ON public.applicants_prescreen;

-- Create a security definer function to check if applicant exists
CREATE OR REPLACE FUNCTION public.applicant_exists(_applicant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applicants_prescreen
    WHERE id = _applicant_id
  )
$$;

-- Update the interview_sessions INSERT policy to use the function
DROP POLICY IF EXISTS "Anon can create session for valid applicant" ON public.interview_sessions;

CREATE POLICY "Anon can create session for valid applicant"
  ON public.interview_sessions
  FOR INSERT
  TO anon
  WITH CHECK (public.applicant_exists(applicant_id));