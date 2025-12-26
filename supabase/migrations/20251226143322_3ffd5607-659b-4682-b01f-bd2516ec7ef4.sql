-- Remove the public insert policy and restrict to service role only
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

-- Revoke insert permission from anon and authenticated roles
REVOKE INSERT ON public.analytics_events FROM anon;
REVOKE INSERT ON public.analytics_events FROM authenticated;

-- The service role (used by edge functions) bypasses RLS, so no policy needed for inserts
-- Admins can still view analytics through the existing SELECT policy