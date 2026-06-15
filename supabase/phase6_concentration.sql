-- ════════════════════════════════════════════════════════════════════════════
-- Phase 6A — concentration_snapshots table
--
-- Per-tenant computation of funding-source concentration sourced from
-- their existing 990 / financial_data. The matter is tenant-scoped
-- (different orgs see different snapshots), so RLS gates reads to org
-- members. Writes are service-role only — populated by the
-- /api/admin/compute-concentration endpoint and the Phase 6D
-- recompute trigger.
--
-- IDEMPOTENT — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS concentration_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  revenue_breakdown     jsonb NOT NULL,
  /** HHI-style 0..1; higher = more concentrated. */
  concentration_index   numeric NOT NULL,
  risk_flags            jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS concentration_org_idx
  ON concentration_snapshots(organization_id, computed_at DESC);

ALTER TABLE concentration_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "concentration: members read own org" ON concentration_snapshots;
CREATE POLICY "concentration: members read own org"
  ON concentration_snapshots
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
