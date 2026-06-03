CREATE TABLE public.saved_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL UNIQUE,
  signature_data_url text NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.saved_signatures TO service_role;

ALTER TABLE public.saved_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no client access" ON public.saved_signatures FOR SELECT USING (false);

CREATE INDEX idx_saved_signatures_email ON public.saved_signatures (lower(recipient_email));