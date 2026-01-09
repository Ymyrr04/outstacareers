-- Add assigned_admin_id column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make apply_url nullable since it's no longer required
ALTER TABLE public.jobs 
ALTER COLUMN apply_url DROP NOT NULL;

-- Set a default value for apply_url for new records (internal handling)
ALTER TABLE public.jobs 
ALTER COLUMN apply_url SET DEFAULT '';