
CREATE TABLE public.sales_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  role_title TEXT,
  email TEXT,
  phone TEXT,
  industry TEXT,
  team_size TEXT,
  hiring_urgency TEXT,
  temperature TEXT NOT NULL DEFAULT 'warm',
  source TEXT NOT NULL DEFAULT 'manual',
  original_message TEXT,
  stage TEXT NOT NULL DEFAULT 'Lead',
  converted_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_leads TO authenticated;
GRANT ALL ON public.sales_leads TO service_role;

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sales leads" ON public.sales_leads
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_sales_leads_updated_at
  BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_lead_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_lead_notes TO authenticated;
GRANT ALL ON public.sales_lead_notes TO service_role;

ALTER TABLE public.sales_lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sales lead notes" ON public.sales_lead_notes
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_sales_leads_stage ON public.sales_leads(stage);
CREATE INDEX idx_sales_lead_notes_lead_id ON public.sales_lead_notes(lead_id);
