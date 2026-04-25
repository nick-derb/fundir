-- Migration: Add reverse 990 screening columns to match_results
-- Run in Supabase SQL Editor

ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS financial_score   numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS financial_signals jsonb   DEFAULT '[]'::jsonb;

-- Index for filtering/sorting by financial score
CREATE INDEX IF NOT EXISTS idx_match_results_financial_score
  ON match_results (financial_score DESC);

-- Backfill existing rows with neutral score (50 = unknown, no 990 data at time of match)
UPDATE match_results
SET
  financial_score   = 50,
  financial_signals = '[]'::jsonb
WHERE financial_score IS NULL;
