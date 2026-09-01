-- Phase 1 of the internal Fundir/CYC model (see docs/model-development-plan.md).
-- Pure data-infrastructure: makes the proprietary asset (outcome history +
-- Data Hub metrics) trainable and versioned. Nothing here changes any
-- user-facing score — the heuristic composite_score remains the source of truth.
-- All tables are service-role-only; every training job runs server-side, per org.

-- 1. training_snapshots — versioned, timestamped pulls of proprietary data
--    (e.g. the OneDrive Data Hub workbook), so every training run is
--    reproducible and never trains against a moving target.
create table if not exists training_snapshots (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  kind         text not null,                 -- 'data_hub' | 'financials' | ...
  taken_at     timestamptz not null default now(),
  row_count    int not null default 0,
  content_hash text,                          -- dedupe identical snapshots
  payload      jsonb not null default '[]',   -- the snapshotted rows
  meta         jsonb
);
create index if not exists training_snapshots_org_idx on training_snapshots (org_id, kind, taken_at desc);

-- 2. training_examples — one materialized (features, label) row per historical
--    match with a known outcome. The features are frozen behind a
--    feature_spec_version so predictions are reproducible.
create table if not exists training_examples (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  grant_id             uuid,                   -- grant_opportunities.id (no FK: predates repo migrations)
  match_id             uuid,                   -- match_results.id
  features             jsonb not null,
  label                text not null check (label in ('awarded', 'rejected')),
  applied_at           timestamptz,
  outcome_at           timestamptz,
  snapshot_id          uuid references training_snapshots(id) on delete set null,
  feature_spec_version text not null default 'v1',
  created_at           timestamptz not null default now(),
  unique (org_id, grant_id, feature_spec_version)
);
create index if not exists training_examples_org_idx on training_examples (org_id, feature_spec_version);

-- 3. model_registry — trained model artifacts. Training happens offline; the
--    resulting coefficients/tree spec live here as jsonb so serving stays in
--    TypeScript (no Python at runtime). Exactly one row per (org, kind) may be
--    active at a time.
create table if not exists model_registry (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid references organizations(id) on delete cascade, -- null = global
  kind                 text not null,          -- 'win_probability' | 'funder_affinity'
  version              text not null,
  feature_spec_version text,
  artifact             jsonb not null,         -- coefficients / tree spec
  metrics              jsonb,                  -- AUC, calibration, example_count, ...
  training_snapshot_id uuid references training_snapshots(id) on delete set null,
  example_count        int,
  active               boolean not null default false,
  created_at           timestamptz not null default now()
);
create unique index if not exists model_registry_active_idx
  on model_registry (coalesce(org_id, '00000000-0000-0000-0000-000000000000'), kind)
  where active;

-- 4. predictions_log — shadow-mode record: heuristic score vs learned score for
--    the same match, so we can compare against realized outcomes BEFORE a
--    learned model ever influences the UI.
create table if not exists predictions_log (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  grant_id             uuid,
  match_id             uuid,
  model_id             uuid references model_registry(id) on delete set null,
  feature_spec_version text,
  heuristic_score      numeric,
  learned_score        numeric,
  features             jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists predictions_log_org_idx on predictions_log (org_id, created_at desc);

-- RLS: service role only (all training reads/writes go through server jobs).
alter table training_snapshots enable row level security;
alter table training_examples  enable row level security;
alter table model_registry     enable row level security;
alter table predictions_log    enable row level security;

create policy "service_role_only_training_snapshots" on training_snapshots using (false) with check (false);
create policy "service_role_only_training_examples"  on training_examples  using (false) with check (false);
create policy "service_role_only_model_registry"     on model_registry     using (false) with check (false);
create policy "service_role_only_predictions_log"    on predictions_log    using (false) with check (false);
