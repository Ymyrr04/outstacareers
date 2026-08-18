ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON public.jobs(client_id);