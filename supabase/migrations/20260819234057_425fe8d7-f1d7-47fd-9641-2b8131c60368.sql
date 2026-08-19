CREATE TABLE public.calendar_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_types TO authenticated;
GRANT ALL ON public.calendar_event_types TO service_role;

ALTER TABLE public.calendar_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view event types"
ON public.calendar_event_types FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can create event types"
ON public.calendar_event_types FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update event types"
ON public.calendar_event_types FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete event types"
ON public.calendar_event_types FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));