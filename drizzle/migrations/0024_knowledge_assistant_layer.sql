CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('cv','applicant_note','additional_profile','interview_answer','hiring_comment','calendar_comment')),
  source_id uuid NOT NULL,
  required_tab text NOT NULL,
  entity_type text CHECK (entity_type IS NULL OR entity_type IN ('applicant','hiring_request','calendar_event')),
  entity_id uuid,
  title text,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  chunk_index int NOT NULL DEFAULT 0,
  embedding extensions.vector(768),
  source_hash text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (source_type, source_id, chunk_index)
);
GRANT ALL ON public.knowledge_chunks TO service_role;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE INDEX knowledge_chunks_embedding_hnsw ON public.knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX knowledge_chunks_content_fts ON public.knowledge_chunks USING gin (to_tsvector('english', content));
CREATE INDEX knowledge_chunks_required_tab ON public.knowledge_chunks (required_tab);
CREATE INDEX knowledge_chunks_entity ON public.knowledge_chunks (entity_type, entity_id);
CREATE INDEX knowledge_chunks_source ON public.knowledge_chunks (source_type, source_id);

CREATE TABLE public.knowledge_dirty_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('upsert','delete')),
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  error text
);
GRANT ALL ON public.knowledge_dirty_queue TO service_role;
ALTER TABLE public.knowledge_dirty_queue ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX knowledge_dirty_queue_pending_uniq ON public.knowledge_dirty_queue (source_type, source_id) WHERE processed_at IS NULL;

CREATE TABLE public.rag_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  question text,
  answer text,
  sources jsonb,
  tools_used jsonb,
  prompt_tokens int,
  completion_tokens int,
  rating smallint CHECK (rating IS NULL OR rating IN (1,-1)),
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON public.rag_chat_logs TO service_role;
ALTER TABLE public.rag_chat_logs ENABLE ROW LEVEL SECURITY;