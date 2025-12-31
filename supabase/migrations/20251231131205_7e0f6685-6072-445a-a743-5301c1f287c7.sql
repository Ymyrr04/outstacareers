-- Update the default status from 'new' to 'Reviewed'
ALTER TABLE public.applicants_prescreen 
ALTER COLUMN status SET DEFAULT 'Reviewed';

-- Update any existing 'new' status to 'Reviewed'
UPDATE public.applicants_prescreen 
SET status = 'Reviewed' 
WHERE status = 'new';