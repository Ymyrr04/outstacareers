ALTER TABLE public.contractor_leave_applications
  ADD COLUMN IF NOT EXISTS specific_time text,
  ADD COLUMN IF NOT EXISTS compensation_type text,
  ADD COLUMN IF NOT EXISTS compensation_note text;