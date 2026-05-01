-- Contractor portal user mapping (links auth.users to contractor_assignments)
CREATE TABLE public.contractor_portal_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  contractor_assignment_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_portal_users ENABLE ROW LEVEL SECURITY;

-- Security definer function to look up contractor_assignment_id for current auth user
CREATE OR REPLACE FUNCTION public.get_my_contractor_assignment_id()
RETURNS UUID
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT contractor_assignment_id
  FROM public.contractor_portal_users
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

CREATE POLICY "Contractors can view own portal mapping"
ON public.contractor_portal_users FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Contractors can update own must_change_password"
ON public.contractor_portal_users FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all portal users"
ON public.contractor_portal_users FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert portal users"
ON public.contractor_portal_users FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update portal users"
ON public.contractor_portal_users FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete portal users"
ON public.contractor_portal_users FOR DELETE
USING (is_admin(auth.uid()));

CREATE TRIGGER update_contractor_portal_users_updated_at
BEFORE UPDATE ON public.contractor_portal_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Weekly timesheets (PL submissions)
CREATE TABLE public.contractor_timesheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_assignment_id UUID NOT NULL,
  week_ending_date DATE NOT NULL,
  total_hours NUMERIC(6,2) NOT NULL,
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (contractor_assignment_id, week_ending_date)
);

ALTER TABLE public.contractor_timesheets ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_contractor_timesheets_assignment ON public.contractor_timesheets (contractor_assignment_id);
CREATE INDEX idx_contractor_timesheets_week ON public.contractor_timesheets (week_ending_date DESC);

-- Contractors can manage only their own timesheets
CREATE POLICY "Contractors can view own timesheets"
ON public.contractor_timesheets FOR SELECT
USING (contractor_assignment_id = public.get_my_contractor_assignment_id());

CREATE POLICY "Contractors can insert own timesheets"
ON public.contractor_timesheets FOR INSERT
WITH CHECK (contractor_assignment_id = public.get_my_contractor_assignment_id());

CREATE POLICY "Contractors can update own timesheets"
ON public.contractor_timesheets FOR UPDATE
USING (contractor_assignment_id = public.get_my_contractor_assignment_id());

-- Admins full access
CREATE POLICY "Admins can view all timesheets"
ON public.contractor_timesheets FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert timesheets"
ON public.contractor_timesheets FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update timesheets"
ON public.contractor_timesheets FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete timesheets"
ON public.contractor_timesheets FOR DELETE
USING (is_admin(auth.uid()));

CREATE TRIGGER update_contractor_timesheets_updated_at
BEFORE UPDATE ON public.contractor_timesheets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();