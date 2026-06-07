-- Tier 1C: outcome feedback loop
-- Run in the Supabase SQL Editor.
--
-- Today the historical_score in computeMatchScore reads from a hand-coded
-- orgProfile.historicalWinRates dictionary. Real submission outcomes that
-- flow through the pipeline (awarded / rejected) never make it back into
-- the matching math, so 3 months of submissions never sharpen the score.
--
-- This migration:
--   1. Creates org_outcomes — one row per (match_id, terminal outcome).
--   2. Installs a trigger on match_results that records the outcome when
--      pipeline_stage transitions to awarded or rejected, and replaces
--      any prior outcome row for the same match if the user changes
--      their mind.
--   3. Enables RLS scoped to org membership, same pattern as the other
--      org-scoped tables.
--
-- IDEMPOTENT: safe to re-run.

-- 1. Table
CREATE TABLE IF NOT EXISTS org_outcomes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  match_id      uuid REFERENCES match_results(id) ON DELETE SET NULL,
  agency_code   text,
  aln_codes     text[],
  outcome       text NOT NULL CHECK (outcome IN ('awarded', 'rejected')),
  award_amount  bigint,        -- optional, for future financial scoring use
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_outcomes_org_id_idx  ON org_outcomes(org_id);
CREATE INDEX IF NOT EXISTS org_outcomes_agency_idx  ON org_outcomes(org_id, agency_code);
CREATE INDEX IF NOT EXISTS org_outcomes_match_idx   ON org_outcomes(match_id);

-- 2. RLS — same org-member pattern as the other tables hardened in
--    qa_rls_hardening.sql.
ALTER TABLE org_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outcomes: members manage own org" ON org_outcomes;
CREATE POLICY "outcomes: members manage own org" ON org_outcomes
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- 3. Trigger: when match_results.pipeline_stage transitions to a terminal
--    outcome, mirror that into org_outcomes so the Bayesian win-rate
--    computation has fresh data next discovery. Replaces any prior
--    outcome for the same match (handles "awarded, then actually
--    rejected" edits without double-counting).
CREATE OR REPLACE FUNCTION record_org_outcome() RETURNS TRIGGER AS $$
DECLARE
  v_agency_code text;
  v_aln_codes   text[];
BEGIN
  IF NEW.pipeline_stage IN ('awarded', 'rejected')
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage <> NEW.pipeline_stage) THEN

    SELECT g.agency_code, g.aln_codes
      INTO v_agency_code, v_aln_codes
      FROM grant_opportunities g
     WHERE g.id = NEW.grant_id;

    -- Idempotent on (match_id): re-marking awarded -> rejected replaces
    -- the prior row instead of double-counting.
    DELETE FROM org_outcomes WHERE match_id = NEW.id;
    INSERT INTO org_outcomes (org_id, match_id, agency_code, aln_codes, outcome)
    VALUES (NEW.org_id, NEW.id, v_agency_code, v_aln_codes, NEW.pipeline_stage);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS match_results_record_outcome ON match_results;
CREATE TRIGGER match_results_record_outcome
  AFTER UPDATE OF pipeline_stage ON match_results
  FOR EACH ROW
  EXECUTE FUNCTION record_org_outcome();
