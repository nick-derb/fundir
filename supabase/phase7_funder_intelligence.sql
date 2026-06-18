-- ════════════════════════════════════════════════════════════════════════════
-- Phase 7 — CRA Intelligence Panel + 990 Reverse-Search Funder Engine
--
-- Two workstreams' schema additions in one idempotent migration. Some
-- pieces (1) are used immediately by Workstream A (CRA panel). The rest
-- (2–5) are scaffolding for Workstream B (990 reverse-search) and stay
-- empty until B1+ phases populate them.
--
--   1. org_funder_relationships — Workstream A: members assert which
--      funders they already work with (vs. prospect/declined/dormant).
--   2. identity_adjudications   — Workstream B3: audit trail for the
--      Claude-mediated entity-resolution tier.
--   3. funder_embeddings        — Workstream B7: pgvector profile for
--      lookalike scoring. CURRENTLY DEFERRED. Schema in place so we
--      don't need another migration if/when B7 is unlocked.
--   4. organizations.profile_embedding — same deferral; one column.
--   5. funder_intel             — Workstream B4–B6: per-(org, funder)
--      cache for prospect scores, lookalike scores, and Claude-generated
--      briefs. Members can flip tracked_status; everything else is
--      service-role-only writes.
--
-- IDEMPOTENT — safe to re-run. Run via Supabase SQL editor with the
-- pgvector extension already enabled (Phase 6 drafts/sources work
-- enabled it; verify before running).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Workstream A — org_funder_relationships ─────────────────────────────
-- One row per (org, funder) where the org's grant team has expressed a
-- relationship state. Seeded for CYC's 4 known existing bank
-- relationships in lib/cra/seed-relationships.ts. Members can edit.
CREATE TABLE IF NOT EXISTS org_funder_relationships (
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  funder_id        uuid NOT NULL REFERENCES funders(id)       ON DELETE CASCADE,
  status           text NOT NULL CHECK (status IN ('existing','prospect','declined','dormant')),
  /** Where did this assertion come from? 'self_reported' (org told us),
   *  'derived_990' (we inferred from a grants_made row), 'manual' (admin). */
  source           text NOT NULL CHECK (source IN ('self_reported','derived_990','manual')),
  notes            text,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, funder_id)
);

CREATE INDEX IF NOT EXISTS ofr_org_idx    ON org_funder_relationships(organization_id);
CREATE INDEX IF NOT EXISTS ofr_status_idx ON org_funder_relationships(organization_id, status);

ALTER TABLE org_funder_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ofr: members read own org" ON org_funder_relationships;
CREATE POLICY "ofr: members read own org" ON org_funder_relationships
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "ofr: members write own org" ON org_funder_relationships;
CREATE POLICY "ofr: members write own org" ON org_funder_relationships
  FOR ALL TO authenticated
  USING      (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));


-- ── 2. Workstream B3 — identity_adjudications ──────────────────────────────
-- Every Claude-adjudicated entity-resolution decision lands here so we
-- can audit, replay, and debug wrong matches. Operational metadata; no
-- RLS read policy → service-role-only.
CREATE TABLE IF NOT EXISTS identity_adjudications (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name                 text NOT NULL,
  raw_ein                  text,
  raw_state                text,
  candidate_recipient_ids  uuid[] NOT NULL,
  chosen_recipient_id      uuid REFERENCES recipients(id),
  tier                     text NOT NULL CHECK (tier IN ('ein_exact','deterministic_fuzzy','claude','no_match')),
  confidence               numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  claude_reasoning         text,
  model_version            text,
  /** Round-trip cost in micro-cents so we can sum and audit per-batch
   *  Claude spend without doing token-math on the fly. */
  cost_micro_cents         int,
  decided_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS identity_adjudications_chosen_idx
  ON identity_adjudications(chosen_recipient_id);
CREATE INDEX IF NOT EXISTS identity_adjudications_tier_idx
  ON identity_adjudications(tier, decided_at DESC);

ALTER TABLE identity_adjudications ENABLE ROW LEVEL SECURITY;
-- No read policy — operational metadata, service-role-only.


-- ── 3. Workstream B7 — funder_embeddings (DEFERRED; schema only) ───────────
-- pgvector profile for lookalike scoring. Lookalike pass is not in the
-- demo scope per the cost cap; this table stays empty until the
-- multi-tenant phase unlocks it.
CREATE TABLE IF NOT EXISTS funder_embeddings (
  funder_id    uuid PRIMARY KEY REFERENCES funders(id) ON DELETE CASCADE,
  embedding    vector(1536) NOT NULL,
  profile_blob jsonb NOT NULL,
  model        text NOT NULL DEFAULT 'text-embedding-3-large',
  computed_at  timestamptz NOT NULL DEFAULT now()
);

-- ivfflat with the standard list count for ~50K row scale. Won't be
-- needed until the table is populated; created idempotently anyway.
CREATE INDEX IF NOT EXISTS funder_embeddings_ivfflat_idx
  ON funder_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE funder_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funder_embeddings: read all" ON funder_embeddings;
CREATE POLICY "funder_embeddings: read all" ON funder_embeddings
  FOR SELECT TO authenticated USING (true);


-- ── 4. organizations.profile_embedding (DEFERRED column) ───────────────────
-- One vector column on the existing organizations table. Unused until B7.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS profile_embedding vector(1536);


-- ── 5. Workstream B4–B6 — funder_intel ─────────────────────────────────────
-- Per-(org, funder) cache for prospect scores, lookalike scores, and
-- the Claude-generated brief. Briefs are expensive; cache aggressively.
-- Members can flip tracked_status (new/pursuing/passed/contacted/meeting);
-- score and brief writes are service-role-only.
CREATE TABLE IF NOT EXISTS funder_intel (
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  funder_id            uuid NOT NULL REFERENCES funders(id)       ON DELETE CASCADE,
  prospect_score       numeric NOT NULL CHECK (prospect_score >= 0 AND prospect_score <= 1),
  /** Optional. Only set after B7 lookalike pass runs. */
  lookalike_score      numeric CHECK (lookalike_score IS NULL OR (lookalike_score >= 0 AND lookalike_score <= 1)),
  peer_overlap_count   int  NOT NULL DEFAULT 0,
  /** Cached Claude brief; jsonb schema mirrors lib/drafts/generator.ts:
   *  { sections: { background, who_they_fund_like_you, typical_grant_size,
   *    cadence, entry_point, red_flags, suggested_ask_range }, citations: [...] }. */
  brief                jsonb,
  brief_generated_at   timestamptz,
  /** Hash of the cited grants_made.id list so we know when to regenerate
   *  the brief (cache-by-edge-hash, per BUDGET.md lever 5). */
  brief_edge_hash      text,
  tracked_status       text CHECK (tracked_status IN ('new','pursuing','passed','contacted','meeting')),
  refreshed_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, funder_id)
);

CREATE INDEX IF NOT EXISTS fi_org_score_idx
  ON funder_intel(organization_id, prospect_score DESC);
CREATE INDEX IF NOT EXISTS fi_org_tracked_idx
  ON funder_intel(organization_id, tracked_status)
  WHERE tracked_status IS NOT NULL;

ALTER TABLE funder_intel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fi: members read own org" ON funder_intel;
CREATE POLICY "fi: members read own org" ON funder_intel
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "fi: members update tracked_status own org" ON funder_intel;
CREATE POLICY "fi: members update tracked_status own org" ON funder_intel
  FOR UPDATE TO authenticated
  USING      (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));


-- ════════════════════════════════════════════════════════════════════════════
-- POST-RUN VERIFICATION
--   SELECT count(*) FROM org_funder_relationships;   -- 0 (seed-relationships fills)
--   SELECT count(*) FROM identity_adjudications;     -- 0 until B3 runs
--   SELECT count(*) FROM funder_embeddings;          -- 0 (B7 deferred)
--   SELECT count(*) FROM funder_intel;               -- 0 until B4 runs
-- ════════════════════════════════════════════════════════════════════════════
