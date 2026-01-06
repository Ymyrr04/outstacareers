-- Drop the existing policy that uses 'public' role (which doesn't work for anon users)
DROP POLICY IF EXISTS "Anyone can view active jobs" ON public.jobs;

-- Create new policy that explicitly allows anon role to view active jobs
CREATE POLICY "Anyone can view active jobs" 
ON public.jobs 
FOR SELECT 
TO anon
USING (is_active = true);