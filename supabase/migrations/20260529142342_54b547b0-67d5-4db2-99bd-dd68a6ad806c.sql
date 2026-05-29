
-- 1. Allow one contractor (auth user) to be linked to multiple assignments
ALTER TABLE public.contractor_portal_users
  DROP CONSTRAINT IF EXISTS contractor_portal_users_user_id_key;

CREATE INDEX IF NOT EXISTS idx_contractor_portal_users_user_id
  ON public.contractor_portal_users(user_id);

-- 2. Prefer the ACTIVE/RENDERING assignment when resolving "the contractor's current assignment"
CREATE OR REPLACE FUNCTION public.get_my_contractor_assignment_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cpu.contractor_assignment_id
  FROM public.contractor_portal_users cpu
  JOIN public.contractor_assignments ca
    ON ca.id = cpu.contractor_assignment_id
  WHERE cpu.user_id = auth.uid()
  ORDER BY
    CASE WHEN ca.status IN ('active', 'rendering') THEN 0 ELSE 1 END,
    ca.start_date DESC NULLS LAST,
    cpu.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_applicant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ca.applicant_id
  FROM public.contractor_assignments ca
  JOIN public.contractor_portal_users cpu
    ON cpu.contractor_assignment_id = ca.id
  WHERE cpu.user_id = auth.uid()
  ORDER BY
    CASE WHEN ca.status IN ('active', 'rendering') THEN 0 ELSE 1 END,
    ca.start_date DESC NULLS LAST,
    cpu.created_at DESC
  LIMIT 1
$$;

-- 3. Helper: is this assignment one of mine? (used so contractor can still see PAST timesheets)
CREATE OR REPLACE FUNCTION public.is_my_contractor_assignment(_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_portal_users
    WHERE user_id = auth.uid()
      AND contractor_assignment_id = _assignment_id
  )
$$;

-- 4. Let contractors VIEW timesheets from ALL their assignments (current + previous).
--    Editing remains restricted to the ACTIVE assignment (unchanged policy).
DROP POLICY IF EXISTS "Contractors can view own timesheets" ON public.contractor_timesheets;
CREATE POLICY "Contractors can view own timesheets"
  ON public.contractor_timesheets
  FOR SELECT
  USING (public.is_my_contractor_assignment(contractor_assignment_id));

-- 5. Let contractors VIEW (read-only) all of their assignments so historical timesheets
--    can be joined to their old client name in the UI.
DROP POLICY IF EXISTS "Contractors can view own assignment" ON public.contractor_assignments;
CREATE POLICY "Contractors can view own assignment"
  ON public.contractor_assignments
  FOR SELECT
  USING (public.is_my_contractor_assignment(id));
