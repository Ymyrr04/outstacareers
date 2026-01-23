-- Add missing index for scheduled_emails applicant_id and status for faster queries
CREATE INDEX idx_scheduled_emails_applicant_status ON public.scheduled_emails(applicant_id, status);

-- Add composite index for email_replies applicant_id + received_at for better sorting performance
CREATE INDEX idx_email_replies_applicant_received ON public.email_replies(applicant_id, received_at DESC);