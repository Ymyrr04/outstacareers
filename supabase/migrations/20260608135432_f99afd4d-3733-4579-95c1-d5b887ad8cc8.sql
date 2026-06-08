CREATE OR REPLACE FUNCTION public.update_my_client_profile(
  _company_name text,
  _industry text,
  _website text,
  _address text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
BEGIN
  _cid := public.get_my_client_id();
  IF _cid IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _company_name IS NULL OR length(btrim(_company_name)) = 0 THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;
  UPDATE public.clients
    SET company_name = btrim(_company_name),
        industry = NULLIF(btrim(coalesce(_industry,'')), ''),
        website  = NULLIF(btrim(coalesce(_website,'')), ''),
        address  = NULLIF(btrim(coalesce(_address,'')), ''),
        updated_at = now()
  WHERE id = _cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_client_profile(text, text, text, text) TO authenticated;