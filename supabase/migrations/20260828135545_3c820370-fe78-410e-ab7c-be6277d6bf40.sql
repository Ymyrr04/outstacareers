CREATE TABLE public.cached_emails (
  id text NOT NULL,
  admin_email text NOT NULL,
  thread_id text,
  subject text,
  sender_name text,
  sender_email text,
  recipient_email text,
  body_text text,
  body_html text,
  snippet text,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  label_ids text[],
  internal_date timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_email, id)
);

CREATE INDEX idx_cached_emails_admin_date ON public.cached_emails (admin_email, internal_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cached_emails TO authenticated;
GRANT ALL ON public.cached_emails TO service_role;

ALTER TABLE public.cached_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage their own cached emails"
ON public.cached_emails
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()) AND lower(admin_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
WITH CHECK (public.is_admin(auth.uid()) AND lower(admin_email) = lower(coalesce(auth.jwt() ->> 'email', '')));