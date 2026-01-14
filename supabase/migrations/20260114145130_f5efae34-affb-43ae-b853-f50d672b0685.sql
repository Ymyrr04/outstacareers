-- Add is_starred column for favorites/pinning applicants
ALTER TABLE public.applicants_prescreen
ADD COLUMN is_starred BOOLEAN DEFAULT FALSE;