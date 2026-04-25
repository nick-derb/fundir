-- Migration: Grant tasks and notes
-- Run in Supabase SQL Editor

-- ── Tasks ─────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_grant_tasks_grant_id ON grant_tasks(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_tasks_completed ON grant_tasks(grant_id, completed);

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- One note document per grant (upsert pattern)
CREATE TABLE IF NOT EXISTS grant_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    uuid NOT NULL REFERENCES grant_opportunities(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_notes_grant_id ON grant_notes(grant_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE grant_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_notes  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; anon/authenticated read own org's data
-- For now: allow authenticated users full access (tighten per-org later)
CREATE POLICY "auth_all_tasks" ON grant_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_notes" ON grant_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
