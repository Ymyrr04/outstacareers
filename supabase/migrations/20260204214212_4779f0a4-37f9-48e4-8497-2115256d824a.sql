
-- Make voice-recordings bucket public so audio can be played
UPDATE storage.buckets 
SET public = true 
WHERE id = 'voice-recordings';
