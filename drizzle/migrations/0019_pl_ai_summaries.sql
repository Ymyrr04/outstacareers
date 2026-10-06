CREATE TABLE public.pl_ai_summaries (
  signature text PRIMARY KEY,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pl_ai_summaries TO authenticated;
GRANT ALL ON public.pl_ai_summaries TO service_role;
ALTER TABLE public.pl_ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read summaries" ON public.pl_ai_summaries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));