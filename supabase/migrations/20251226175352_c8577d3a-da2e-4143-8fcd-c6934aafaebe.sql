-- SECURITY: applicants_prescreen contains sensitive PII
-- Revoke SELECT from anon and authenticated roles to prevent public access
REVOKE SELECT ON public.applicants_prescreen FROM anon;
REVOKE SELECT ON public.applicants_prescreen FROM authenticated;

-- Drop the existing restrictive SELECT policy and recreate as permissive admin-only
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.applicants_prescreen;

-- Create a permissive SELECT policy that only allows admins
CREATE POLICY "Only admins can view submissions"
ON public.applicants_prescreen
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add comment warning about sensitive data
COMMENT ON TABLE public.applicants_prescreen IS 'SENSITIVE PII: Contains applicant personal data including names, emails, locations. SELECT access is restricted to admin role only via RLS and role grants. Never add public SELECT policies to this table.';