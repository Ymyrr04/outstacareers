-- Add qualifications column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN qualifications TEXT[] DEFAULT '{}'::TEXT[];