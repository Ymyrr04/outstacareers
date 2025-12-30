-- Add column to store detailed AI assessment breakdown
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS ai_assessment_details jsonb DEFAULT NULL;