
-- Contractor pipeline milestone stages
CREATE TABLE public.contractor_pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  emoji TEXT,
  stage_order INTEGER NOT NULL DEFAULT 0,
  trigger_days INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  checkin_email_subject TEXT,
  checkin_email_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view contractor pipeline stages" ON public.contractor_pipeline_stages FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert contractor pipeline stages" ON public.contractor_pipeline_stages FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update contractor pipeline stages" ON public.contractor_pipeline_stages FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete contractor pipeline stages" ON public.contractor_pipeline_stages FOR DELETE USING (is_admin(auth.uid()));

-- Seed milestone stages
INSERT INTO public.contractor_pipeline_stages (name, slug, emoji, stage_order, trigger_days, is_system, checkin_email_subject, checkin_email_body) VALUES
  ('Onboarding', 'onboarding', '🚀', 0, 0, true, 'New Contractor Onboarding - {{contractor_name}}', 'Hi {{client_name}},\n\nThis is to confirm that {{contractor_name}} has started their onboarding with your team as {{job_title}}.\n\nPlease let us know if you need anything during this transition period.\n\nBest regards,\nMark'),
  ('Week 1 Check-in', 'week_1_checkin', '📋', 1, 7, true, 'Week 1 Check-in: {{contractor_name}}', 'Hi {{client_name}},\n\n{{contractor_name}} has completed their first week as {{job_title}} with your team.\n\nWe would love to hear your feedback:\n- How has the onboarding experience been?\n- Is {{contractor_name}} meeting your expectations so far?\n- Any concerns or areas for improvement?\n\nYour feedback helps us ensure we provide the best talent for your team.\n\nBest regards,\nMark'),
  ('Week 2 Check-in', 'week_2_checkin', '📊', 2, 14, true, 'Week 2 Check-in: {{contractor_name}}', 'Hi {{client_name}},\n\n{{contractor_name}} is now in their second week as {{job_title}}.\n\nQuick check-in:\n- How is {{contractor_name}} performing?\n- Are there any adjustments needed?\n- Is the workload appropriate?\n\nPlease don''t hesitate to reach out if you have any feedback.\n\nBest regards,\nMark'),
  ('Month 1 Review', 'month_1_review', '🎯', 3, 30, true, 'Month 1 Performance Review: {{contractor_name}}', 'Hi {{client_name}},\n\n{{contractor_name}} has completed their first month as {{job_title}} with your team.\n\nWe''d appreciate your detailed feedback on:\n- Overall performance and quality of work\n- Communication and collaboration\n- Areas of strength\n- Any areas needing improvement\n- Would you like to continue with {{contractor_name}}?\n\nYour input is invaluable to us.\n\nBest regards,\nMark'),
  ('Month 2 Review', 'month_2_review', '📈', 4, 60, true, 'Month 2 Performance Review: {{contractor_name}}', 'Hi {{client_name}},\n\nIt''s been two months since {{contractor_name}} joined your team as {{job_title}}.\n\nHow are things going?\n- Any changes in performance since last check-in?\n- Is {{contractor_name}} continuing to meet expectations?\n- Any feedback or concerns?\n\nBest regards,\nMark'),
  ('Month 3 Review', 'month_3_review', '⭐', 5, 90, true, 'Month 3 Performance Review: {{contractor_name}}', 'Hi {{client_name}},\n\nIt''s been three months since {{contractor_name}} started as {{job_title}} with your team.\n\nThis is a key milestone. We''d love to hear:\n- Overall satisfaction with {{contractor_name}}''s work\n- Has {{contractor_name}} fully integrated with the team?\n- Any long-term feedback or concerns?\n- Would you like to discuss any changes?\n\nBest regards,\nMark'),
  ('Settled', 'settled', '✅', 6, 120, true, NULL, NULL);

-- Contractor pipeline tracking
CREATE TABLE public.contractor_pipeline_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_assignment_id UUID NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  current_stage_id UUID NOT NULL REFERENCES public.contractor_pipeline_stages(id),
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_moved BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contractor_assignment_id)
);

ALTER TABLE public.contractor_pipeline_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view contractor pipeline tracking" ON public.contractor_pipeline_tracking FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert contractor pipeline tracking" ON public.contractor_pipeline_tracking FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update contractor pipeline tracking" ON public.contractor_pipeline_tracking FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete contractor pipeline tracking" ON public.contractor_pipeline_tracking FOR DELETE USING (is_admin(auth.uid()));

-- Enable realtime for tracking table
ALTER PUBLICATION supabase_realtime ADD TABLE public.contractor_pipeline_tracking;

-- Contractor check-in email logs
CREATE TABLE public.contractor_checkin_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_assignment_id UUID NOT NULL REFERENCES public.contractor_assignments(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.contractor_pipeline_stages(id),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_checkin_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view contractor checkin emails" ON public.contractor_checkin_emails FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert contractor checkin emails" ON public.contractor_checkin_emails FOR INSERT WITH CHECK (is_admin(auth.uid()));

-- Trigger for updated_at on tracking
CREATE TRIGGER update_contractor_pipeline_tracking_updated_at
  BEFORE UPDATE ON public.contractor_pipeline_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contractor_pipeline_stages_updated_at
  BEFORE UPDATE ON public.contractor_pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
