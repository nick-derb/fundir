-- Document analyses: persists AI analysis of uploaded org documents
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS document_analyses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  org_code        text        NOT NULL,
  file_name       text        NOT NULL,
  provider        text        NOT NULL DEFAULT 'upload',  -- 'upload' | 'google' | 'microsoft'
  doc_type        text        NOT NULL DEFAULT 'financial', -- 'financial' | 'strategic_plan' | 'grant_application' | 'program_report' | 'board_minutes' | 'general'
  summary         text        NOT NULL DEFAULT '',
  analysis        jsonb       NOT NULL DEFAULT '{}',
  analyzed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_analyses_org_code_idx ON document_analyses(org_code, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS doc_analyses_org_id_idx   ON document_analyses(org_id,   analyzed_at DESC);
