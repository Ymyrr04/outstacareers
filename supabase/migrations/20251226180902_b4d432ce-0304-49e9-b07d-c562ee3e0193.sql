-- Re-grant SELECT to authenticated so RLS can control access
-- The RLS policy "Only admins can view submissions" will restrict access to admins only
GRANT SELECT ON public.applicants_prescreen TO authenticated;

-- Verify anon still has no SELECT access
REVOKE SELECT ON public.applicants_prescreen FROM anon;