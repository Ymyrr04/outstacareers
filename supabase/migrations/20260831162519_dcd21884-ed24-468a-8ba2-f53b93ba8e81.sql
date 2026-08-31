CREATE TABLE public.outreach_prospects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  headline text,
  current_title text,
  current_company text,
  location text,
  linkedin_url text UNIQUE,
  about text,
  experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_url text,
  status text NOT NULL DEFAULT 'New',
  notes text,
  source text NOT NULL DEFAULT 'linkedin-extension',
  imported_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_prospects TO authenticated;
GRANT ALL ON public.outreach_prospects TO service_role;
ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view outreach prospects" ON public.outreach_prospects FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert outreach prospects" ON public.outreach_prospects FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update outreach prospects" ON public.outreach_prospects FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete outreach prospects" ON public.outreach_prospects FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_outreach_prospects_updated_at BEFORE UPDATE ON public.outreach_prospects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();