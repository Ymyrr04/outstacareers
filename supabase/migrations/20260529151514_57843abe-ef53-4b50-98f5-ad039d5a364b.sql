-- Auto-delete contractor portal login when contractor assignment is deleted
CREATE OR REPLACE FUNCTION public.cleanup_contractor_portal_on_assignment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  -- For each user mapped to this assignment, remove the mapping
  FOR affected_user_id IN
    SELECT user_id FROM public.contractor_portal_users
    WHERE contractor_assignment_id = OLD.id
  LOOP
    DELETE FROM public.contractor_portal_users
    WHERE contractor_assignment_id = OLD.id AND user_id = affected_user_id;

    -- If the user has no remaining contractor assignments mapped, delete the auth user too
    IF NOT EXISTS (
      SELECT 1 FROM public.contractor_portal_users WHERE user_id = affected_user_id
    ) THEN
      DELETE FROM auth.users WHERE id = affected_user_id;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_contractor_portal_on_assignment_delete ON public.contractor_assignments;
CREATE TRIGGER trg_cleanup_contractor_portal_on_assignment_delete
BEFORE DELETE ON public.contractor_assignments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_contractor_portal_on_assignment_delete();