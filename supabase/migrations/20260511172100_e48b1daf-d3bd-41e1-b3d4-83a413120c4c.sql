
CREATE TABLE public.contractor_leave_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_assignment_id UUID NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  time_period TEXT NOT NULL CHECK (time_period IN ('AM','PM','All day')),
  leave_type TEXT NOT NULL,
  leave_type_other TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_apps_assignment ON public.contractor_leave_applications(contractor_assignment_id);
CREATE INDEX idx_leave_apps_date ON public.contractor_leave_applications(leave_date);

ALTER TABLE public.contractor_leave_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors view own leave"
ON public.contractor_leave_applications FOR SELECT
USING (contractor_assignment_id = public.get_my_contractor_assignment_id());

CREATE POLICY "Contractors create own leave"
ON public.contractor_leave_applications FOR INSERT
WITH CHECK (contractor_assignment_id = public.get_my_contractor_assignment_id());

CREATE POLICY "Contractors update own pending leave"
ON public.contractor_leave_applications FOR UPDATE
USING (contractor_assignment_id = public.get_my_contractor_assignment_id() AND status = 'pending');

CREATE POLICY "Admins view all leave"
ON public.contractor_leave_applications FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins update all leave"
ON public.contractor_leave_applications FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete leave"
ON public.contractor_leave_applications FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_leave_apps_updated_at
BEFORE UPDATE ON public.contractor_leave_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
