
CREATE TABLE public.recurring_contractor_email_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid REFERENCES public.contractor_email_templates(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  frequency text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_contractor_email_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view recurring schedules"
  ON public.recurring_contractor_email_schedules FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert recurring schedules"
  ON public.recurring_contractor_email_schedules FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update recurring schedules"
  ON public.recurring_contractor_email_schedules FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete recurring schedules"
  ON public.recurring_contractor_email_schedules FOR DELETE
  USING (is_admin(auth.uid()));

CREATE TRIGGER update_recurring_schedules_updated_at
  BEFORE UPDATE ON public.recurring_contractor_email_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
