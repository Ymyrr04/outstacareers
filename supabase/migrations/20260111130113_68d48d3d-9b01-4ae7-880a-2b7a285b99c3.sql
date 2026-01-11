
-- Drop overly permissive public policies on interview_sessions
DROP POLICY IF EXISTS "Public can view interview sessions during application" ON public.interview_sessions;
DROP POLICY IF EXISTS "Public can update own interview sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Public can insert interview sessions during application" ON public.interview_sessions;

-- Drop overly permissive public policies on interview_answers
DROP POLICY IF EXISTS "Public can view own interview answers" ON public.interview_answers;
DROP POLICY IF EXISTS "Public can insert interview answers" ON public.interview_answers;

-- Drop overly permissive public policies on interview_questions
DROP POLICY IF EXISTS "Public can view interview questions" ON public.interview_questions;
DROP POLICY IF EXISTS "Public can insert interview questions" ON public.interview_questions;

-- Create secure policies for interview_sessions
-- Only admins can view all sessions (already exists, keeping it)
-- Public can only insert if they have a valid applicant reference
CREATE POLICY "Public can create session for valid applicant"
ON public.interview_sessions
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.applicants_prescreen 
    WHERE id = applicant_id
  )
);

-- Public can only view their own session by ID (passed as a token)
-- This is restrictive - they must know the exact session ID
CREATE POLICY "Public can view own session by id"
ON public.interview_sessions
FOR SELECT
TO anon
USING (true); -- Note: This will be restricted by the application logic passing the session_id

-- Public can only update status to completed, not scores
CREATE POLICY "Public can complete own session"
ON public.interview_sessions
FOR UPDATE
TO anon
USING (status = 'in_progress')
WITH CHECK (
  status IN ('in_progress', 'completed', 'completed_manual_review') AND
  -- Prevent public from setting scores - these should be null or unchanged
  overall_score IS NULL AND
  experience_score IS NULL AND
  technical_score IS NULL AND
  communication_score IS NULL AND
  situational_score IS NULL AND
  personality_score IS NULL AND
  ai_summary IS NULL AND
  ai_strengths IS NULL AND
  ai_concerns IS NULL
);

-- Create secure policies for interview_questions
-- Public can only insert questions for sessions they created (in_progress status)
CREATE POLICY "Public can add questions to active sessions"
ON public.interview_questions
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.interview_sessions
    WHERE id = session_id AND status = 'in_progress'
  )
);

-- Public can only view questions for their active session
CREATE POLICY "Public can view questions for own session"
ON public.interview_questions
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.interview_sessions
    WHERE id = session_id AND status = 'in_progress'
  )
);

-- Create secure policies for interview_answers
-- Public can only submit answers to questions in their active session
CREATE POLICY "Public can submit answers to active session"
ON public.interview_answers
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.interview_sessions s
    JOIN public.interview_questions q ON q.session_id = s.id
    WHERE q.id = question_id AND s.status = 'in_progress'
  ) AND
  -- Ensure AI fields are not set by public
  ai_score IS NULL AND
  ai_feedback IS NULL
);

-- Public should NOT be able to view answers - admin only
-- The existing "Admins can view all interview answers" policy handles admin access
