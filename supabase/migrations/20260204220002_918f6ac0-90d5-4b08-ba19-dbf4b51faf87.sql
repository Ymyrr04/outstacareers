
-- Add column to track status before archiving
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS pre_archive_status text;

-- Update the archive trigger to save previous status
CREATE OR REPLACE FUNCTION public.archive_applicants_on_job_hide()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only run when is_active changes from true to false
  IF OLD.is_active = true AND NEW.is_active = false THEN
    -- Save current status and update to 'Archived'
    UPDATE public.applicants_prescreen
    SET 
      pre_archive_status = status,
      status = 'Archived'
    WHERE job_id = NEW.id
      AND status NOT IN ('Archived', 'Hired', 'Rejected');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger to restore applicants when job is reactivated
CREATE OR REPLACE FUNCTION public.restore_applicants_on_job_reactivate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only run when is_active changes from false to true
  IF OLD.is_active = false AND NEW.is_active = true THEN
    -- Restore applicants to their previous status
    UPDATE public.applicants_prescreen
    SET 
      status = COALESCE(pre_archive_status, 'For Review'),
      pre_archive_status = NULL
    WHERE job_id = NEW.id
      AND status = 'Archived'
      AND pre_archive_status IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for job reactivation
DROP TRIGGER IF EXISTS restore_applicants_on_job_show ON public.jobs;
CREATE TRIGGER restore_applicants_on_job_show
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_applicants_on_job_reactivate();
