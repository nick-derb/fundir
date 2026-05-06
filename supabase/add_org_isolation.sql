-- Add org_id to match_results for multi-tenant isolation
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

-- Tag all existing rows as belonging to CYC (the original org)
UPDATE match_results
SET org_id = (SELECT id FROM organizations WHERE org_code = 'CYC2025')
WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS match_results_org_id_idx ON match_results(org_id);

-- Add org_id to pipeline_runs
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

UPDATE pipeline_runs
SET org_id = (SELECT id FROM organizations WHERE org_code = 'CYC2025')
WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS pipeline_runs_org_id_idx ON pipeline_runs(org_id);
