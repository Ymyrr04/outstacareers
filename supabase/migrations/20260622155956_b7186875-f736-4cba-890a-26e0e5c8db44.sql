ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS estimated_hires integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likelihood_to_close integer NOT NULL DEFAULT 0;