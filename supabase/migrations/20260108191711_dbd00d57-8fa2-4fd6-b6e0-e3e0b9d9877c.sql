-- Add new columns for availability tracking, reprofiling, source, and candidate profile
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS job_source text,
ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT NULL,
ADD COLUMN IF NOT EXISTS availability_checked_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_job_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_job_title text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reprofiled_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS candidate_profile text DEFAULT NULL;

-- Update email_templates table to add template ordering and ensure all pipeline stages have templates
-- Add trigger order column for sorting
ALTER TABLE public.email_templates 
ADD COLUMN IF NOT EXISTS template_order integer DEFAULT 0;

-- Update existing templates with proper ordering based on the new pipeline
UPDATE public.email_templates SET template_order = 1 WHERE status_trigger = 'application_received';
UPDATE public.email_templates SET template_order = 2 WHERE status_trigger = 'for_interview';
UPDATE public.email_templates SET template_order = 3 WHERE status_trigger = 'siv';
UPDATE public.email_templates SET template_order = 4 WHERE status_trigger = 'client_interview';
UPDATE public.email_templates SET template_order = 5 WHERE status_trigger = 'hired';
UPDATE public.email_templates SET template_order = 6 WHERE status_trigger = 'bench';
UPDATE public.email_templates SET template_order = 7 WHERE status_trigger = 'reject';
UPDATE public.email_templates SET template_order = 8 WHERE status_trigger = 'check_availability';
UPDATE public.email_templates SET template_order = 9 WHERE status_trigger = 'reprofiling';

-- Insert missing email templates for new pipeline stages (only if they don't exist)
INSERT INTO public.email_templates (status_trigger, subject, body_html, is_enabled, delay_hours, template_order)
SELECT 'siv', 'Next Step: Skills Interview Video', 'Hi {{full_name}},

Congratulations! You have been selected to proceed to the Skills Interview Video (SIV) stage.

Please prepare a short video showcasing your skills and experience. We will send you detailed instructions shortly.

Best regards,
The Recruitment Team', true, 0, 3
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE status_trigger = 'siv');

INSERT INTO public.email_templates (status_trigger, subject, body_html, is_enabled, delay_hours, template_order)
SELECT 'client_interview', 'Client Interview Scheduled', 'Hi {{full_name}},

Great news! You have been selected for a client interview.

We will be in touch shortly with the interview details.

Best regards,
The Recruitment Team', true, 0, 4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE status_trigger = 'client_interview');

INSERT INTO public.email_templates (status_trigger, subject, body_html, is_enabled, delay_hours, template_order)
SELECT 'hired', 'Congratulations - You''re Hired!', 'Hi {{full_name}},

Congratulations! We are thrilled to inform you that you have been hired.

Welcome to the team! We will be sending you onboarding details shortly.

Best regards,
The Recruitment Team', true, 0, 5
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE status_trigger = 'hired');

INSERT INTO public.email_templates (status_trigger, subject, body_html, is_enabled, delay_hours, template_order)
SELECT 'check_availability', 'Are You Still Available?', 'Hi {{full_name}},

We wanted to check in with you regarding your availability.

Are you still interested in being presented to our clients?

{{availability_yes_link}} - Yes, I am available
{{availability_no_link}} - No, I am not available at this time

Please let us know by clicking one of the links above.

Best regards,
The Recruitment Team', true, 0, 8
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE status_trigger = 'check_availability');

INSERT INTO public.email_templates (status_trigger, subject, body_html, is_enabled, delay_hours, template_order)
SELECT 'reprofiling', 'New Opportunity - Different Role', 'Hi {{full_name}},

After reviewing your profile, we believe you would be an excellent fit for a different role than the one you originally applied for.

We would like to consider you for the position of: {{new_role}}

Are you open to being considered for this role?

Please reply to this email to let us know.

Best regards,
The Recruitment Team', true, 0, 9
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE status_trigger = 'reprofiling');

-- Create availability_responses table for tracking Yes/No clicks
CREATE TABLE IF NOT EXISTS public.availability_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id uuid NOT NULL,
  response text NOT NULL CHECK (response IN ('yes', 'no')),
  response_token text NOT NULL UNIQUE,
  responded_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on availability_responses
ALTER TABLE public.availability_responses ENABLE ROW LEVEL SECURITY;

-- Public can insert their response (via magic link)
CREATE POLICY "Public can respond to availability check"
ON public.availability_responses
FOR UPDATE
USING (response_token IS NOT NULL AND responded_at IS NULL);

-- Allow insert without auth (for creating tokens)
CREATE POLICY "Service role can insert availability tokens"
ON public.availability_responses
FOR INSERT
WITH CHECK (true);

-- Admins can view all responses
CREATE POLICY "Admins can view availability responses"
ON public.availability_responses
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete responses
CREATE POLICY "Admins can delete availability responses"
ON public.availability_responses
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));