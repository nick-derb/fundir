-- Tier 1B: Corpus vector search
-- Run this in the Supabase SQL Editor.
--
-- This sets up the infrastructure so searching for "what should I apply
-- for" pulls from the entire stored grant corpus by cosine similarity
-- instead of being bounded to the 32 grants the last discovery run
-- happened to pull from grants.gov.
--
-- IDEMPOTENT: safe to re-run.

-- 1. pgvector extension (no-op if already enabled).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. If the embedding column is currently text (the discovery code inserts
--    a string representation `[0.1,0.2,...]`), convert it to vector(1536).
--    A no-op if it is already vector. Wraps in EXCEPTION so a partial state
--    does not abort the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'grant_opportunities'
      AND column_name = 'embedding'
      AND data_type   = 'text'
  ) THEN
    BEGIN
      ALTER TABLE grant_opportunities
        ALTER COLUMN embedding TYPE vector(1536)
        USING embedding::vector(1536);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'embedding column conversion skipped: %', SQLERRM;
    END;
  END IF;
END $$;

-- 3. HNSW index on cosine distance. m=16, ef_construction=64 are pgvector
--    defaults — tune if recall is too low or build time too high.
CREATE INDEX IF NOT EXISTS grant_opportunities_embedding_hnsw
  ON grant_opportunities
  USING hnsw (embedding vector_cosine_ops);

-- 4. nearest_grants: top-K nearest grants by cosine similarity across the
--    full stored corpus, with an optional close-date floor so closed-out
--    grants do not dominate. Returns similarity normalized to [0,1] where
--    1 == identical.
CREATE OR REPLACE FUNCTION nearest_grants(
  query_embedding vector(1536),
  k               int   DEFAULT 50,
  min_close_date  date  DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  title                text,
  agency_name          text,
  agency_code          text,
  aln_codes            text[],
  close_date           date,
  extracted_fields     jsonb,
  similarity           double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    g.id,
    g.title,
    g.agency_name,
    g.agency_code,
    g.aln_codes,
    g.close_date,
    g.extracted_fields,
    1 - (g.embedding <=> query_embedding) AS similarity
  FROM grant_opportunities g
  WHERE g.embedding IS NOT NULL
    AND (min_close_date IS NULL OR g.close_date IS NULL OR g.close_date >= min_close_date)
  ORDER BY g.embedding <=> query_embedding
  LIMIT k;
$$;

-- 5. nearest_grants_for_org: same retrieval, plus a LEFT JOIN onto
--    match_results scoped to the calling org. Returns the existing
--    composite_score and pipeline_stage when the org has previously seen
--    this grant, so the UI can render "Score 78 - in pipeline as Drafting"
--    alongside fresh candidates the org has never touched.
CREATE OR REPLACE FUNCTION nearest_grants_for_org(
  query_embedding vector(1536),
  p_org_id        uuid,
  k               int  DEFAULT 50,
  min_close_date  date DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  title                text,
  agency_name          text,
  agency_code          text,
  aln_codes            text[],
  close_date           date,
  extracted_fields     jsonb,
  similarity           double precision,
  composite_score      double precision,
  pipeline_stage       text,
  match_id             uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    g.id,
    g.title,
    g.agency_name,
    g.agency_code,
    g.aln_codes,
    g.close_date,
    g.extracted_fields,
    1 - (g.embedding <=> query_embedding) AS similarity,
    m.composite_score,
    m.pipeline_stage,
    m.id AS match_id
  FROM grant_opportunities g
  LEFT JOIN match_results m
    ON m.grant_id = g.id
   AND m.org_id   = p_org_id
  WHERE g.embedding IS NOT NULL
    AND (min_close_date IS NULL OR g.close_date IS NULL OR g.close_date >= min_close_date)
  ORDER BY g.embedding <=> query_embedding
  LIMIT k;
$$;

-- 6. Permissions: allow authenticated callers to RPC into the search
--    functions (RLS still applies on the underlying tables).
GRANT EXECUTE ON FUNCTION nearest_grants(vector, int, date)                      TO authenticated;
GRANT EXECUTE ON FUNCTION nearest_grants_for_org(vector, uuid, int, date)        TO authenticated;
