-- The analytics_events table should only allow inserts from the service role (used by the edge function)
-- No direct INSERT access should be granted to anon or authenticated users

-- First, revoke any existing INSERT permissions
REVOKE INSERT ON public.analytics_events FROM anon;
REVOKE INSERT ON public.analytics_events FROM authenticated;

-- Add a comment explaining the security model
COMMENT ON TABLE public.analytics_events IS 'Analytics events table. Inserts are only allowed via the track-analytics edge function using the service role key. No direct client-side inserts are permitted.';