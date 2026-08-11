ALTER TABLE public.applicants_prescreen
  ADD COLUMN IF NOT EXISTS pre_screening_responses jsonb,
  ADD COLUMN IF NOT EXISTS pre_screening_flagged boolean NOT NULL DEFAULT false;