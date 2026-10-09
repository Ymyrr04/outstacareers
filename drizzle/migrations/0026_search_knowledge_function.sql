CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding extensions.vector(768),
  query_text text,
  allowed_tabs text[],
  match_count int DEFAULT 10,
  entity_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, source_type text, source_id uuid, entity_type text, entity_id uuid,
  title text, content text, metadata jsonb, score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH base AS (
    SELECT c.* FROM public.knowledge_chunks c
    WHERE c.required_tab = ANY(allowed_tabs)
      AND (entity_filter IS NULL OR c.entity_id = entity_filter)
  ),
  vec AS (
    SELECT b.id, row_number() OVER (ORDER BY b.embedding OPERATOR(extensions.<=>) query_embedding) AS rnk
    FROM base b
    WHERE query_embedding IS NOT NULL AND b.embedding IS NOT NULL
    ORDER BY b.embedding OPERATOR(extensions.<=>) query_embedding
    LIMIT 30
  ),
  q AS (
    SELECT websearch_to_tsquery('english', coalesce(query_text, '')) AS tsq
  ),
  kw AS (
    SELECT b.id, row_number() OVER (ORDER BY ts_rank(to_tsvector('english', b.content), q.tsq) DESC) AS rnk
    FROM base b, q
    WHERE to_tsvector('english', b.content) @@ q.tsq
    ORDER BY ts_rank(to_tsvector('english', b.content), q.tsq) DESC
    LIMIT 30
  ),
  fused AS (
    SELECT u.id, sum(1.0 / (60 + u.rnk))::double precision AS score
    FROM (SELECT * FROM vec UNION ALL SELECT * FROM kw) u
    GROUP BY u.id
  )
  SELECT c.id, c.source_type, c.source_id, c.entity_type, c.entity_id,
         c.title, c.content, c.metadata, f.score
  FROM fused f
  JOIN public.knowledge_chunks c ON c.id = f.id
  ORDER BY f.score DESC
  LIMIT greatest(coalesce(match_count, 10), 0);
$$;

REVOKE ALL ON FUNCTION public.search_knowledge(extensions.vector, text, text[], int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge(extensions.vector, text, text[], int, uuid) TO service_role;