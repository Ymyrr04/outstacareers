CREATE TABLE public.contract_message_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  message text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_message_templates TO authenticated;
GRANT ALL ON public.contract_message_templates TO service_role;
ALTER TABLE public.contract_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contract msg templates"
  ON public.contract_message_templates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));