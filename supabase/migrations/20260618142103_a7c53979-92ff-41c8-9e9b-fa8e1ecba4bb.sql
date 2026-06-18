ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS linkedin_post_id text,
  ADD COLUMN IF NOT EXISTS linkedin_post_url text,
  ADD COLUMN IF NOT EXISTS linkedin_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS linkedin_last_error text;