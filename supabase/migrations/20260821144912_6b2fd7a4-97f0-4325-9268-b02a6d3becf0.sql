ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_notes text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS calendar_notes jsonb DEFAULT '[]'::jsonb;