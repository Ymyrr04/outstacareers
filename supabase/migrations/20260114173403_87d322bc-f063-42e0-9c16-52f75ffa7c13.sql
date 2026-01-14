-- Fix interview_sessions policies to include super_admin
DROP POLICY IF EXISTS "Admins can view all interview sessions" ON public.interview_sessions;
DROP POLICY IF EXISTS "Admins can update interview sessions" ON public.interview_sessions;

CREATE POLICY "Admins can view all interview sessions" 
ON public.interview_sessions 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update interview sessions" 
ON public.interview_sessions 
FOR UPDATE 
USING (is_admin(auth.uid()));

-- Fix interview_questions policies to include super_admin
DROP POLICY IF EXISTS "Admins can view all interview questions" ON public.interview_questions;

CREATE POLICY "Admins can view all interview questions" 
ON public.interview_questions 
FOR SELECT 
USING (is_admin(auth.uid()));

-- Fix interview_answers policies to include super_admin
DROP POLICY IF EXISTS "Admins can view all interview answers" ON public.interview_answers;

CREATE POLICY "Admins can view all interview answers" 
ON public.interview_answers 
FOR SELECT 
USING (is_admin(auth.uid()));