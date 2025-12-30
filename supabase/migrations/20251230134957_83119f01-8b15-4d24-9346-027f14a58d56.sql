-- Add responsibilities column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN responsibilities text[] DEFAULT '{}'::text[];