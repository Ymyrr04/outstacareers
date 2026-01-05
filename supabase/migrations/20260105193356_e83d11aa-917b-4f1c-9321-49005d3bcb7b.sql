-- Add in_reply_to column to track email threads
ALTER TABLE public.email_replies 
ADD COLUMN IF NOT EXISTS in_reply_to TEXT;

-- Add index for thread matching
CREATE INDEX IF NOT EXISTS idx_email_replies_in_reply_to ON public.email_replies(in_reply_to);