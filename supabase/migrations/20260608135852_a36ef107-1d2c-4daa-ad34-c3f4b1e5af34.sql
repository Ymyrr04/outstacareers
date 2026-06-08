CREATE OR REPLACE FUNCTION public.update_my_portal_user_profile(
  _full_name text,
  _primary_email text,
  _secondary_email text,
  _phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.client_portal_users
    SET full_name       = NULLIF(btrim(coalesce(_full_name,'')), ''),
        primary_email   = NULLIF(btrim(coalesce(_primary_email,'')), ''),
        secondary_email = NULLIF(btrim(coalesce(_secondary_email,'')), ''),
        phone           = NULLIF(btrim(coalesce(_phone,'')), ''),
        updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_portal_user_profile(text, text, text, text) TO authenticated;