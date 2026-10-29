ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS rate_type text DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS rate_min numeric,
  ADD COLUMN IF NOT EXISTS rate_max numeric,
  ADD COLUMN IF NOT EXISTS hours_option text;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_rate_type_check CHECK (rate_type IS NULL OR rate_type IN ('fixed','range'));
ALTER TABLE public.jobs ADD CONSTRAINT jobs_hours_option_check CHECK (hours_option IS NULL OR hours_option IN ('40','50','40-50'));

CREATE TABLE public.exchange_rates (
  currency text PRIMARY KEY,
  rate_per_usd numeric NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exchange_rates TO anon, authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read exchange rates" ON public.exchange_rates FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.exchange_rates (currency, rate_per_usd, fetched_at) VALUES ('PHP', 56, '2000-01-01T00:00:00Z') ON CONFLICT DO NOTHING;