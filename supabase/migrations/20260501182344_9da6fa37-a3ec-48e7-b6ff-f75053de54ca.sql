-- Add regular work shift column to contractor_assignments
ALTER TABLE public.contractor_assignments
ADD COLUMN IF NOT EXISTS regular_work_shift text;

-- Allow contractor portal users to update their own assignment's editable fields
CREATE POLICY "Contractors can update own assignment profile"
ON public.contractor_assignments
FOR UPDATE
USING (id = public.get_my_contractor_assignment_id())
WITH CHECK (id = public.get_my_contractor_assignment_id());

-- Allow contractor portal users to view their own assignment
CREATE POLICY "Contractors can view own assignment"
ON public.contractor_assignments
FOR SELECT
USING (id = public.get_my_contractor_assignment_id());

-- Helper: get applicant_id linked to current contractor portal user
CREATE OR REPLACE FUNCTION public.get_my_applicant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.applicant_id
  FROM public.contractor_assignments ca
  JOIN public.contractor_portal_users cpu
    ON cpu.contractor_assignment_id = ca.id
  WHERE cpu.user_id = auth.uid()
  LIMIT 1
$$;

-- Allow contractor portal users to view + update their own applicant profile
CREATE POLICY "Contractors can view own applicant profile"
ON public.applicants_prescreen
FOR SELECT
USING (id = public.get_my_applicant_id());

CREATE POLICY "Contractors can update own applicant profile"
ON public.applicants_prescreen
FOR UPDATE
USING (id = public.get_my_applicant_id())
WITH CHECK (id = public.get_my_applicant_id());