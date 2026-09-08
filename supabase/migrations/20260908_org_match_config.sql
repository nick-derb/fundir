-- Per-org AI matching configuration: the score weights and the minimum-score
-- floor, editable from Settings. Defaults are the engine's live weights
-- (lib/matching.ts computeMatchScore), so an org that never edits keeps exactly
-- the behavior it has today.
create table if not exists org_match_config (
  org_id        uuid primary key references organizations(id) on delete cascade,
  min_score     int     not null default 32,
  w_semantic    numeric not null default 32,
  w_eligibility numeric not null default 20,
  w_financial   numeric not null default 18,
  w_affinity    numeric not null default 12,
  w_strategic   numeric not null default 12,
  w_historical  numeric not null default 6,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

alter table org_match_config enable row level security;
create policy "service_role_only_org_match_config" on org_match_config using (false) with check (false);

-- The composite blends six factors but only five were ever persisted. Storing
-- funder affinity too means a weight change can recompute every composite
-- exactly, from stored sub-scores, with no re-embedding.
alter table match_results add column if not exists funder_affinity_score numeric;
