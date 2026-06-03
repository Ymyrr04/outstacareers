ALTER TABLE public.contract_envelopes
ADD COLUMN IF NOT EXISTS countersigned_file_url text,
ADD COLUMN IF NOT EXISTS countersigned_at timestamptz;