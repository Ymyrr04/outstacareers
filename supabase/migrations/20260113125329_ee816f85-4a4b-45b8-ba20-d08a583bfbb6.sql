-- Drop the ineffective policy
DROP POLICY IF EXISTS "Allow function access to user_roles" ON public.user_roles;

-- The real fix: ensure applicant_exists function bypasses RLS properly
-- Recreate it with explicit schema and make sure it's really using security definer
CREATE OR REPLACE FUNCTION public.applicant_exists(_applicant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  -- Directly check the table, bypassing RLS due to SECURITY DEFINER
  SELECT EXISTS (
    SELECT 1
    FROM public.applicants_prescreen
    WHERE id = _applicant_id
  ) INTO result;
  RETURN result;
END;
$$;

-- Grant execute permission to anon
GRANT EXECUTE ON FUNCTION public.applicant_exists(uuid) TO anon;