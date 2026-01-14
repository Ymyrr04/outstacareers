-- Fix all RLS policies to include super_admin using is_admin() function

-- ========== user_roles table ==========
DROP POLICY IF EXISTS "Admins can assign roles" ON public.user_roles;
CREATE POLICY "Admins can assign roles" 
ON public.user_roles FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" 
ON public.user_roles FOR DELETE 
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" 
ON public.user_roles FOR UPDATE 
USING (is_admin(auth.uid()));

-- ========== job_interview_questions table (remove duplicates, keep is_admin versions) ==========
DROP POLICY IF EXISTS "Admins can delete job questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can insert job questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can update job questions" ON public.job_interview_questions;
DROP POLICY IF EXISTS "Admins can view job questions" ON public.job_interview_questions;

-- ========== applicants_prescreen table (remove duplicates, keep is_admin versions) ==========
DROP POLICY IF EXISTS "Admins can delete submissions" ON public.applicants_prescreen;
DROP POLICY IF EXISTS "Admins can update submissions" ON public.applicants_prescreen;
DROP POLICY IF EXISTS "Only admins can view submissions" ON public.applicants_prescreen;

-- ========== availability_responses table ==========
DROP POLICY IF EXISTS "Admins can delete availability responses" ON public.availability_responses;
CREATE POLICY "Admins can delete availability responses" 
ON public.availability_responses FOR DELETE 
USING (is_admin(auth.uid()));