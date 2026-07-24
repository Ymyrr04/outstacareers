CREATE TABLE public.payoneer_verifications (
  url TEXT PRIMARY KEY,
  amount NUMERIC,
  currency TEXT,
  error TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payoneer_verifications TO authenticated;
GRANT ALL ON public.payoneer_verifications TO service_role;
ALTER TABLE public.payoneer_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read payoneer verifications"
  ON public.payoneer_verifications FOR SELECT
  TO authenticated USING (true);