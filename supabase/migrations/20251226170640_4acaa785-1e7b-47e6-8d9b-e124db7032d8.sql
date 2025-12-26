-- Create applicants_prescreen table
CREATE TABLE public.applicants_prescreen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  home_office BOOLEAN NOT NULL,
  noise_canceling_headset BOOLEAN NOT NULL,
  laptop_or_pc BOOLEAN NOT NULL,
  good_internet BOOLEAN NOT NULL,
  internet_speed TEXT NOT NULL,
  power_backup BOOLEAN NOT NULL,
  can_work_40_50 BOOLEAN NOT NULL,
  us_timezone_ok BOOLEAN NOT NULL,
  start_availability TEXT NOT NULL,
  has_experience BOOLEAN NOT NULL,
  currently_working BOOLEAN NOT NULL,
  location TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  apply_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.applicants_prescreen ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form submission)
CREATE POLICY "Anyone can submit pre-screening form"
ON public.applicants_prescreen
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view submissions
CREATE POLICY "Admins can view all submissions"
ON public.applicants_prescreen
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update submissions
CREATE POLICY "Admins can update submissions"
ON public.applicants_prescreen
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete submissions
CREATE POLICY "Admins can delete submissions"
ON public.applicants_prescreen
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));