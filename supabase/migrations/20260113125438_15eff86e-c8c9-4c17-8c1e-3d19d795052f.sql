-- The issue is that anon role needs to be able to SELECT the row it just inserted
-- But the current SELECT policies require user_roles access which anon doesn't have

-- First, grant SELECT on user_roles to anon (RLS will still protect the data)
-- This is safe because the RLS policy returns no rows for anon anyway
GRANT SELECT ON public.user_roles TO anon;

-- Add a policy for anon to read user_roles (returning no rows, just to avoid permission denied)
CREATE POLICY "Anon gets no rows from user_roles"
  ON public.user_roles
  FOR SELECT
  TO anon
  USING (false);

-- Also need to do the same for applicants_prescreen since the security definer function
-- still triggers the RLS evaluation when checking applicant_exists
GRANT SELECT ON public.applicants_prescreen TO anon;

-- Add a minimal anon SELECT policy for applicants_prescreen (returns no rows directly)
CREATE POLICY "Anon gets no direct access to applicants"
  ON public.applicants_prescreen
  FOR SELECT
  TO anon
  USING (false);