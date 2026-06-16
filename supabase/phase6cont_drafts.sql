-- ════════════════════════════════════════════════════════════════════════════
-- Phase 6 follow-up — drafts table
--
-- Per PHASE_0_PLAN.md SS 6 + Decision 5: Claude-generated first draft of
-- a grant application, anchored on the org's own profile_data + 990 +
-- prior narratives. Every factual claim about the org is wrapped in a
-- citation tag the UI can render with provenance. Un-citable claims
-- become "[TODO: confirm from org]" — Claude never fabricates org facts.
--
-- One draft per (organization, opportunity). status transitions
-- drafting → review → final (or → discarded). RLS scopes reads + writes
-- to org members.
--
-- IDEMPOTENT — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id    uuid NOT NULL REFERENCES grant_opportunities(id) ON DELETE CASCADE,
  /** Sectioned draft body: { background, need, approach, capacity,
   *  budget_narrative, impact } each a string with inline {{cite:N}}
   *  refs back into source_citations. */
  content           jsonb NOT NULL,
  /** Numbered list of provenance records the citations refer to. Each
   *  entry: { id: int, source_type, source_key, quote, location }. */
  source_citations  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'drafting'
                      CHECK (status IN ('drafting','review','final','discarded')),
  /** Total prompt+completion tokens charged for this draft (audit). */
  tokens_used       int,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One draft per (org, opportunity). The admin endpoint UPSERTs on this
-- key so regenerating overwrites cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS drafts_org_opp_idx
  ON drafts(organization_id, opportunity_id);

CREATE INDEX IF NOT EXISTS drafts_org_status_idx
  ON drafts(organization_id, status);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafts: members read own org" ON drafts;
CREATE POLICY "drafts: members read own org" ON drafts
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "drafts: members update status own org" ON drafts;
-- Members can update status (drafting → review → final → discarded) but
-- not the content/citations (which are service-role writes from the
-- generator).
CREATE POLICY "drafts: members update status own org" ON drafts
  FOR UPDATE TO authenticated
  USING      (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
