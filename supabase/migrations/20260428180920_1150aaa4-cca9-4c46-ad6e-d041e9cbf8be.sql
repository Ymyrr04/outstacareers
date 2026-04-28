
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  user_id uuid,
  context jsonb,
  status text DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_function_name ON public.ai_usage_logs (function_name);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view AI usage logs
CREATE POLICY "Admins can view AI usage logs"
ON public.ai_usage_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Edge functions (service role) bypass RLS, so no insert policy needed for them.
-- Block direct client inserts.
