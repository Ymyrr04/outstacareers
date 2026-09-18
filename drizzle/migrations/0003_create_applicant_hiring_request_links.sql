CREATE TABLE public.applicant_hiring_request_links (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants_prescreen(id) on delete cascade,
  hiring_request_id uuid not null references public.client_hiring_requests(id) on delete cascade,
  linked_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (applicant_id, hiring_request_id)
);

GRANT SELECT, INSERT, DELETE ON public.applicant_hiring_request_links TO authenticated;
GRANT ALL ON public.applicant_hiring_request_links TO service_role;

ALTER TABLE public.applicant_hiring_request_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select links"
  ON public.applicant_hiring_request_links
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert links"
  ON public.applicant_hiring_request_links
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete links"
  ON public.applicant_hiring_request_links
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX idx_applicant_hiring_request_links_hiring_request_id
  ON public.applicant_hiring_request_links (hiring_request_id);

CREATE INDEX idx_applicant_hiring_request_links_applicant_id
  ON public.applicant_hiring_request_links (applicant_id);
