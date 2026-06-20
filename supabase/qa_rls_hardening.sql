-- ════════════════════════════════════════════════════════════════════════════
-- Fundir RLS Hardening — closes data-isolation gaps surfaced in the QA pass.
-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- This is SELF-CONTAINED — it creates any referenced tables that don't
-- already exist (e.g. grant_notes / grant_tasks if the original
-- add_tasks_notes.sql was never applied to this database). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. Ensure referenced tables exist (idempotent) ─────────────────────────
-- grant_notes + grant_tasks may have been missed if add_tasks_notes.sql was
-- never applied. document_analyses may have been missed if
-- add_document_analyses.sql was never applied. CREATE TABLE IF NOT EXISTS
-- so this works against any prior state.

CREATE TABLE IF NOT EXISTS grant_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    uuid NOT NULL REFERENCES grant_opportunities(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grant_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    uuid NOT NULL REFERENCES grant_opportunities(id) ON DELETE CASCADE,
  title       text NOT NULL,
  completed   boolean NOT NULL DEFAULT false,
  due_date    date,
  priority    text CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_tasks_grant_id  ON grant_tasks(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_tasks_completed ON grant_tasks(grant_id, completed);

CREATE TABLE IF NOT EXISTS document_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,
  org_code        text NOT NULL,
  file_name       text NOT NULL,
  provider        text NOT NULL DEFAULT 'upload',
  doc_type        text NOT NULL DEFAULT 'financial',
  summary         text NOT NULL DEFAULT '',
  analysis        jsonb NOT NULL DEFAULT '{}',
  analyzed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_analyses_org_code_idx ON document_analyses(org_code, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS doc_analyses_org_id_idx   ON document_analyses(org_id,   analyzed_at DESC);

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
-- No-op if there are no rows yet.
UPDATE grant_notes
SET    org_id = (SELECT id FROM organizations WHERE org_code = 'CYC2026')
WHERE  org_id IS NULL;

-- Drop the bad UNIQUE INDEX (one note per grant globally — across all orgs).
DROP INDEX IF EXISTS idx_grant_notes_grant_id;

-- Correct multi-tenant uniqueness: one note per (grant, org).
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_notes_grant_org
  ON grant_notes(grant_id, org_id);

CREATE INDEX IF NOT EXISTS idx_grant_notes_org_id ON grant_notes(org_id);

ALTER TABLE grant_notes ENABLE ROW LEVEL SECURITY;

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
SET    org_id = (SELECT id FROM organizations WHERE org_code = 'CYC2026')
WHERE  org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_grant_tasks_org_id ON grant_tasks(org_id);

ALTER TABLE grant_tasks ENABLE ROW LEVEL SECURITY;

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
