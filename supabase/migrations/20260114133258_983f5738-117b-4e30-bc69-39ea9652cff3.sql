-- Add column to track interview reminders (only for new applicants moving forward)
ALTER TABLE public.interview_sessions 
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for efficient querying of pending reminders
CREATE INDEX IF NOT EXISTS idx_interview_sessions_reminder_pending 
ON public.interview_sessions (started_at, status, reminder_sent_at) 
WHERE status = 'in_progress' AND reminder_sent_at IS NULL;