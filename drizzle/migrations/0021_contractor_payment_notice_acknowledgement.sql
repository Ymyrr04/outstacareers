CREATE TABLE public.contractor_payment_notice_acknowledgements (
 user_id uuid NOT NULL,
 notice_version text NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, notice_version)
);
GRANT SELECT ON public.contractor_payment_notice_acknowledgements TO authenticated;
GRANT ALL ON public.contractor_payment_notice_acknowledgements TO service_role;
ALTER TABLE public.contractor_payment_notice_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contractors read own payment acknowledgement" ON public.contractor_payment_notice_acknowledgements FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE FUNCTION public.has_acknowledged_contractor_payment_notice() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.contractor_payment_notice_acknowledgements WHERE user_id = auth.uid() AND notice_version = 'payment-process-2026-10-16');
$$;
CREATE FUNCTION public.acknowledge_contractor_payment_notice() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.contractor_portal_users WHERE user_id = auth.uid()) THEN
  RAISE EXCEPTION 'Contractor portal account required' USING ERRCODE = '42501';
 END IF;
 INSERT INTO public.contractor_payment_notice_acknowledgements (user_id, notice_version) VALUES (auth.uid(), 'payment-process-2026-10-16') ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.has_acknowledged_contractor_payment_notice() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acknowledge_contractor_payment_notice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_acknowledged_contractor_payment_notice() TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_contractor_payment_notice() TO authenticated;
CREATE FUNCTION public.require_contractor_payment_notice_acknowledgement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' THEN
  IF NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS (SELECT 1 FROM public.contractor_portal_users WHERE user_id = auth.uid() AND contractor_assignment_id = NEW.contractor_assignment_id)
    AND NOT public.has_acknowledged_contractor_payment_notice() THEN
  RAISE EXCEPTION 'Please read and acknowledge the payment process update before submitting your timesheet.' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_contractor_payment_notice_acknowledgement() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_payment_notice_before_submission BEFORE INSERT OR UPDATE ON public.contractor_timesheets FOR EACH ROW EXECUTE FUNCTION public.require_contractor_payment_notice_acknowledgement();