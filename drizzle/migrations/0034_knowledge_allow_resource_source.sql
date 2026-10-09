-- Allow RM resource library entries in the knowledge index.
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT knowledge_chunks_source_type_check;
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_source_type_check
  CHECK (source_type = ANY (ARRAY['cv','applicant_note','additional_profile','interview_answer','hiring_comment','calendar_comment','resource']));

ALTER TABLE public.knowledge_chunks DROP CONSTRAINT knowledge_chunks_entity_type_check;
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_entity_type_check
  CHECK (entity_type IS NULL OR entity_type = ANY (ARRAY['applicant','hiring_request','calendar_event','resource']));