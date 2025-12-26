-- Add honeypot field for spam detection
-- SECURITY WARNING: This table contains sensitive applicant PII (full_name, email, location)
-- Never add public SELECT policies. Only service role and authenticated admins should read data.
COMMENT ON TABLE public.applicants_prescreen IS 'Contains sensitive applicant PII. SELECT restricted to service role and admins only. Never expose to anon/public users.';

-- Add honeypot column for spam detection (bots will fill this hidden field)
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS honeypot_field text DEFAULT NULL;

-- Add submitted_ip_hash for rate limiting tracking
ALTER TABLE public.applicants_prescreen 
ADD COLUMN IF NOT EXISTS ip_hash text DEFAULT NULL;

-- Drop the existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can submit pre-screening form" ON public.applicants_prescreen;

-- Create a more restrictive INSERT policy that still allows anonymous submissions
-- but requires essential fields to be non-null (enforced at DB level)
CREATE POLICY "Validated anonymous submissions only" 
ON public.applicants_prescreen 
FOR INSERT 
TO anon, authenticated
WITH CHECK (
  -- Require essential fields
  full_name IS NOT NULL AND 
  full_name <> '' AND
  email IS NOT NULL AND 
  email <> '' AND
  -- Honeypot must be empty (bots fill hidden fields)
  (honeypot_field IS NULL OR honeypot_field = '')
);

-- Ensure no SELECT policy exists for anon users (double-check security)
-- The existing policies already restrict SELECT to admins only via has_role check