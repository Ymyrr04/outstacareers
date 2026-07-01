CREATE OR REPLACE FUNCTION public.get_contractor_checkin_messages(_contractor_assignment_id uuid)
RETURNS TABLE (
  id uuid,
  subject text,
  body_html text,
  read_at timestamptz,
  created_at timestamptz,
  template_type text,
  sections jsonb,
  responses jsonb,
  submitted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.subject,
    m.body_html,
    m.read_at,
    m.created_at,
    m.template_type,
    m.sections,
    m.responses,
    m.submitted_at
  FROM public.contractor_checkin_messages m
  WHERE m.contractor_assignment_id = _contractor_assignment_id
    AND EXISTS (
      SELECT 1
      FROM public.contractor_portal_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.contractor_assignment_id = _contractor_assignment_id
    )
  ORDER BY m.created_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_contractor_checkin_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contractor_checkin_messages(uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contractor_checkin_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contractor_checkin_messages;
  END IF;
END $$;