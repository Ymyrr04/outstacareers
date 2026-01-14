-- Add admin_notified_at column to track when admin was notified about an application
ALTER TABLE public.interview_sessions 
ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;