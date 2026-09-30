ALTER TABLE public.historical_pl_rows ADD COLUMN actual_hours numeric;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_pl_rows TO authenticated;
GRANT ALL ON public.historical_pl_rows TO service_role;