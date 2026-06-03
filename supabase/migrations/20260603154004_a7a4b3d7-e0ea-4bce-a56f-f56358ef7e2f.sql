
ALTER TABLE public.contract_envelopes
  ADD COLUMN IF NOT EXISTS countersign_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS countersign_recipient_name text,
  ADD COLUMN IF NOT EXISTS countersign_recipient_email text,
  ADD COLUMN IF NOT EXISTS countersign_message text,
  ADD COLUMN IF NOT EXISTS countersign_placement jsonb,
  ADD COLUMN IF NOT EXISTS countersign_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS countersign_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS countersign_viewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.contract_countersign_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_countersign_message_templates TO authenticated;
GRANT ALL ON public.contract_countersign_message_templates TO service_role;

ALTER TABLE public.contract_countersign_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage countersign msg templates"
  ON public.contract_countersign_message_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_contract_countersign_msg_templates_updated_at
  BEFORE UPDATE ON public.contract_countersign_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
