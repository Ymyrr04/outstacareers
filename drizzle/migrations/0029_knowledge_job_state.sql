CREATE TABLE public.knowledge_job_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  locked_until timestamptz,
  paused_reason text,
  paused_at timestamptz,
  last_run_at timestamptz
);
GRANT ALL ON public.knowledge_job_state TO service_role;
ALTER TABLE public.knowledge_job_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.knowledge_job_state (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_knowledge_job_lock(_seconds integer)
RETURNS TABLE(paused_reason text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.knowledge_job_state
     SET locked_until = now() + make_interval(secs => _seconds), last_run_at = now()
   WHERE id = true AND (locked_until IS NULL OR locked_until < now())
  RETURNING knowledge_job_state.paused_reason;
$$;
REVOKE ALL ON FUNCTION public.claim_knowledge_job_lock(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_knowledge_job_lock(integer) TO service_role;