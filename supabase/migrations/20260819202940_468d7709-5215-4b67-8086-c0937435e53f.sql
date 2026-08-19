CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time integer NOT NULL,
  end_time integer NOT NULL,
  event_type text NOT NULL DEFAULT 'task',
  created_by uuid NOT NULL,
  assigned_to uuid[] NOT NULL DEFAULT '{}',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar events" ON public.calendar_events FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_calendar_events_date ON public.calendar_events(event_date);

CREATE TABLE public.calendar_event_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  comment text NOT NULL,
  commented_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_comments TO authenticated;
GRANT ALL ON public.calendar_event_comments TO service_role;
ALTER TABLE public.calendar_event_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar comments" ON public.calendar_event_comments FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.calendar_admin_colors (
  user_id uuid PRIMARY KEY,
  color_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_admin_colors TO authenticated;
GRANT ALL ON public.calendar_admin_colors TO service_role;
ALTER TABLE public.calendar_admin_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar colors" ON public.calendar_admin_colors FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));