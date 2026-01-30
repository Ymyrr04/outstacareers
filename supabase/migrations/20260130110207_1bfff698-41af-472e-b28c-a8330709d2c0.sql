-- Add column to store the actual pasted content for highlighting
ALTER TABLE public.interview_answers
ADD COLUMN pasted_content text;