ALTER TABLE public.contractor_legal_doc_requests
  ADD COLUMN IF NOT EXISTS request_email_message_id text;