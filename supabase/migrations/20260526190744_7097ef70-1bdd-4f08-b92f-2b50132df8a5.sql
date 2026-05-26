
-- =========================================================
-- Contract signing system
-- =========================================================

-- Templates
CREATE TABLE public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  pdf_path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contract templates"
  ON public.contract_templates FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Template fields
CREATE TABLE public.contract_template_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.contract_templates(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL CHECK (field_type IN ('signature','initials','date','text','checkbox')),
  page INTEGER NOT NULL DEFAULT 1,
  x_pct NUMERIC NOT NULL,
  y_pct NUMERIC NOT NULL,
  width_pct NUMERIC NOT NULL,
  height_pct NUMERIC NOT NULL,
  label TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  assigned_to TEXT NOT NULL DEFAULT 'signer' CHECK (assigned_to IN ('signer','admin','system')),
  field_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ctf_template ON public.contract_template_fields(template_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_template_fields TO authenticated;
GRANT ALL ON public.contract_template_fields TO service_role;
ALTER TABLE public.contract_template_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contract template fields"
  ON public.contract_template_fields FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Envelopes
CREATE TABLE public.contract_envelopes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.contract_templates(id) ON DELETE RESTRICT,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  applicant_id UUID,
  contractor_assignment_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','signed','voided','expired')),
  signing_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  admin_prefill JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_pdf_path TEXT,
  audit_pdf_path TEXT,
  signed_pdf_sha256 TEXT,
  sender_user_id UUID,
  sender_email TEXT,
  message TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_envelopes_token ON public.contract_envelopes(signing_token);
CREATE INDEX idx_envelopes_applicant ON public.contract_envelopes(applicant_id);
CREATE INDEX idx_envelopes_contractor ON public.contract_envelopes(contractor_assignment_id);
CREATE INDEX idx_envelopes_status ON public.contract_envelopes(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_envelopes TO authenticated;
GRANT ALL ON public.contract_envelopes TO service_role;
ALTER TABLE public.contract_envelopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contract envelopes"
  ON public.contract_envelopes FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_contract_envelopes_updated_at
  BEFORE UPDATE ON public.contract_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Field values
CREATE TABLE public.contract_envelope_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  envelope_id UUID NOT NULL REFERENCES public.contract_envelopes(id) ON DELETE CASCADE,
  template_field_id UUID NOT NULL REFERENCES public.contract_template_fields(id) ON DELETE CASCADE,
  value TEXT,
  signature_data_url TEXT,
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (envelope_id, template_field_id)
);
CREATE INDEX idx_cefv_envelope ON public.contract_envelope_field_values(envelope_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_envelope_field_values TO authenticated;
GRANT ALL ON public.contract_envelope_field_values TO service_role;
ALTER TABLE public.contract_envelope_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage envelope field values"
  ON public.contract_envelope_field_values FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Audit events
CREATE TABLE public.contract_audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  envelope_id UUID NOT NULL REFERENCES public.contract_envelopes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cae_envelope ON public.contract_audit_events(envelope_id);
GRANT SELECT, INSERT ON public.contract_audit_events TO authenticated;
GRANT ALL ON public.contract_audit_events TO service_role;
ALTER TABLE public.contract_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit events"
  ON public.contract_audit_events FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));
CREATE POLICY "Admins insert audit events"
  ON public.contract_audit_events FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

-- =========================================================
-- Storage buckets (private)
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-templates', 'contract-templates', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-signed', 'contract-signed', false)
ON CONFLICT (id) DO NOTHING;

-- Admin-only direct access; edge functions use service role to read/write either bucket
CREATE POLICY "Admins read contract templates bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contract-templates' AND is_admin(auth.uid()));

CREATE POLICY "Admins write contract templates bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contract-templates' AND is_admin(auth.uid()));

CREATE POLICY "Admins update contract templates bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contract-templates' AND is_admin(auth.uid()));

CREATE POLICY "Admins delete contract templates bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contract-templates' AND is_admin(auth.uid()));

CREATE POLICY "Admins read contract signed bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contract-signed' AND is_admin(auth.uid()));
