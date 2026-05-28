CREATE TABLE public.stage_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key text NOT NULL UNIQUE,
  display_name text,
  color text,
  sort_order integer,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stage_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_settings TO authenticated;
GRANT ALL ON public.stage_settings TO service_role;

ALTER TABLE public.stage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view stage settings"
ON public.stage_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super admins can insert stage settings"
ON public.stage_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update stage settings"
ON public.stage_settings FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete stage settings"
ON public.stage_settings FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_stage_settings_updated_at
BEFORE UPDATE ON public.stage_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();