-- Create storage bucket for voice recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-recordings', 'voice-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload voice recordings (for applicants)
CREATE POLICY "Anyone can upload voice recordings"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'voice-recordings');

-- Allow anyone to view voice recordings (public bucket)
CREATE POLICY "Voice recordings are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'voice-recordings');

-- Allow admins to delete voice recordings
CREATE POLICY "Admins can delete voice recordings"
ON storage.objects
FOR DELETE
USING (bucket_id = 'voice-recordings' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() 
  AND role = 'admin'
));

-- Add column for native voice recording URL
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS voice_recording_url TEXT;