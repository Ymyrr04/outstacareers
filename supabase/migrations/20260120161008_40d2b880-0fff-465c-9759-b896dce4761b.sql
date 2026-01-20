-- Add column to track second reminder
ALTER TABLE public.interview_sessions 
ADD COLUMN IF NOT EXISTS second_reminder_sent_at timestamp with time zone;