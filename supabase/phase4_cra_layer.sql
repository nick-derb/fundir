-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4A — CRA layer schema
--
-- Two tables that together let the matcher surface a class of funders
-- nobody else exposes: banks that are LEGALLY OBLIGATED (Community
-- Reinvestment Act) to invest in census tracts where the org operates.
--
-- census_tracts is shared reference (authenticated read; service-role
-- writes). One row per US census tract we know about. Populated lazily
-- by the geocoder + seed bridge — we don't ingest all 75K national
-- tracts; we ingest tracts as we encounter them via address geocoding
-- and bank AA seeding.
--
-- bank_assessment_areas is also shared reference. One row per
-- (bank funder, tract) pair the bank's CRA assessment area covers.
-- Sourced from FFIEC's annual AA files; for the demo we seed Cook
-- County's major banks → CYC's tract coverage by hand and let the
-- FFIEC-flat-file ingestion fill the rest later.
--
-- The match-time use:
--   1. Org's address → census_tracts.lmi_status: boosts eligibility
--      when the grant requires LMI service.
--   2. Org's tract → bank_assessment_areas (JOIN funder): surfaces
--      banks legally on the hook for this org's service area as a
--      funding stream the directories never show.
--
-- IDEMPOTENT — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. census_tracts ────────────────────────────────────────────────────────
-- tract_id = 11-digit FIPS (2 state + 3 county + 6 tract).
-- lmi_status is FFIEC's bucketing of median family income against the
-- MSA median: low (<50%), moderate (50-79%), middle (80-119%),
-- upper (120%+). 'unknown' = not yet looked up; the matcher treats it
-- as neutral (no boost, no penalty).
CREATE TABLE IF NOT EXISTS census_tracts (
  tract_id     text PRIMARY KEY,
  region_id    uuid REFERENCES regions(id) ON DELETE SET NULL,
  lmi_status   text NOT NULL DEFAULT 'unknown' CHECK (lmi_status IN ('low','moderate','middle','upper','unknown')),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Convenience denormalizations for fast filtering. The tract_id encodes
-- state+county+tract but pulling them out as columns lets us index and
-- group without string-slicing every query.
CREATE INDEX IF NOT EXISTS census_tracts_region_idx ON census_tracts(region_id);
CREATE INDEX IF NOT EXISTS census_tracts_lmi_idx    ON census_tracts(lmi_status);
-- Substring index for county-prefix lookups (matcher checks "is org's
-- tract anywhere in this bank's covered tracts" via a county-prefix join).
CREATE INDEX IF NOT EXISTS census_tracts_county_prefix_idx
  ON census_tracts(substr(tract_id, 1, 5));

ALTER TABLE census_tracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "census_tracts: read all" ON census_tracts;
CREATE POLICY "census_tracts: read all" ON census_tracts
  FOR SELECT TO authenticated USING (true);

-- ── 2. bank_assessment_areas ───────────────────────────────────────────────
-- One row per (bank funder, tract) pair. Federal CRA exam regs require
-- banks to disclose their AAs annually; the FFIEC's CRA Assessment Area
-- file is the canonical source. `source` carries provenance so we can
-- tell hand-seeded rows from FFIEC-imported rows later.
CREATE TABLE IF NOT EXISTS bank_assessment_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_id   uuid NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  tract_id    text NOT NULL REFERENCES census_tracts(tract_id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('ffiec_aa','cra_pe_pdf','manual_seed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funder_id, tract_id)
);

-- Hot path for the matcher: "given an org tract, which bank funders
-- cover it?" — covered by an index on tract_id.
CREATE INDEX IF NOT EXISTS bank_aa_tract_idx  ON bank_assessment_areas(tract_id);
CREATE INDEX IF NOT EXISTS bank_aa_funder_idx ON bank_assessment_areas(funder_id);

ALTER TABLE bank_assessment_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_aa: read all" ON bank_assessment_areas;
CREATE POLICY "bank_aa: read all" ON bank_assessment_areas
  FOR SELECT TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- POST-RUN VERIFICATION
--   SELECT count(*) FROM census_tracts;            -- 0 (seed fills it)
--   SELECT count(*) FROM bank_assessment_areas;    -- 0 (seed fills it)
-- ════════════════════════════════════════════════════════════════════════════
