ALTER TABLE public.applicants_prescreen
  ADD COLUMN IF NOT EXISTS employment_status text,
  ADD COLUMN IF NOT EXISTS last_day_with_employer text;