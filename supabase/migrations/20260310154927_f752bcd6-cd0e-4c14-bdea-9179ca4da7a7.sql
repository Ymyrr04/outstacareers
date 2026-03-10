
CREATE TABLE public.contractor_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_assignment_id uuid NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body_html text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamp with time zone,
  scheduled_for timestamp with time zone,
  error_message text,
  message_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view contractor email logs" ON public.contractor_email_logs
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert contractor email logs" ON public.contractor_email_logs
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
