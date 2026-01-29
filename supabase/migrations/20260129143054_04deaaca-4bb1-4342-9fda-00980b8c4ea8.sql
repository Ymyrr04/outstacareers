-- Create function to archive applicants when job is hidden
CREATE OR REPLACE FUNCTION public.archive_applicants_on_job_hide()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only run when is_active changes from true to false
  IF OLD.is_active = true AND NEW.is_active = false THEN
    -- Update all applicants for this job to 'Archived' status
    UPDATE public.applicants_prescreen
    SET status = 'Archived'
    WHERE job_id = NEW.id
      AND status NOT IN ('Archived', 'Hired', 'Rejected');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on jobs table
CREATE TRIGGER trigger_archive_applicants_on_job_hide
  AFTER UPDATE OF is_active ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_applicants_on_job_hide();