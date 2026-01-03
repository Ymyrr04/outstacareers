-- Add columns for extracted CV metadata
ALTER TABLE public.applicants_prescreen
ADD COLUMN IF NOT EXISTS extracted_skills text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS extracted_tools text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS years_of_experience integer DEFAULT NULL;

-- Create an index for full-text search on CV text
CREATE INDEX IF NOT EXISTS idx_applicants_cv_text_search 
ON public.applicants_prescreen 
USING gin(to_tsvector('english', COALESCE(cv_text, '')));

-- Create an index for skills array search
CREATE INDEX IF NOT EXISTS idx_applicants_skills 
ON public.applicants_prescreen 
USING gin(extracted_skills);

-- Create an index for tools array search
CREATE INDEX IF NOT EXISTS idx_applicants_tools 
ON public.applicants_prescreen 
USING gin(extracted_tools);