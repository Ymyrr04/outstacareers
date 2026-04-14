CREATE TABLE public.applicant_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.applicant_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view applicant notes"
  ON public.applicant_notes FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert applicant notes"
  ON public.applicant_notes FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update applicant notes"
  ON public.applicant_notes FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete applicant notes"
  ON public.applicant_notes FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));