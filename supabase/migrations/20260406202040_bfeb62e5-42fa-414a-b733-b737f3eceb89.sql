ALTER TABLE public.contractor_pipeline_stages
  ADD COLUMN contractor_email_subject text,
  ADD COLUMN contractor_email_body text;