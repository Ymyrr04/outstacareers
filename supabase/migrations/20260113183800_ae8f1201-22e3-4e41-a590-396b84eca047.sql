-- Fix RLS policies to include both anon and authenticated users for interview flow

-- Drop existing policies that only target anon
DROP POLICY IF EXISTS "Public can add questions to active sessions" ON public.interview_questions;
DROP POLICY IF EXISTS "Public can view questions for own session" ON public.interview_questions;
DROP POLICY IF EXISTS "Public can submit answers to active session" ON public.interview_answers;
DROP POLICY IF EXISTS "Anon can view own active sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Anon can create session for valid applicant" ON public.interview_sessions;

-- Recreate policies with both anon and public (authenticated) roles

-- interview_questions policies
CREATE POLICY "Anyone can add questions to active sessions" 
ON public.interview_questions 
FOR INSERT 
TO anon, public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM interview_sessions
    WHERE interview_sessions.id = interview_questions.session_id
    AND interview_sessions.status = 'in_progress'
  )
);

CREATE POLICY "Anyone can view questions for active sessions" 
ON public.interview_questions 
FOR SELECT 
TO anon, public
USING (
  EXISTS (
    SELECT 1 FROM interview_sessions
    WHERE interview_sessions.id = interview_questions.session_id
    AND interview_sessions.status = 'in_progress'
  )
);

-- interview_answers policies
CREATE POLICY "Anyone can submit answers to active session" 
ON public.interview_answers 
FOR INSERT 
TO anon, public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM interview_sessions s
    JOIN interview_questions q ON q.session_id = s.id
    WHERE q.id = interview_answers.question_id
    AND s.status = 'in_progress'
  )
  AND ai_score IS NULL 
  AND ai_feedback IS NULL
);

-- interview_sessions policies
CREATE POLICY "Anyone can view own active sessions" 
ON public.interview_sessions 
FOR SELECT 
TO anon, public
USING (
  status = 'in_progress'
  AND started_at > now() - interval '2 hours'
);

CREATE POLICY "Anyone can create session for valid applicant" 
ON public.interview_sessions 
FOR INSERT 
TO anon, public
WITH CHECK (applicant_exists(applicant_id));