
CREATE TABLE public.contractor_checkin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_assignment_id UUID NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.contractor_pipeline_stages(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkin_messages_assignment ON public.contractor_checkin_messages(contractor_assignment_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_checkin_messages TO authenticated;
GRANT ALL ON public.contractor_checkin_messages TO service_role;

ALTER TABLE public.contractor_checkin_messages ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "Admins manage checkin messages"
  ON public.contractor_checkin_messages FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Contractors can read + mark-read their own messages
CREATE POLICY "Contractors read own checkin messages"
  ON public.contractor_checkin_messages FOR SELECT
  USING (public.is_my_contractor_assignment(contractor_assignment_id));

CREATE POLICY "Contractors update own checkin messages"
  ON public.contractor_checkin_messages FOR UPDATE
  USING (public.is_my_contractor_assignment(contractor_assignment_id));
