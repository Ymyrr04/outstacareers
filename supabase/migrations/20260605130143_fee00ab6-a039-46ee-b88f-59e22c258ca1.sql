
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS contact_1_type text,
  ADD COLUMN IF NOT EXISTS contact_2_type text,
  ADD COLUMN IF NOT EXISTS contact_3_type text,
  ADD COLUMN IF NOT EXISTS contact_1_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_2_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_3_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_1_notes text,
  ADD COLUMN IF NOT EXISTS contact_2_notes text,
  ADD COLUMN IF NOT EXISTS contact_3_notes text;

UPDATE public.sales_leads SET stage = 'Contact 1' WHERE stage IN ('Email 1', 'Email 2', 'Email 3', 'Call');
UPDATE public.sales_leads SET stage = 'Lead' WHERE stage IN ('Nurture');
UPDATE public.sales_leads SET stage = 'Lead' WHERE stage NOT IN ('Lead', 'Contact 1', 'Contact 2', 'Contact 3', 'Converted', 'Follow Up');
