-- Add paste_detected column to interview_answers table to track if text answers were pasted
ALTER TABLE public.interview_answers 
ADD COLUMN paste_detected BOOLEAN DEFAULT FALSE;