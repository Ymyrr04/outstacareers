
ALTER TABLE public.client_portal_users ADD COLUMN IF NOT EXISTS label text;

CREATE TABLE IF NOT EXISTS public.client_portal_user_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL REFERENCES public.client_portal_users(id) ON DELETE CASCADE,
  contractor_assignment_id uuid NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_user_id, contractor_assignment_id)
);

GRANT SELECT ON public.client_portal_user_contractors TO authenticated;
GRANT ALL ON public.client_portal_user_contractors TO service_role;

ALTER TABLE public.client_portal_user_contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal user can view own contractor restrictions"
  ON public.client_portal_user_contractors
  FOR SELECT
  TO authenticated
  USING (
    portal_user_id IN (
      SELECT id FROM public.client_portal_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all portal contractor restrictions"
  ON public.client_portal_user_contractors
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert portal contractor restrictions"
  ON public.client_portal_user_contractors
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete portal contractor restrictions"
  ON public.client_portal_user_contractors
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_my_assigned_assignment_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpuc.contractor_assignment_id
  FROM public.client_portal_user_contractors cpuc
  JOIN public.client_portal_users cpu ON cpu.id = cpuc.portal_user_id
  WHERE cpu.user_id = auth.uid()
$$;

CREATE INDEX IF NOT EXISTS idx_cpuc_portal_user ON public.client_portal_user_contractors(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_cpuc_assignment ON public.client_portal_user_contractors(contractor_assignment_id);
