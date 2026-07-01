REVOKE EXECUTE ON FUNCTION public.get_contractor_checkin_messages(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_contractor_checkin_messages(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_contractor_checkin_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contractor_checkin_messages(uuid) TO service_role;