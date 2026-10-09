-- lovable-cron-fallback-reviewed: queue drain armed on enqueue and unscheduled by the worker once the queue is empty
ALTER TABLE public.knowledge_job_state ADD COLUMN IF NOT EXISTS job_token text;

CREATE OR REPLACE FUNCTION public.arm_knowledge_job()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'embed-knowledge-drain') THEN RETURN; END IF;
  IF (SELECT job_token FROM public.knowledge_job_state WHERE id = true) IS NULL THEN RETURN; END IF;
  PERFORM cron.schedule('embed-knowledge-drain', '* * * * *', $job$
    select net.http_post(
      url := 'https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/embed-knowledge',
      headers := jsonb_build_object('Content-Type','application/json',
        'x-internal-secret', (select job_token from public.knowledge_job_state where id = true)),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $job$);
END $fn$;

CREATE OR REPLACE FUNCTION public.disarm_knowledge_job()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.knowledge_dirty_queue WHERE processed_at IS NULL AND error IS NULL) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'embed-knowledge-drain') THEN
    PERFORM cron.unschedule('embed-knowledge-drain');
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.arm_knowledge_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disarm_knowledge_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arm_knowledge_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.disarm_knowledge_job() TO service_role;

CREATE OR REPLACE FUNCTION public.arm_knowledge_job_on_enqueue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  BEGIN PERFORM public.arm_knowledge_job(); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END $fn$;

CREATE TRIGGER knowledge_queue_arm_job
AFTER INSERT ON public.knowledge_dirty_queue
FOR EACH STATEMENT EXECUTE FUNCTION public.arm_knowledge_job_on_enqueue();