-- Add message_id column to email_logs for thread tracking
ALTER TABLE public.email_logs 
ADD COLUMN message_id text UNIQUE;

-- Add index for faster lookups when matching replies
CREATE INDEX idx_email_logs_message_id ON public.email_logs(message_id) WHERE message_id IS NOT NULL;