-- Update applicants_prescreen policies to use is_admin
DROP POLICY IF EXISTS "Admins can view applicants" ON public.applicants_prescreen;
DROP POLICY IF EXISTS "Admins can update applicants" ON public.applicants_prescreen;
DROP POLICY IF EXISTS "Admins can delete applicants" ON public.applicants_prescreen;

CREATE POLICY "Admins can view applicants"
ON public.applicants_prescreen
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update applicants"
ON public.applicants_prescreen
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete applicants"
ON public.applicants_prescreen
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update email_logs policies
DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Admins can insert email logs" ON public.email_logs;

CREATE POLICY "Admins can view email logs"
ON public.email_logs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert email logs"
ON public.email_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Update email_templates policies
DROP POLICY IF EXISTS "Admins can view email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can insert email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can update email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can delete email templates" ON public.email_templates;

CREATE POLICY "Admins can view email templates"
ON public.email_templates
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert email templates"
ON public.email_templates
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update email templates"
ON public.email_templates
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete email templates"
ON public.email_templates
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update email_replies policies
DROP POLICY IF EXISTS "Admins can view email replies" ON public.email_replies;

CREATE POLICY "Admins can view email replies"
ON public.email_replies
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update scheduled_emails policies
DROP POLICY IF EXISTS "Admins can view scheduled emails" ON public.scheduled_emails;
DROP POLICY IF EXISTS "Admins can insert scheduled emails" ON public.scheduled_emails;
DROP POLICY IF EXISTS "Admins can update scheduled emails" ON public.scheduled_emails;
DROP POLICY IF EXISTS "Admins can delete scheduled emails" ON public.scheduled_emails;

CREATE POLICY "Admins can view scheduled emails"
ON public.scheduled_emails
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert scheduled emails"
ON public.scheduled_emails
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update scheduled emails"
ON public.scheduled_emails
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete scheduled emails"
ON public.scheduled_emails
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update user_roles policies for admin access
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update analytics_events policies
DROP POLICY IF EXISTS "Admins can view analytics" ON public.analytics_events;

CREATE POLICY "Admins can view analytics"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update job_interview_questions policies
DROP POLICY IF EXISTS "Admins can manage job interview questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can view job interview questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can insert job interview questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can update job interview questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can delete job interview questions" ON public.job_interview_questions;

CREATE POLICY "Admins can view job interview questions"
ON public.job_interview_questions
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert job interview questions"
ON public.job_interview_questions
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update job interview questions"
ON public.job_interview_questions
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete job interview questions"
ON public.job_interview_questions
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Update availability_responses policies
DROP POLICY IF EXISTS "Admins can view availability responses" ON public.availability_responses;

CREATE POLICY "Admins can view availability responses"
ON public.availability_responses
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));