-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 hotfix — replace partial unique indexes on EIN with full ones.
--
-- The original phase2_funder_graph.sql wrote:
--   CREATE UNIQUE INDEX … ON funders(ein) WHERE ein IS NOT NULL;
-- PostgREST's UPSERT (.upsert({ onConflict: 'ein' })) requires the conflict
-- target to match the unique index *including* its WHERE predicate. supabase-js
-- doesn't add the WHERE clause, so every upsert fails with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- which is exactly what the seed-graph admin run hit.
--
-- The fix: drop the partial WHERE clause. NULL EIN rows (federal agencies)
-- still coexist freely because SQL's default treats NULL != NULL for
-- uniqueness.
--
-- IDEMPOTENT — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS funders_ein_idx;
CREATE UNIQUE INDEX IF NOT EXISTS funders_ein_idx ON funders(ein);

DROP INDEX IF EXISTS recipients_ein_idx;
CREATE UNIQUE INDEX IF NOT EXISTS recipients_ein_idx ON recipients(ein);
