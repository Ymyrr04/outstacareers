ALTER TABLE public.hiring_request_comments
  ADD COLUMN linked_applicant_id uuid REFERENCES public.applicants_prescreen(id) ON DELETE SET NULL;

CREATE INDEX hiring_request_comments_linked_applicant_id_idx ON public.hiring_request_comments (linked_applicant_id);