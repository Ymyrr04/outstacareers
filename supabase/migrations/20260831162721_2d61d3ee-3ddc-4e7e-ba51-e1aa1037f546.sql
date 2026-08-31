CREATE TABLE public.outreach_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.outreach_settings TO authenticated;
GRANT ALL ON public.outreach_settings TO service_role;
ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view outreach settings" ON public.outreach_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update outreach settings" ON public.outreach_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.outreach_settings (key, value) VALUES ('import_key', encode(gen_random_bytes(24), 'hex')) ON CONFLICT (key) DO NOTHING;