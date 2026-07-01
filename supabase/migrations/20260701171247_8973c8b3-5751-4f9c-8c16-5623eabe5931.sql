
-- Stage-level default check-in sections
ALTER TABLE public.contractor_pipeline_stages
  ADD COLUMN IF NOT EXISTS checkin_sections jsonb;

-- Reusable check-in template library
CREATE TABLE IF NOT EXISTS public.checkin_templates_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkin_templates_library TO authenticated;
GRANT ALL ON public.checkin_templates_library TO service_role;

ALTER TABLE public.checkin_templates_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage checkin template library"
  ON public.checkin_templates_library
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_checkin_templates_library_updated
  BEFORE UPDATE ON public.checkin_templates_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
