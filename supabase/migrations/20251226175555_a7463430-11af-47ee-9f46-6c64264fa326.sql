-- SECURITY: Lock down applicants_prescreen to only allow inserts via edge function (service role)
-- Revoke INSERT from anon to prevent direct database inserts bypassing rate limiting
REVOKE INSERT ON public.applicants_prescreen FROM anon;

-- Keep INSERT available for service_role (used by edge function)
-- The existing validation policy still applies as defense-in-depth

-- Update comment to document security measures
COMMENT ON TABLE public.applicants_prescreen IS 'SENSITIVE PII: Contains applicant personal data (names, emails, locations). 
SECURITY MEASURES:
- SELECT: Revoked from anon/authenticated, admin-only via RLS
- INSERT: Revoked from anon, only via edge function (service_role) with rate limiting (3/IP/hour)
- Honeypot validation required
- IP stored as hash only for rate limiting
- Never add public SELECT or INSERT policies to this table.';