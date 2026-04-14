
CREATE TABLE public.candidate_additional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.candidate_additional_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view additional profiles" ON public.candidate_additional_profiles FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert additional profiles" ON public.candidate_additional_profiles FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update additional profiles" ON public.candidate_additional_profiles FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete additional profiles" ON public.candidate_additional_profiles FOR DELETE TO authenticated USING (is_admin(auth.uid()));
