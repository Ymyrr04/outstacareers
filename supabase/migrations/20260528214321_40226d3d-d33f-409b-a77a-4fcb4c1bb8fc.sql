
ALTER TABLE public.client_portal_users
  ADD COLUMN IF NOT EXISTS primary_email text,
  ADD COLUMN IF NOT EXISTS secondary_email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_first_login boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT true;

-- Existing accounts should NOT be forced through setup
UPDATE public.client_portal_users
SET is_first_login = false,
    password_reset_required = COALESCE(must_change_password, false)
WHERE created_at < now();

CREATE INDEX IF NOT EXISTS idx_client_portal_users_primary_email
  ON public.client_portal_users (lower(primary_email))
  WHERE primary_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_portal_users_secondary_email
  ON public.client_portal_users (lower(secondary_email))
  WHERE secondary_email IS NOT NULL;
