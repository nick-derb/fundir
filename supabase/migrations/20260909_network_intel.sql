-- Network intelligence: CYC's own people (board first), their LinkedIn career
-- history, and the second-order warm paths inferred from it — current employees
-- at a board member's prior orgs are people that member very likely still knows.
--
-- Refresh is ON DEMAND (quarterly is plenty — board turnover is slow), never a
-- cron: every RapidAPI call costs credits, so runs are bounded batches with the
-- spend recorded per run. See lib/network/linkedin.ts for the provider notes
-- inherited from RAPIDAPI_SCRAPER_GUIDE.md (canonical URLs, expiring photo
-- links, error-body logging, hard budgets).

-- People nodes. kind: 'board' | 'staff' (CYC's own people, entered by CYC with
-- their LinkedIn URL) and 'lead' (discovered second-order people).
create table if not exists network_people (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  kind          text not null default 'lead',
  name          text not null,
  linkedin_url  text,            -- canonical https://www.linkedin.com/in/<slug>
  headline      text,
  current_title text,
  current_org   text,
  location      text,
  summary       text,
  note          text,            -- CYC-entered context
  status        text not null default 'new',  -- leads: new | added | dismissed
  enriched_at   timestamptz,
  created_at    timestamptz not null default now()
);
-- linkedin_url is the natural identity when present (guide §4); nullable for
-- hand-entered people, so uniqueness is a partial index.
create unique index if not exists network_people_url_uq
  on network_people (org_id, linkedin_url) where linkedin_url is not null;
create index if not exists network_people_org_kind_idx on network_people (org_id, kind);

-- Career history pulled from the profile (fuzzy LinkedIn dates stay text).
create table if not exists network_employments (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references network_people(id) on delete cascade,
  org_name   text not null,
  title      text,
  started    text,
  ended      text,
  is_current boolean not null default false
);
create index if not exists network_employments_person_idx on network_employments (person_id);

-- A warm path: `person` (the lead) is reachable via `via_person` (a CYC board
-- member) through `via_org` (the employer they shared).
create table if not exists network_leads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  person_id     uuid not null references network_people(id) on delete cascade,
  via_person_id uuid references network_people(id) on delete set null,
  via_org       text not null,
  reason        text not null,
  score         numeric not null default 0,
  created_at    timestamptz not null default now(),
  unique (person_id, via_org)
);
create index if not exists network_leads_org_idx on network_leads (org_id, score desc);

-- One row per employer we've run a people-search against, so a quarterly
-- refresh never re-spends credits on a company already scanned this cycle.
create table if not exists network_org_scans (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  company    text not null,
  scanned_at timestamptz not null default now(),
  results    int not null default 0,
  unique (org_id, company)
);

-- Spend/audit trail per refresh step.
create table if not exists network_refresh_runs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  api_calls         int not null default 0,
  profiles_enriched int not null default 0,
  companies_scanned int not null default 0,
  leads_found       int not null default 0,
  status            text not null default 'running',  -- running | done | error
  notes             text
);

alter table network_people       enable row level security;
alter table network_employments  enable row level security;
alter table network_leads        enable row level security;
alter table network_org_scans    enable row level security;
alter table network_refresh_runs enable row level security;
create policy "service_role_only_network_people"       on network_people       using (false) with check (false);
create policy "service_role_only_network_employments"  on network_employments  using (false) with check (false);
create policy "service_role_only_network_leads"        on network_leads        using (false) with check (false);
create policy "service_role_only_network_org_scans"    on network_org_scans    using (false) with check (false);
create policy "service_role_only_network_refresh_runs" on network_refresh_runs using (false) with check (false);

-- Seed CYC's known board officers (from the FY25 audit) so the roster isn't
-- empty on first open. LinkedIn URLs are added by CYC in the UI — enrichment
-- by pasted URL is exact and costs nothing to disambiguate, unlike name search.
insert into network_people (org_id, kind, name, current_title, current_org, note)
select o.id, 'board', v.name, v.title, null, 'Seeded from FY25 audit — add their LinkedIn URL to map their network.'
from organizations o,
  (values
    ('Phil Doherty',          'Board Chair'),
    ('Cathy Main',            'Vice Chair'),
    ('Devin Maddox',          'Secretary'),
    ('Thomas D. Vander Veen', 'Treasurer')
  ) as v(name, title)
where o.org_code = 'CYC2026'
  and not exists (
    select 1 from network_people p
    where p.org_id = o.id and p.name = v.name and p.kind = 'board'
  );
