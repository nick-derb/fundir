-- Fix: match_results unique constraint must be (grant_id, org_id) not just grant_id
-- The original single-tenant schema had grant_id unique globally, which blocks
-- the same grant from being matched to multiple orgs.

-- Drop the old single-column unique constraint
ALTER TABLE match_results DROP CONSTRAINT IF EXISTS match_results_grant_id_key;

-- Add the correct multi-tenant unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS match_results_grant_org_idx
  ON match_results (grant_id, org_id);
