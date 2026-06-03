-- ════════════════════════════════════════════════════════════════════════════
-- Fundir RLS Hardening — closes data-isolation gaps surfaced in the QA pass.
-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- THIS MIGRATION:
--   1. Drops the public-read policy on `organizations` (which exposed `ein`,
--      `financial_data` (full 990 history), and `profile_data` (mission,
--      budget, board, contributors) to anonymous users). Replaces with a
--      member-can-read-own-org policy.
--   2. Adds `org_id` to `grant_notes` + `grant_tasks`, backfills it for the
--      single existing tenant (CYC), changes the broken UNIQUE INDEX on
--      `grant_notes(grant_id)` to `(grant_id, org_id)` so two orgs can have
--      private notes on the same grant.
--   3. Replaces the `USING (true)` policies on `grant_notes` + `grant_tasks`
--      (any authenticated user could read/write any row) with proper
--      org-member-only policies.
--   4. Enables RLS on `match_results`, `grant_opportunities`, `pipeline_runs`,
--      `document_analyses` with org-member-only policies. Server-side code
--      uses the service-role key which bypasses RLS, so existing server
--      actions and API routes keep working — but anon/auth direct clients
--      are now blocked from cross-tenant access (defense in depth on top of
--      the app-layer `.eq('org_id', ctx.orgId)` filtering).
--
-- IDEMPOTENT — safe to re-run. Uses IF EXISTS / IF NOT EXISTS everywhere.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. organizations — drop public read; restrict to members ───────────────
DROP POLICY IF EXISTS "Public can read orgs" ON organizations;

DROP POLICY IF EXISTS "Members can read own org" ON organizations;
CREATE POLICY "Members can read own org" ON organizations
  FOR SELECT
  USING (
    id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())
  );

-- ── 2. grant_notes — add org_id, fix UNIQUE index, fix RLS ────────────────
ALTER TABLE grant_notes
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill: the only existing tenant is CYC; all existing notes belong to it.
UPDATE grant_notes
SET    org_id = (SELECT id FROM organizations WHERE org_code = 'CYC2025')
WHERE  org_id IS NULL;

-- Drop the bad UNIQUE INDEX (one note per grant globally — across all orgs).
DROP INDEX IF EXISTS idx_grant_notes_grant_id;

-- Correct multi-tenant uniqueness: one note per (grant, org).
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_notes_grant_org
  ON grant_notes(grant_id, org_id);

CREATE INDEX IF NOT EXISTS idx_grant_notes_org_id ON grant_notes(org_id);

DROP POLICY IF EXISTS "auth_all_notes" ON grant_notes;
DROP POLICY IF EXISTS "notes: members manage own org" ON grant_notes;
CREATE POLICY "notes: members manage own org" ON grant_notes
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- ── 3. grant_tasks — same treatment ────────────────────────────────────────
ALTER TABLE grant_tasks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE grant_tasks
SET    org_id = (SELECT id FROM organizations WHERE org_code = 'CYC2025')
WHERE  org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_grant_tasks_org_id ON grant_tasks(org_id);

DROP POLICY IF EXISTS "auth_all_tasks" ON grant_tasks;
DROP POLICY IF EXISTS "tasks: members manage own org" ON grant_tasks;
CREATE POLICY "tasks: members manage own org" ON grant_tasks
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- ── 4. match_results — enable RLS, org-member policies ─────────────────────
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches: members read own org"   ON match_results;
DROP POLICY IF EXISTS "matches: members write own org"  ON match_results;
DROP POLICY IF EXISTS "matches: members update own org" ON match_results;
DROP POLICY IF EXISTS "matches: members delete own org" ON match_results;

CREATE POLICY "matches: members read own org" ON match_results
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "matches: members write own org" ON match_results
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "matches: members update own org" ON match_results
  FOR UPDATE TO authenticated
  USING      (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "matches: members delete own org" ON match_results
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- ── 5. pipeline_runs — enable RLS ──────────────────────────────────────────
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runs: members read own org" ON pipeline_runs;
CREATE POLICY "runs: members read own org" ON pipeline_runs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- ── 6. grant_opportunities — shared catalogue, any authed user can read ──
-- grant_opportunities is a shared catalogue across all orgs. Reads are open
-- to any authenticated user; writes happen during discovery and only via
-- the service-role key (which bypasses RLS anyway).
ALTER TABLE grant_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grants: authenticated read all" ON grant_opportunities;
CREATE POLICY "grants: authenticated read all" ON grant_opportunities
  FOR SELECT TO authenticated
  USING (true);

-- ── 7. document_analyses — enable RLS ──────────────────────────────────────
ALTER TABLE document_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analyses: members manage own org" ON document_analyses;
CREATE POLICY "analyses: members manage own org" ON document_analyses
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
