-- Ingestion targets for CYC's proprietary workbooks:
--   • Instrumentl Data.xlsx  → cyc_grant_submissions (real pipeline + outcomes)
--   • eo_il.xlsx             → board members, cultivation, peers, funder
--                              prospects, research queue, IRS IL BMF reference
-- All service-role-only; served to CYC users through server routes (same posture
-- as the Data Hub). Loaded by scripts/import-instrumentl.mjs + import-eo-il.mjs.

-- 1. Instrumentl grant submission history (CYC's real applications + outcomes).
create table if not exists cyc_grant_submissions (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,
  project                text,
  opportunity_name       text,
  funder_name            text,
  owner                  text,
  status                 text,        -- raw Instrumentl status
  outcome                text check (outcome in ('awarded', 'rejected')), -- terminal label (null = pending/none)
  stage                  text,        -- normalized pipeline stage
  opportunity_amount     numeric,
  amount_requested       numeric,
  amount_awarded         numeric,
  loi_deadline           date,
  preproposal_deadline   date,
  fullproposal_deadline  date,
  notes                  text,
  source                 text not null default 'instrumentl',
  imported_at            timestamptz not null default now(),
  unique (org_id, opportunity_name, funder_name)
);
create index if not exists cyc_grant_submissions_outcome_idx on cyc_grant_submissions (org_id, outcome);
create index if not exists cyc_grant_submissions_funder_idx  on cyc_grant_submissions (org_id, funder_name);

-- 2. Board members / network mapping (eo_il "Board Members").
create table if not exists funder_board_members (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  foundation_name   text,
  member_name       text,
  title             text,
  email             text,
  connection_to_cyc text,
  connection_type   text,
  who_knows_them    text,
  source            text,
  outreach_status   text,
  imported_at       timestamptz not null default now(),
  unique (org_id, foundation_name, member_name)
);
create index if not exists funder_board_members_conn_idx on funder_board_members (org_id, connection_to_cyc);

-- 3. Cultivation list (eo_il "Cultivation List").
create table if not exists cyc_cultivation (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  foundation_name       text,
  bmf_ein               text,
  in_il_bmf             text,
  bmf_legal_name        text,
  funder_type           text,
  total_assets          numeric,
  metro_area            text,
  address               text,
  funding_focus         text,
  funding_range         text,
  email                 text,
  phone                 text,
  board_members_listed  text,
  notes                 text,
  lookup_url            text,
  imported_at           timestamptz not null default now(),
  unique (org_id, foundation_name)
);

-- 4. Peer youth orgs (eo_il "Peer Youth Orgs") — feeds the affinity factor.
create table if not exists cyc_peer_orgs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  ein              text,
  name             text,
  peer_category    text,
  ntee_code        text,
  city             text,
  zip              text,
  total_assets     numeric,
  revenue          numeric,
  same_ntee_as_cyc text,
  lookup_url       text,
  imported_at      timestamptz not null default now(),
  unique (org_id, ein)
);

-- 5. Funder prospects (eo_il "Chicago Metro Funders" + "Funder Prospects").
create table if not exists cyc_funder_prospects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  ein          text,
  name         text,
  funder_type  text,
  metro_area   text,
  contact      text,
  street       text,
  city         text,
  zip          text,
  total_assets numeric,
  income       numeric,
  ntee_code    text,
  files_990pf  text,
  lookup_url   text,
  list_source  text,        -- 'chicago_metro_funders' | 'funder_prospects'
  imported_at  timestamptz not null default now(),
  unique (org_id, ein, list_source)
);
create index if not exists cyc_funder_prospects_ntee_idx on cyc_funder_prospects (org_id, ntee_code);

-- 6. Research queue (eo_il "Research Queue").
create table if not exists cyc_research_queue (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  priority            text,
  ein                 text,
  organization_name   text,
  funder_type         text,
  city                text,
  total_assets        numeric,
  lookup_url          text,
  board_members_pulled text,
  peer_grantee_overlap text,
  connection_found    text,
  owner               text,
  next_action         text,
  status              text,
  imported_at         timestamptz not null default now(),
  unique (org_id, ein, organization_name)
);

-- 7. IRS Illinois Business Master File reference (eo_il "eo_il", ~74k rows).
--    Shared reference (not org-scoped); keyed by EIN.
create table if not exists irs_bmf_il (
  ein              text primary key,
  name             text,
  ico              text,
  street           text,
  city             text,
  state            text,
  zip              text,
  subsection       text,
  classification   text,
  ruling           text,
  deductibility    text,
  foundation       text,
  activity         text,
  organization     text,
  status           text,
  tax_period       text,
  asset_cd         text,
  income_cd        text,
  filing_req_cd    text,
  pf_filing_req_cd text,
  asset_amt        numeric,
  income_amt       numeric,
  revenue_amt      numeric,
  ntee_cd          text,
  sort_name        text,
  imported_at      timestamptz not null default now()
);
create index if not exists irs_bmf_il_ntee_idx on irs_bmf_il (ntee_cd);

-- RLS: service role only.
alter table cyc_grant_submissions enable row level security;
alter table funder_board_members  enable row level security;
alter table cyc_cultivation        enable row level security;
alter table cyc_peer_orgs          enable row level security;
alter table cyc_funder_prospects   enable row level security;
alter table cyc_research_queue     enable row level security;
alter table irs_bmf_il             enable row level security;

create policy "service_role_only_cyc_grant_submissions" on cyc_grant_submissions using (false) with check (false);
create policy "service_role_only_funder_board_members"  on funder_board_members  using (false) with check (false);
create policy "service_role_only_cyc_cultivation"       on cyc_cultivation       using (false) with check (false);
create policy "service_role_only_cyc_peer_orgs"         on cyc_peer_orgs         using (false) with check (false);
create policy "service_role_only_cyc_funder_prospects"  on cyc_funder_prospects  using (false) with check (false);
create policy "service_role_only_cyc_research_queue"    on cyc_research_queue    using (false) with check (false);
create policy "service_role_only_irs_bmf_il"            on irs_bmf_il            using (false) with check (false);
