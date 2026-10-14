CREATE TABLE public.interview_rescore_staging (id serial PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL);
GRANT ALL ON public.interview_rescore_staging TO service_role;
ALTER TABLE public.interview_rescore_staging ENABLE ROW LEVEL SECURITY;