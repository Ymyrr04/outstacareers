-- Create analytics_events table for tracking all events
CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'page_view', 'job_view', 'apply_click'
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  page_path TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT, -- Hashed IP for privacy
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events (anonymous tracking)
CREATE POLICY "Anyone can insert analytics events"
ON public.analytics_events
FOR INSERT
WITH CHECK (true);

-- Only admins can view analytics
CREATE POLICY "Admins can view analytics"
ON public.analytics_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_analytics_events_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_events_job_id ON public.analytics_events(job_id);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at);