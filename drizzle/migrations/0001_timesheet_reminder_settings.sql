
CREATE TABLE public.timesheet_reminder_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  day_of_week integer NOT NULL DEFAULT 6 CHECK (day_of_week BETWEEN 0 AND 6),
  reminder_time time NOT NULL DEFAULT '09:00',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.timesheet_reminder_settings (id, day_of_week, reminder_time, enabled)
VALUES (true, 6, '09:00', true)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.timesheet_reminder_settings TO authenticated;
GRANT ALL ON public.timesheet_reminder_settings TO service_role;

ALTER TABLE public.timesheet_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read reminder settings"
ON public.timesheet_reminder_settings
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_timesheet_reminder_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.timesheet_reminder_settings%ROWTYPE;
  utc_time time;
  cron_expr text;
BEGIN
  SELECT * INTO s FROM public.timesheet_reminder_settings WHERE id = true;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM cron.unschedule('weekly-timesheet-reminders');

  IF s.enabled THEN
    utc_time := ((CURRENT_DATE + s.reminder_time) AT TIME ZONE 'America/New_York')::time;
    cron_expr := format('%s %s * * %s',
      date_part('minute', utc_time)::int,
      date_part('hour', utc_time)::int,
      s.day_of_week);
    PERFORM cron.schedule(
      'weekly-timesheet-reminders',
      cron_expr,
      $job$
      SELECT
        net.http_post(
          url:=current_setting('app.settings.supabase_url') || '/functions/v1/send-timesheet-reminders',
          headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body:='{}'::jsonb
        ) AS request_id;
      $job$
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_timesheet_reminder_schedule(
  p_day_of_week integer,
  p_time text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_day_of_week < 0 OR p_day_of_week > 6 THEN
    RAISE EXCEPTION 'invalid day_of_week';
  END IF;

  INSERT INTO public.timesheet_reminder_settings (id, day_of_week, reminder_time, enabled, updated_at)
  VALUES (true, p_day_of_week, p_time::time, p_enabled, now())
  ON CONFLICT (id) DO UPDATE
    SET day_of_week = EXCLUDED.day_of_week,
        reminder_time = EXCLUDED.reminder_time,
        enabled = EXCLUDED.enabled,
        updated_at = now();

  PERFORM public.apply_timesheet_reminder_schedule();
END;
$$;

REVOKE ALL ON FUNCTION public.set_timesheet_reminder_schedule(integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_timesheet_reminder_schedule(integer, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_timesheet_reminder_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_timesheet_reminder_schedule() TO service_role;
