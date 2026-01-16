-- Add is_read column to track which replies have been viewed by admins
ALTER TABLE public.email_replies ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient filtering of unread replies
CREATE INDEX idx_email_replies_is_read ON public.email_replies (is_read) WHERE is_read = false;