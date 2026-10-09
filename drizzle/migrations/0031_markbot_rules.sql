CREATE TABLE public.markbot_rules (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rules text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.markbot_rules TO authenticated;
GRANT ALL ON public.markbot_rules TO service_role;
ALTER TABLE public.markbot_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read markbot rules" ON public.markbot_rules FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins insert markbot rules" ON public.markbot_rules FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins update markbot rules" ON public.markbot_rules FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
INSERT INTO public.markbot_rules (id, rules) VALUES (1, '') ON CONFLICT DO NOTHING;