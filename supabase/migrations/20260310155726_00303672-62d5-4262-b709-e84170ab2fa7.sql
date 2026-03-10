
CREATE TABLE public.contractor_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  template_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view contractor email templates" ON public.contractor_email_templates
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert contractor email templates" ON public.contractor_email_templates
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update contractor email templates" ON public.contractor_email_templates
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete contractor email templates" ON public.contractor_email_templates
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));
