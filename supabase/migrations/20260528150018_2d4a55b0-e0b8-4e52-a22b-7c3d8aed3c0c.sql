ALTER TABLE public.client_portal_users 
  ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.client_portal_users 
  ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_users_username_key 
  ON public.client_portal_users (lower(username)) WHERE username IS NOT NULL;