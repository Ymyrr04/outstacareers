CREATE OR REPLACE FUNCTION public.sync_applicant_job_title_on_job_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE public.applicants_prescreen
    SET job_title = NEW.title
    WHERE job_id = NEW.id
      AND job_title IS DISTINCT FROM NEW.title;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_applicant_job_title ON public.jobs;

CREATE TRIGGER trg_sync_applicant_job_title
AFTER UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.sync_applicant_job_title_on_job_rename();