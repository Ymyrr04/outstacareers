ALTER TABLE public.contractor_portal_users ADD COLUMN disabled_at timestamptz;

CREATE OR REPLACE FUNCTION public.cleanup_contractor_portal_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('resigned', 'terminated')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Disable instead of delete: keep the portal account and auth user,
    -- but block sign-in while the contractor is resigned/terminated.
    UPDATE public.contractor_portal_users
      SET disabled_at = now()
      WHERE contractor_assignment_id = NEW.id;
    UPDATE auth.users
      SET banned_until = '2099-01-01 00:00:00+00'::timestamptz
      WHERE id IN (
        SELECT user_id FROM public.contractor_portal_users
        WHERE contractor_assignment_id = NEW.id
      );
  ELSIF OLD.status IN ('resigned', 'terminated')
     AND NEW.status NOT IN ('resigned', 'terminated') THEN
    -- Status reversed (e.g. back to rendering/active): re-enable access.
    UPDATE public.contractor_portal_users
      SET disabled_at = NULL
      WHERE contractor_assignment_id = NEW.id;
    UPDATE auth.users
      SET banned_until = NULL
      WHERE id IN (
        SELECT user_id FROM public.contractor_portal_users
        WHERE contractor_assignment_id = NEW.id
      );
  END IF;

  RETURN NEW;
END;
$function$;