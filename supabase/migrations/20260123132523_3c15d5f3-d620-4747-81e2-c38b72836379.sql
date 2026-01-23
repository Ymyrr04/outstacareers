-- Create deleted_applicants archive table
CREATE TABLE public.deleted_applicants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  whatsapp text,
  location text,
  job_title text,
  job_id uuid,
  status text,
  cv_file_url text,
  cv_text text,
  voice_recording_url text,
  vocaroo_link text,
  notes text,
  candidate_profile text,
  total_score integer,
  role_experience_score integer,
  skills_tools_score integer,
  availability_setup_score integer,
  bonus_red_flag_score integer,
  ranking_status text,
  ai_summary text,
  ai_assessment_details jsonb,
  extracted_skills text[] DEFAULT '{}'::text[],
  extracted_tools text[] DEFAULT '{}'::text[],
  years_of_experience integer,
  is_starred boolean DEFAULT false,
  home_office boolean,
  noise_canceling_headset boolean,
  laptop_or_pc boolean,
  good_internet boolean,
  power_backup boolean,
  can_work_40_50 boolean,
  us_timezone_ok boolean,
  has_experience boolean,
  currently_working boolean,
  internet_speed text,
  start_availability text,
  device_type text,
  apply_url text,
  job_source text,
  original_job_id uuid,
  original_job_title text,
  reprofiled_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  -- Deletion metadata
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.deleted_applicants ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view deleted applicants"
ON public.deleted_applicants FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert deleted applicants"
ON public.deleted_applicants FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can restore (delete from trash)"
ON public.deleted_applicants FOR DELETE
USING (is_admin(auth.uid()));

-- Index for quick lookups
CREATE INDEX idx_deleted_applicants_deleted_at ON public.deleted_applicants(deleted_at DESC);
CREATE INDEX idx_deleted_applicants_email ON public.deleted_applicants(email);
CREATE INDEX idx_deleted_applicants_full_name ON public.deleted_applicants(full_name);