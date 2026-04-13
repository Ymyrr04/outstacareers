
-- Drop the overly permissive insert policy
DROP POLICY "System and admins can insert status history" ON public.applicant_status_history;

-- The trigger function uses SECURITY DEFINER so it bypasses RLS.
-- For any direct inserts, require admin role.
CREATE POLICY "Admins can insert status history"
ON public.applicant_status_history
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));
