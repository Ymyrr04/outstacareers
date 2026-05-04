
CREATE TABLE public.contractor_checkin_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_assignment_id uuid NOT NULL UNIQUE,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_checkin_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all templates" ON public.contractor_checkin_templates
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Contractors view own template" ON public.contractor_checkin_templates
  FOR SELECT USING (contractor_assignment_id = get_my_contractor_assignment_id());

CREATE POLICY "Contractors insert own template" ON public.contractor_checkin_templates
  FOR INSERT WITH CHECK (contractor_assignment_id = get_my_contractor_assignment_id());

CREATE POLICY "Contractors update own template" ON public.contractor_checkin_templates
  FOR UPDATE USING (contractor_assignment_id = get_my_contractor_assignment_id())
  WITH CHECK (contractor_assignment_id = get_my_contractor_assignment_id());

CREATE TRIGGER update_checkin_templates_updated_at
  BEFORE UPDATE ON public.contractor_checkin_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contractor_daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_assignment_id uuid NOT NULL,
  checkin_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  additional_notes text,
  email_status text DEFAULT 'pending',
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_checkins_assignment ON public.contractor_daily_checkins(contractor_assignment_id, checkin_date DESC);

ALTER TABLE public.contractor_daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all checkins" ON public.contractor_daily_checkins
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Contractors view own checkins" ON public.contractor_daily_checkins
  FOR SELECT USING (contractor_assignment_id = get_my_contractor_assignment_id());

CREATE POLICY "Contractors insert own checkins" ON public.contractor_daily_checkins
  FOR INSERT WITH CHECK (contractor_assignment_id = get_my_contractor_assignment_id());
