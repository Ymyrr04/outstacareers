-- Email templates table for editable templates per status
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_trigger TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  delay_hours INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Email logs table for communication history
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE,
  applicant_status_at_send TEXT,
  is_automated BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scheduled emails for delayed sending (especially rejections)
CREATE TABLE public.scheduled_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.applicants_prescreen(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  canceled_at TIMESTAMP WITH TIME ZONE,
  canceled_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_templates
CREATE POLICY "Admins can view email templates"
ON public.email_templates FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert email templates"
ON public.email_templates FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update email templates"
ON public.email_templates FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete email templates"
ON public.email_templates FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for email_logs
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert email logs"
ON public.email_logs FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for scheduled_emails
CREATE POLICY "Admins can view scheduled emails"
ON public.scheduled_emails FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert scheduled emails"
ON public.scheduled_emails FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update scheduled emails"
ON public.scheduled_emails FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete scheduled emails"
ON public.scheduled_emails FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on email_templates
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates for all statuses
INSERT INTO public.email_templates (status_trigger, subject, body_html, is_enabled, delay_hours) VALUES
('application_received', 'Application Received - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Thank you for applying for the <strong>{{job_title}}</strong> position at Outsta.</p><p>We have received your application and our team will review it carefully. You can expect to hear from us within 5-7 business days.</p><p>In the meantime, if you have any questions, feel free to reach out.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', true, 0),
('reviewed', 'Application Update - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>We wanted to let you know that your application for <strong>{{job_title}}</strong> is currently being reviewed by our team.</p><p>We will be in touch soon with an update.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', false, 0),
('pass_screening', 'Congratulations! You Passed Screening - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Great news! You have successfully passed the initial screening for the <strong>{{job_title}}</strong> position.</p><p>Our team was impressed with your qualifications and we would like to move forward with the next steps in our hiring process.</p><p>You will receive further instructions shortly.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', true, 0),
('reject', 'Application Update - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Thank you for your interest in the <strong>{{job_title}}</strong> position at Outsta and for taking the time to apply.</p><p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p><p>We encourage you to apply for future openings that match your skills and experience.</p><p>We wish you the best in your job search.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', true, 24),
('50/50', 'Application Under Review - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Thank you for your patience. Your application for <strong>{{job_title}}</strong> is still under consideration.</p><p>We will provide an update soon.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', false, 0),
('for_interview', 'Interview Invitation - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Congratulations! We are pleased to invite you for an interview for the <strong>{{job_title}}</strong> position.</p><p><strong>Interview Details:</strong></p><ul><li>Date: {{interview_date}}</li><li>Time: {{interview_time}} ({{timezone}})</li><li>Meeting Link: <a href="{{meeting_link}}">{{meeting_link}}</a></li></ul><p>Please confirm your availability by replying to this email.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', true, 0),
('candidate_successful', 'Congratulations! - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>We are thrilled to inform you that you have been selected for the <strong>{{job_title}}</strong> position!</p><p>Our HR team will be in touch shortly with the next steps regarding your onboarding.</p><p>Welcome to the team!</p><p>Best regards,<br>The Outsta Recruitment Team</p>', true, 0),
('bench', 'Application Status Update - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Thank you for your interest in the <strong>{{job_title}}</strong> position.</p><p>While we were impressed with your qualifications, we have decided to place your application on our bench list for future consideration.</p><p>We will reach out if a suitable opportunity becomes available.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', false, 0),
('hire', 'Welcome Aboard! - {{job_title}}', '<p>Dear {{applicant_name}},</p><p>Congratulations and welcome to Outsta!</p><p>We are excited to have you join our team as <strong>{{job_title}}</strong>.</p><p>Our HR team will be sending you the necessary documents and information for your first day.</p><p>Best regards,<br>The Outsta Recruitment Team</p>', true, 0);