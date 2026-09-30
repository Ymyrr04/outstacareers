CREATE OR REPLACE FUNCTION public.get_calendar_hidden_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.admin_tab_permissions
  WHERE tab_id = 'calendar' AND can_view = false AND public.is_admin(auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.get_calendar_hidden_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_hidden_user_ids() TO authenticated;