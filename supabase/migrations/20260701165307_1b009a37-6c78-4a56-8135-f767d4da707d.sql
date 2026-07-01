ALTER TABLE public.contractor_assignments
  ADD COLUMN IF NOT EXISTS checkin_reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_reminder_time time;