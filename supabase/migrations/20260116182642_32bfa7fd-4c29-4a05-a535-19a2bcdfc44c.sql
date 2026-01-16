-- Add new columns to clients table
ALTER TABLE public.clients 
ADD COLUMN leads_from text,
ADD COLUMN company_links text,
ADD COLUMN yearly_increase boolean DEFAULT false,
ADD COLUMN contractor_count integer DEFAULT 0;

-- Update client_contacts to have first_name and last_name instead of full_name
ALTER TABLE public.client_contacts 
ADD COLUMN first_name text,
ADD COLUMN last_name text;

-- Migrate existing full_name data to first_name (as a fallback)
UPDATE public.client_contacts 
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE 
      WHEN position(' ' in full_name) > 0 
      THEN substring(full_name from position(' ' in full_name) + 1)
      ELSE ''
    END
WHERE full_name IS NOT NULL;

-- Remove billing_status column since we're not using billing
ALTER TABLE public.clients DROP COLUMN IF EXISTS billing_status;