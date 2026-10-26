CREATE TABLE public.client_timesheet_email_settings (
 client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 day_of_week integer NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),
 send_time time NOT NULL DEFAULT '09:00' CHECK (extract(minute from send_time) IN (0,30) AND extract(second from send_time)=0),
 time_zone text NOT NULL DEFAULT 'America/New_York' CHECK (time_zone = 'America/New_York'),
 next_send_at timestamptz,
 last_sent_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_timesheet_email_settings TO authenticated;
GRANT ALL ON public.client_timesheet_email_settings TO service_role;
ALTER TABLE public.client_timesheet_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_client_timesheet_email_settings ON public.client_timesheet_email_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TABLE public.client_timesheet_digest_deliveries (
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 scheduled_at timestamptz NOT NULL,
 recipient_email text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id, scheduled_at, recipient_email)
);
GRANT ALL ON public.client_timesheet_digest_deliveries TO service_role;
ALTER TABLE public.client_timesheet_digest_deliveries ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.next_client_timesheet_email(_day integer, _time time, _after timestamptz) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE local_date date := (_after AT TIME ZONE 'America/New_York')::date; candidate timestamptz;
BEGIN
 FOR i IN 0..7 LOOP
  IF extract(dow FROM local_date+i)::integer=_day THEN
   candidate := ((local_date+i)+_time) AT TIME ZONE 'America/New_York';
   IF candidate>_after THEN RETURN candidate; END IF;
  END IF;
 END LOOP;
 RAISE EXCEPTION 'Invalid schedule';
END $$;
CREATE FUNCTION public.prepare_client_timesheet_email_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.last_sent_at:=now();
  NEW.next_send_at:=CASE WHEN NEW.enabled THEN public.next_client_timesheet_email(NEW.day_of_week, NEW.send_time, now()) ELSE NULL END;
 ELSIF NEW.enabled IS DISTINCT FROM OLD.enabled OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week OR NEW.send_time IS DISTINCT FROM OLD.send_time THEN
  IF NOT OLD.enabled AND NEW.enabled THEN NEW.last_sent_at:=now(); END IF;
  NEW.next_send_at:=CASE WHEN NEW.enabled THEN public.next_client_timesheet_email(NEW.day_of_week, NEW.send_time, now()) ELSE NULL END;
  NEW.locked_until:=NULL;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER prepare_client_timesheet_email_settings BEFORE INSERT OR UPDATE ON public.client_timesheet_email_settings FOR EACH ROW EXECUTE FUNCTION public.prepare_client_timesheet_email_settings();
CREATE FUNCTION public.claim_client_timesheet_digests() RETURNS SETOF public.client_timesheet_email_settings LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.client_timesheet_email_settings SET locked_until=now()+interval '10 minutes'
 WHERE client_id IN (SELECT client_id FROM public.client_timesheet_email_settings WHERE enabled AND next_send_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY next_send_at LIMIT 10 FOR UPDATE SKIP LOCKED)
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_client_timesheet_digests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_timesheet_digests() TO service_role;
CREATE FUNCTION public.finish_client_timesheet_digest(_client_id uuid, _scheduled_at timestamptz) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.client_timesheet_email_settings SET last_sent_at=_scheduled_at, next_send_at=public.next_client_timesheet_email(day_of_week,send_time,greatest(now(),_scheduled_at)), locked_until=NULL WHERE client_id=_client_id AND enabled AND next_send_at=_scheduled_at;
$$;
REVOKE ALL ON FUNCTION public.finish_client_timesheet_digest(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_client_timesheet_digest(uuid,timestamptz) TO service_role;