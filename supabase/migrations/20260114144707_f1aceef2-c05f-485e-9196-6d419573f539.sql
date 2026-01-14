-- Add details_viewed_at column to track when applicant details were viewed
ALTER TABLE public.applicants_prescreen
ADD COLUMN details_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;