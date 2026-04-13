
-- Create status history table
CREATE TABLE public.applicant_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by applicant
CREATE INDEX idx_applicant_status_history_applicant_id ON public.applicant_status_history(applicant_id);
CREATE INDEX idx_applicant_status_history_created_at ON public.applicant_status_history(created_at);

-- Enable RLS
ALTER TABLE public.applicant_status_history ENABLE ROW LEVEL SECURITY;

-- Only admins can view
CREATE POLICY "Admins can view status history"
ON public.applicant_status_history
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Allow inserts from triggers (service role) and admins
CREATE POLICY "System and admins can insert status history"
ON public.applicant_status_history
FOR INSERT
WITH CHECK (true);

-- Create trigger function to log status changes
CREATE OR REPLACE FUNCTION public.log_applicant_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.applicant_status_history (applicant_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to applicants_prescreen
CREATE TRIGGER track_applicant_status_change
AFTER UPDATE OF status ON public.applicants_prescreen
FOR EACH ROW
EXECUTE FUNCTION public.log_applicant_status_change();
