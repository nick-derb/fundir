-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2A — 990 funder → recipient graph schema
--
-- The core moat. Populated by Phase 2B's ProPublica ingestion adapter and
-- Phase 2E's static-seed bridge. Tables are shared reference (authenticated
-- read; service-role write only) — they describe how funders give to orgs
-- across the whole sector, NOT tenant-specific data.
--
-- 990 data lags ~12 months and has occasional scan errors. The schema
-- captures fiscal_year + data_freshness so the matcher can reason about
-- staleness. `confidence` < 1 indicates a fuzzy-matched recipient (name
-- match without EIN) so the affinity factor can down-weight thin signal.
--
-- IDEMPOTENT — safe to re-run. Run in Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. funders ──────────────────────────────────────────────────────────────
-- A funder is an entity that gives money: federal agency, private
-- foundation, community foundation, corporate giving, bank with CRA
-- assessment areas. EIN is nullable because federal agencies don't carry
-- one; for any entity that does, EIN is unique.
CREATE TABLE IF NOT EXISTS funders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ein          text,
  name         text NOT NULL,
  funder_type  text NOT NULL CHECK (funder_type IN (
                 'federal_agency','private_foundation','community_foundation',
                 'corporate','bank','state_local')),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS funders_ein_idx
  ON funders(ein) WHERE ein IS NOT NULL;
CREATE INDEX IF NOT EXISTS funders_type_idx ON funders(funder_type);
-- For fuzzy-by-name lookups in the identity-resolution path (Phase 2C).
CREATE INDEX IF NOT EXISTS funders_name_trgm_idx ON funders USING gin (name gin_trgm_ops);

-- The trgm index above needs pg_trgm; enable it idempotently.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE funders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funders: read all" ON funders;
CREATE POLICY "funders: read all" ON funders
  FOR SELECT TO authenticated USING (true);

-- ── 2. recipients ──────────────────────────────────────────────────────────
-- A recipient is an organization that received money. EIN is nullable
-- because many 990-PF grant-schedule entries are name-only — that's the
-- root cause of the identity-resolution work in Phase 2C. `organization_id`
-- links to a Fundir tenant when one of OUR orgs IS this recipient; null
-- otherwise (the common case — most recipients in the graph are external).
CREATE TABLE IF NOT EXISTS recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ein             text,
  name            text NOT NULL,
  ntee_code       text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- EIN unique when present (Decision 3: EIN-first identity).
CREATE UNIQUE INDEX IF NOT EXISTS recipients_ein_idx
  ON recipients(ein) WHERE ein IS NOT NULL;
CREATE INDEX IF NOT EXISTS recipients_org_id_idx
  ON recipients(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recipients_ntee_idx ON recipients(ntee_code);
CREATE INDEX IF NOT EXISTS recipients_name_trgm_idx
  ON recipients USING gin (name gin_trgm_ops);

ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recipients: read all" ON recipients;
CREATE POLICY "recipients: read all" ON recipients
  FOR SELECT TO authenticated USING (true);

-- ── 3. grants_made ─────────────────────────────────────────────────────────
-- The edges of the funder→recipient graph. One row per (funder, recipient,
-- fiscal_year, source) — a funder can give to the same recipient in
-- multiple years, and the same edge can be reported by multiple sources
-- (a 990-PF and a foundation-website disclosure), each carrying its own
-- confidence. The Phase 3 peer-mining query rolls these up by funder.
CREATE TABLE IF NOT EXISTS grants_made (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_id       uuid NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  recipient_id    uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  amount          numeric NOT NULL,
  fiscal_year     int NOT NULL,
  purpose         text,
  source          text NOT NULL,
  data_freshness  date NOT NULL,
  confidence      numeric NOT NULL DEFAULT 1.0 CHECK (confidence > 0 AND confidence <= 1.0),
  raw             jsonb,
  ingested_at     timestamptz NOT NULL DEFAULT now()
);

-- Edge-uniqueness key. UPSERTs from the ingestion runner write
-- (funder, recipient, year, source) once and update on conflict. Keeping
-- `source` in the key lets us hold two independent attestations of the
-- same edge from different data providers without merging them.
CREATE UNIQUE INDEX IF NOT EXISTS grants_made_edge_idx
  ON grants_made(funder_id, recipient_id, fiscal_year, source);

CREATE INDEX IF NOT EXISTS grants_made_funder_year_idx
  ON grants_made(funder_id, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS grants_made_recipient_year_idx
  ON grants_made(recipient_id, fiscal_year DESC);
-- Peer-mining hot-path: "of these N recipient_ids, which funder gave?"
CREATE INDEX IF NOT EXISTS grants_made_recipient_funder_idx
  ON grants_made(recipient_id, funder_id);

ALTER TABLE grants_made ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grants_made: read all" ON grants_made;
CREATE POLICY "grants_made: read all" ON grants_made
  FOR SELECT TO authenticated USING (true);

-- ── 4. ingest_state ────────────────────────────────────────────────────────
-- Resumable per-adapter cursor table. The Phase 2D runner reads/writes one
-- row per (adapter_key, batch_key) pair so a crash mid-batch doesn't
-- re-process everything. batch_key is adapter-defined: for ProPublica's
-- by-state ingestion it's the state code; for keyword-driven sources it's
-- the keyword. cursor is opaque (next page token, last-seen-id, etc).
CREATE TABLE IF NOT EXISTS ingest_state (
  adapter_key   text NOT NULL,
  batch_key     text NOT NULL,
  cursor        text,
  last_run_at   timestamptz NOT NULL DEFAULT now(),
  records_seen  int  NOT NULL DEFAULT 0,
  records_kept  int  NOT NULL DEFAULT 0,
  errors        int  NOT NULL DEFAULT 0,
  last_error    text,
  PRIMARY KEY (adapter_key, batch_key)
);

ALTER TABLE ingest_state ENABLE ROW LEVEL SECURITY;
-- ingest_state is operational metadata, not user-facing. No read policy →
-- only the service-role client (the cron) can touch it.

-- ════════════════════════════════════════════════════════════════════════════
-- POST-RUN VERIFICATION
--   SELECT count(*) FROM funders;        -- 0 until Phase 2B runs
--   SELECT count(*) FROM recipients;     -- 0 until Phase 2B runs
--   SELECT count(*) FROM grants_made;    -- 0 until Phase 2B runs
--   SELECT * FROM ingest_state;          -- 0 until first ingest tick
-- ════════════════════════════════════════════════════════════════════════════
