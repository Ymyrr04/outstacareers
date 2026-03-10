CREATE TABLE public.scheduled_contractor_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  body_html text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_contractor_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scheduled contractor emails" ON public.scheduled_contractor_emails FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert scheduled contractor emails" ON public.scheduled_contractor_emails FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update scheduled contractor emails" ON public.scheduled_contractor_emails FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete scheduled contractor emails" ON public.scheduled_contractor_emails FOR DELETE TO authenticated USING (is_admin(auth.uid()));