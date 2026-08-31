ALTER TABLE public.outreach_prospects
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS converted_lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_status ON public.outreach_prospects(status);