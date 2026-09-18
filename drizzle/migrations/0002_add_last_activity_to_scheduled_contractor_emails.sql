ALTER TABLE public.scheduled_contractor_emails
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;