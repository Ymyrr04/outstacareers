-- Update default status to 'For Review' for new applicants
ALTER TABLE public.applicants_prescreen 
ALTER COLUMN status SET DEFAULT 'For Review';

-- Update any existing 'Reviewed' status back to 'For Review' if they haven't been actually reviewed
-- (keeping existing statuses that were intentionally set)