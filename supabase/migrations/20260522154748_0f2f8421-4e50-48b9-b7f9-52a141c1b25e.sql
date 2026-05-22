-- Trigger function: auto-insert into pipeline tracking when a contractor becomes active/scheduled
CREATE OR REPLACE FUNCTION public.auto_add_contractor_to_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  first_stage_id uuid;
BEGIN
  IF NEW.status NOT IN ('active', 'scheduled') THEN
    RETURN NEW;
  END IF;

  -- Only act if no tracking row exists yet
  IF EXISTS (
    SELECT 1 FROM public.contractor_pipeline_tracking
    WHERE contractor_assignment_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO first_stage_id
  FROM public.contractor_pipeline_stages
  ORDER BY stage_order ASC
  LIMIT 1;

  IF first_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.contractor_pipeline_tracking
    (contractor_assignment_id, current_stage_id, auto_moved)
  VALUES (NEW.id, first_stage_id, true);

  RETURN NEW;
END;
$$;

-- Trigger on INSERT
DROP TRIGGER IF EXISTS trg_auto_add_contractor_to_pipeline_insert ON public.contractor_assignments;
CREATE TRIGGER trg_auto_add_contractor_to_pipeline_insert
AFTER INSERT ON public.contractor_assignments
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_contractor_to_pipeline();

-- Trigger on UPDATE (when status changes to active/scheduled)
DROP TRIGGER IF EXISTS trg_auto_add_contractor_to_pipeline_update ON public.contractor_assignments;
CREATE TRIGGER trg_auto_add_contractor_to_pipeline_update
AFTER UPDATE OF status ON public.contractor_assignments
FOR EACH ROW
WHEN (NEW.status IN ('active', 'scheduled') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.auto_add_contractor_to_pipeline();

-- Backfill: add any currently active/scheduled contractors missing from tracking
INSERT INTO public.contractor_pipeline_tracking (contractor_assignment_id, current_stage_id, auto_moved)
SELECT
  ca.id,
  (SELECT id FROM public.contractor_pipeline_stages ORDER BY stage_order ASC LIMIT 1),
  true
FROM public.contractor_assignments ca
WHERE ca.status IN ('active', 'scheduled')
  AND NOT EXISTS (
    SELECT 1 FROM public.contractor_pipeline_tracking cpt
    WHERE cpt.contractor_assignment_id = ca.id
  )
  AND EXISTS (SELECT 1 FROM public.contractor_pipeline_stages);