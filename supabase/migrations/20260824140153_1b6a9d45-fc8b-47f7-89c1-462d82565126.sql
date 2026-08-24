ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_open_task boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_tbd boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;