-- Make department column nullable so it's optional when adding jobs
ALTER TABLE public.jobs ALTER COLUMN department DROP NOT NULL;

-- Set a default value for department
ALTER TABLE public.jobs ALTER COLUMN department SET DEFAULT 'General';