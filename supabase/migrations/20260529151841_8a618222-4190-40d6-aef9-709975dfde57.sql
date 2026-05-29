-- Disable contractor portal access when status becomes resigned or terminated
CREATE OR REPLACE FUNCTION public.cleanup_contractor_portal_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  IF NEW.status IN ('resigned', 'terminated')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    FOR affected_user_id IN
      SELECT user_id FROM public.contractor_portal_users
      WHERE contractor_assignment_id = NEW.id
    LOOP
      DELETE FROM public.contractor_portal_users
      WHERE contractor_assignment_id = NEW.id AND user_id = affected_user_id;

      -- Only delete auth user if they have no other portal mappings left
      IF NOT EXISTS (
        SELECT 1 FROM public.contractor_portal_users WHERE user_id = affected_user_id
      ) THEN
        DELETE FROM auth.users WHERE id = affected_user_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_contractor_portal_on_status_change ON public.contractor_assignments;
CREATE TRIGGER trg_cleanup_contractor_portal_on_status_change
AFTER UPDATE OF status ON public.contractor_assignments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_contractor_portal_on_status_change();