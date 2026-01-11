
-- Make voice-recordings bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'voice-recordings';

-- Drop the old public SELECT policy
DROP POLICY IF EXISTS "Voice recordings are publicly accessible" ON storage.objects;

-- Create admin-only SELECT policy
CREATE POLICY "Admins can view voice recordings"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'voice-recordings' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Keep the INSERT policy for interview flow (uploading during interview)
-- The existing "Anyone can upload voice recordings" policy is needed

-- Create policy for interview participants to view their recordings during the session
CREATE POLICY "Interview participants can view own recordings"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'voice-recordings'
  AND (storage.foldername(name))[1] = 'interview'
);
