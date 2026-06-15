-- ════════════════════════════════════════════════════════════════════════════
-- Phase 3A — peer_orgs table.
--
-- Links a Fundir org (organizations.id) to its peer recipients
-- (recipients.id) in the 990 graph. Used by the funder-affinity factor:
-- "of this org's 15-20 peers, what share were funded by THIS opportunity's
-- funder in the last 3 FY?"
--
-- The decision in PHASE_0_PLAN.md Section 6 #2 was the hybrid approach
-- (heuristic pool → embedding sort). Phase 3 base populates peer_orgs
-- via hand-curated seed for CYC + targeted hand-curation for any new
-- tenant; Phase 3-cont. can wire the automated similarity scorer when
-- the seed pattern starts to feel curatorial.
--
-- Read policy: tenant-scoped (each org sees its own peer set). Write
-- policy: service-role only (seed bridge + future automated builder).
--
-- IDEMPOTENT — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. grant_opportunities.funder_id ──────────────────────────────────────
-- The funder-affinity factor needs the grant's funder resolved at score
-- time. Federal NOFOs and region-source adapters leave it NULL (those
-- aren't 'a relationship to a funder' — they're a program). Foundation
-- ingestion populates it via EIN lookup at insert time.
ALTER TABLE grant_opportunities
  ADD COLUMN IF NOT EXISTS funder_id uuid REFERENCES funders(id);
CREATE INDEX IF NOT EXISTS grant_opportunities_funder_id_idx
  ON grant_opportunities(funder_id) WHERE funder_id IS NOT NULL;

-- ── 2. peer_orgs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS peer_orgs (
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  peer_recipient_id  uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  similarity         numeric NOT NULL CHECK (similarity > 0 AND similarity <= 1.0),
  basis              jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, peer_recipient_id)
);

CREATE INDEX IF NOT EXISTS peer_orgs_org_idx       ON peer_orgs(organization_id);
CREATE INDEX IF NOT EXISTS peer_orgs_recipient_idx ON peer_orgs(peer_recipient_id);

ALTER TABLE peer_orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "peer_orgs: members read own org" ON peer_orgs;
CREATE POLICY "peer_orgs: members read own org"
  ON peer_orgs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
