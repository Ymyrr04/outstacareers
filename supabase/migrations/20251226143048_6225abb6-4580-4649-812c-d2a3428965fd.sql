-- Explicitly revoke all permissions from anon role on user_roles table
REVOKE ALL ON public.user_roles FROM anon;

-- Ensure only authenticated users have access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;