-- Add new columns to applicants_prescreen for CV scoring and Vocaroo
ALTER TABLE public.applicants_prescreen
ADD COLUMN cv_file_url text,
ADD COLUMN cv_text text,
ADD COLUMN role_experience_score integer,
ADD COLUMN skills_tools_score integer,
ADD COLUMN availability_setup_score integer,
ADD COLUMN bonus_red_flag_score integer,
ADD COLUMN total_score integer,
ADD COLUMN ranking_status text,
ADD COLUMN ai_summary text,
ADD COLUMN vocaroo_link text;

-- Create storage bucket for CV uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('cv-uploads', 'cv-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload CVs (they're private, only admins can view)
CREATE POLICY "Anyone can upload CVs"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'cv-uploads');

-- Only admins can view/download CVs
CREATE POLICY "Admins can view CVs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'cv-uploads' AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete CVs
CREATE POLICY "Admins can delete CVs"
ON storage.objects
FOR DELETE
USING (bucket_id = 'cv-uploads' AND has_role(auth.uid(), 'admin'::app_role));