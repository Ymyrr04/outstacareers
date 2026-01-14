-- Fix storage policies to include super_admin using is_admin() function

-- Fix CV download policy
DROP POLICY IF EXISTS "Admins can view CVs" ON storage.objects;
CREATE POLICY "Admins can view CVs" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'cv-uploads' AND is_admin(auth.uid()));

-- Fix CV delete policy  
DROP POLICY IF EXISTS "Admins can delete CVs" ON storage.objects;
CREATE POLICY "Admins can delete CVs" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'cv-uploads' AND is_admin(auth.uid()));

-- Fix voice recordings delete policy (also using old pattern)
DROP POLICY IF EXISTS "Admins can delete voice recordings" ON storage.objects;
CREATE POLICY "Admins can delete voice recordings" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'voice-recordings' AND is_admin(auth.uid()));