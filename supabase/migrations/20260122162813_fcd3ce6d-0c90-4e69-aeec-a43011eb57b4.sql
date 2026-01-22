-- Create table to track export jobs
CREATE TABLE public.export_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  export_type TEXT NOT NULL DEFAULT 'applicants_with_cvs',
  status TEXT NOT NULL DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  file_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own export jobs
CREATE POLICY "Users can view own export jobs"
ON public.export_jobs
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can insert export jobs
CREATE POLICY "Admins can insert export jobs"
ON public.export_jobs
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Create exports storage bucket for completed export files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('exports', 'exports', false);

-- Admins can view exports
CREATE POLICY "Admins can view exports"
ON storage.objects
FOR SELECT
USING (bucket_id = 'exports' AND is_admin(auth.uid()));

-- Service role can insert exports (for edge function)
CREATE POLICY "Service can insert exports"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'exports');

-- Admins can delete old exports
CREATE POLICY "Admins can delete exports"
ON storage.objects
FOR DELETE
USING (bucket_id = 'exports' AND is_admin(auth.uid()));