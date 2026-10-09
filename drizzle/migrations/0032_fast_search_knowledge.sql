CREATE OR REPLACE FUNCTION public.search_knowledge(query_embedding extensions.vector, query_text text, allowed_tabs text[], match_count integer DEFAULT 10, entity_filter uuid DEFAULT NULL::uuid, entity_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, source_type text, source_id uuid, entity_type text, entity_id uuid, title text, content text, metadata jsonb, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  WITH vec AS (
    SELECT v.id, row_number() OVER (ORDER BY v.dist) AS rnk
    FROM (
      SELECT c.id, c.embedding OPERATOR(extensions.<=>) query_embedding AS dist
      FROM public.knowledge_chunks c
      WHERE query_embedding IS NOT NULL AND c.embedding IS NOT NULL
        AND c.required_tab = ANY(allowed_tabs)
        AND (entity_filter IS NULL OR c.entity_id = entity_filter)
        AND (entity_ids IS NULL OR c.entity_id = ANY(entity_ids))
      ORDER BY c.embedding OPERATOR(extensions.<=>) query_embedding
      LIMIT 30
    ) v
  ),
  q AS (SELECT websearch_to_tsquery('english', coalesce(query_text, '')) AS tsq),
  kw AS (
    SELECT k.id, row_number() OVER (ORDER BY k.r DESC) AS rnk
    FROM (
      SELECT c.id, ts_rank(to_tsvector('english', c.content), q.tsq) AS r
      FROM public.knowledge_chunks c, q
      WHERE to_tsvector('english', c.content) @@ q.tsq
        AND c.required_tab = ANY(allowed_tabs)
        AND (entity_filter IS NULL OR c.entity_id = entity_filter)
        AND (entity_ids IS NULL OR c.entity_id = ANY(entity_ids))
      ORDER BY r DESC
      LIMIT 30
    ) k
  ),
  fused AS (
    SELECT u.id, sum(1.0 / (60 + u.rnk))::double precision AS score
    FROM (SELECT * FROM vec UNION ALL SELECT * FROM kw) u
    GROUP BY u.id
  )
  SELECT c.id, c.source_type, c.source_id, c.entity_type, c.entity_id,
         c.title, c.content, c.metadata, f.score
  FROM fused f JOIN public.knowledge_chunks c ON c.id = f.id
  ORDER BY f.score DESC
  LIMIT greatest(coalesce(match_count, 10), 0);
$function$;
REVOKE ALL ON FUNCTION public.search_knowledge(extensions.vector, text, text[], integer, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge(extensions.vector, text, text[], integer, uuid, uuid[]) TO service_role;