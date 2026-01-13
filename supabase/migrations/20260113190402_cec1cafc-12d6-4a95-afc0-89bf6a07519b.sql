-- Add whatsapp column to applicants_prescreen table
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS whatsapp text;