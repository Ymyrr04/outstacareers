CREATE TABLE public.job_post_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL UNIQUE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  symbol text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_post_countries TO authenticated;
GRANT ALL ON public.job_post_countries TO service_role;
ALTER TABLE public.job_post_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage job post countries" ON public.job_post_countries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.job_post_countries (country, currency, symbol) VALUES
  ('Philippines','PHP','₱'),('Colombia','COP',NULL),('Costa Rica','CRC',NULL),('Mexico','MXN',NULL);