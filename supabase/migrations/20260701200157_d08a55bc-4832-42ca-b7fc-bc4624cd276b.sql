ALTER TABLE public.contractor_checkin_messages
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS sections jsonb,
  ADD COLUMN IF NOT EXISTS responses jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;