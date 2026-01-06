-- Create table for storing custom interview questions per job
CREATE TABLE public.job_interview_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_context TEXT,
  question_type TEXT NOT NULL CHECK (question_type IN ('voice', 'text')),
  question_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.job_interview_questions ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated admins can view questions
CREATE POLICY "Admins can view job questions"
ON public.job_interview_questions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins can insert questions
CREATE POLICY "Admins can insert job questions"
ON public.job_interview_questions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins can update questions
CREATE POLICY "Admins can update job questions"
ON public.job_interview_questions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins can delete questions
CREATE POLICY "Admins can delete job questions"
ON public.job_interview_questions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Allow anon to read questions (needed for applicant interviews)
CREATE POLICY "Anyone can view job questions for interviews"
ON public.job_interview_questions
FOR SELECT
TO anon
USING (true);

-- Add trigger for updating timestamps
CREATE TRIGGER update_job_interview_questions_updated_at
BEFORE UPDATE ON public.job_interview_questions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient lookups
CREATE INDEX idx_job_interview_questions_job_id ON public.job_interview_questions(job_id);
CREATE INDEX idx_job_interview_questions_type ON public.job_interview_questions(question_type);