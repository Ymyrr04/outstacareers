-- Allow admins to view ALL jobs (including inactive)
CREATE POLICY "Admins can view all jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));