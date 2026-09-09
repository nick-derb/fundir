-- ═══════════════════════════════════════════════════════════════════════════
-- Relationship graph — Phase 1: data model, provenance, organization bridge.
--
-- Decisions (approved 2026-09-09):
--   D1  Bridge the two existing funder stacks through ONE canonical org node
--       (network_organizations) — no third store. funders/recipients stay.
--   D3  grants_made remains the single funding-event table; provenance and
--       category columns are added and the brief's shape is a VIEW.
--   D4  Public bios / 990 officer lists are a first-class career source, so
--       LinkedIn is one source among several (network_sources.source_type).
--   D5  Two spend ledgers, both recorded per refresh run.
--
-- Every fact-bearing row (edge, board seat, funding event, org) carries a
-- source_id. All new tables are service-role-only under RLS, matching every
-- cyc_* and network_* table already in the project.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

-- ── 1. Provenance ──────────────────────────────────────────────────────────
create table if not exists network_sources (
  id               uuid primary key default gen_random_uuid(),
  source_type      text not null check (source_type in (
                     'irs_990_xml','irs_bmf','propublica','foundation_site','corporate_site',
                     'public_bio','cyc_site','cyc_workbook','instrumentl','linkedin_api',
                     'cra_ffiec','seed','manual')),
  source_name      text not null,
  source_url       text,
  retrieved_at     timestamptz not null default now(),
  publication_date date,
  confidence       numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  raw_reference    text,             -- filing object id, file name + version, page title…
  created_at       timestamptz not null default now()
);
create index if not exists network_sources_type_idx on network_sources (source_type);

-- ── 2. Canonical organization node (the bridge) ────────────────────────────
-- Global entity table like funders/recipients (facts about an org are not
-- tenant-specific). Back-references let every existing scorer keep reading
-- its own tables while the graph resolves identity once.
create table if not exists network_organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  normalized_name   text not null,
  organization_type text not null default 'unknown' check (organization_type in (
                      'foundation','community_foundation','corporate_foundation','corporation',
                      'bank','nonprofit','university','government','unknown')),
  ein               text,
  website           text,
  city              text,
  state             text,
  description       text,
  sector            text,
  ntee_code         text,
  funder_id         uuid references funders(id)    on delete set null,
  recipient_id      uuid references recipients(id) on delete set null,
  source_id         uuid references network_sources(id) on delete set null,
  confidence        numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  last_verified_at  timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create unique index if not exists network_organizations_ein_uq on network_organizations (ein) where ein is not null;
create index if not exists network_organizations_norm_idx on network_organizations (normalized_name);
create index if not exists network_organizations_name_trgm on network_organizations using gin (name gin_trgm_ops);
create index if not exists network_organizations_type_idx on network_organizations (organization_type);

-- ── 3. People: educations + board seats + provenance on existing tables ────
alter table network_people add column if not exists source_id     uuid references network_sources(id) on delete set null;
alter table network_people add column if not exists board_role    text;     -- Chair | Vice Chair | Treasurer | Secretary | Member | President and CEO
alter table network_people add column if not exists organization_id uuid references network_organizations(id) on delete set null; -- resolved current employer
alter table network_people add column if not exists verification  text not null default 'probable' check (verification in ('verified','probable','inferred'));

alter table network_employments add column if not exists source_id       uuid references network_sources(id) on delete set null;
alter table network_employments add column if not exists organization_id uuid references network_organizations(id) on delete set null;
alter table network_employments add column if not exists start_year      int;
alter table network_employments add column if not exists end_year        int;

create table if not exists network_educations (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references network_people(id) on delete cascade,
  school_name      text not null,
  organization_id  uuid references network_organizations(id) on delete set null,
  degree           text,
  field            text,
  start_year       int,
  end_year         int,
  source_id        uuid references network_sources(id) on delete set null
);
create index if not exists network_educations_person_idx on network_educations (person_id);

create table if not exists network_boards (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references network_people(id) on delete cascade,
  organization_id  uuid not null references network_organizations(id) on delete cascade,
  title            text,
  started          text,
  ended            text,
  is_current       boolean not null default true,
  source_id        uuid references network_sources(id) on delete set null,
  confidence       numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  created_at       timestamptz not null default now(),
  unique (person_id, organization_id, title)
);
create index if not exists network_boards_org_idx on network_boards (organization_id);

-- ── 4. The graph edge ──────────────────────────────────────────────────────
create table if not exists network_relationships (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,  -- tenant that derived it
  source_person_id       uuid references network_people(id) on delete cascade,
  target_person_id       uuid references network_people(id) on delete cascade,
  source_organization_id uuid references network_organizations(id) on delete cascade,
  target_organization_id uuid references network_organizations(id) on delete cascade,
  relationship_type      text not null check (relationship_type in (
                           'former_colleague','current_colleague','former_manager','former_direct_report',
                           'shared_employer','shared_board','shared_university','shared_nonprofit',
                           'shared_professional_association','existing_cyc_relationship','second_degree',
                           'geographic_overlap','philanthropic_overlap','corporate_connection','foundation_connection')),
  relationship_strength  numeric not null default 0 check (relationship_strength >= 0 and relationship_strength <= 100),
  confidence             numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  verification           text not null default 'inferred' check (verification in ('verified','probable','inferred')),
  evidence               jsonb not null default '{}'::jsonb,   -- the rows that prove it (ids + human summary)
  source_id              uuid references network_sources(id) on delete set null,
  source_type            text,
  observed_at            timestamptz not null default now(),
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  check (source_person_id is not null or source_organization_id is not null),
  check (target_person_id is not null or target_organization_id is not null)
);
-- One edge per (endpoints, type, source): re-derivation upserts instead of duplicating.
create unique index if not exists network_relationships_uq on network_relationships (
  org_id, relationship_type,
  coalesce(source_person_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_person_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(source_organization_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_organization_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(source_type, ''));
create index if not exists network_relationships_sp_idx on network_relationships (source_person_id);
create index if not exists network_relationships_tp_idx on network_relationships (target_person_id);
create index if not exists network_relationships_so_idx on network_relationships (source_organization_id);
create index if not exists network_relationships_to_idx on network_relationships (target_organization_id);

-- ── 5. Funding events: extend grants_made (D3) + expose the brief's shape ──
alter table grants_made add column if not exists source_id        uuid references network_sources(id) on delete set null;
alter table grants_made add column if not exists source_url       text;
alter table grants_made add column if not exists program_category text;
alter table grants_made add column if not exists geography        text;
alter table grants_made add column if not exists funder_org_id    uuid references network_organizations(id) on delete set null;
alter table grants_made add column if not exists recipient_org_id uuid references network_organizations(id) on delete set null;
create index if not exists grants_made_funder_org_idx    on grants_made (funder_org_id);
create index if not exists grants_made_recipient_org_idx on grants_made (recipient_org_id);

create or replace view network_funding_events as
select g.id,
       g.funder_org_id, g.recipient_org_id,
       fo.name as funder_name, ro.name as recipient_name,
       g.fiscal_year as grant_year, g.amount, g.purpose,
       g.program_category, g.geography,
       g.source, g.source_url, g.source_id, g.confidence, g.data_freshness
from grants_made g
left join network_organizations fo on fo.id = g.funder_org_id
left join network_organizations ro on ro.id = g.recipient_org_id;

-- ── 6. Peer set with similarity components ─────────────────────────────────
create table if not exists network_peer_orgs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  organization_id  uuid not null references network_organizations(id) on delete cascade,
  similarity       numeric not null default 0 check (similarity >= 0 and similarity <= 1),
  components       jsonb not null default '{}'::jsonb,   -- {program, geography, population, size, mission}
  relevant_funders jsonb not null default '[]'::jsonb,   -- [{organization_id, name, events, last_year}]
  source_id        uuid references network_sources(id) on delete set null,
  computed_at      timestamptz not null default now(),
  unique (org_id, organization_id)
);

-- ── 7. Leads: scoring, explanation, pipeline ───────────────────────────────
alter table network_leads add column if not exists lead_type           text not null default 'person' check (lead_type in ('person','organization'));
alter table network_leads add column if not exists target_org_id       uuid references network_organizations(id) on delete set null;
alter table network_leads add column if not exists opportunity_score   numeric check (opportunity_score >= 0 and opportunity_score <= 100);
alter table network_leads add column if not exists evidence_confidence text check (evidence_confidence in ('Low','Medium','High'));
alter table network_leads add column if not exists score_breakdown     jsonb not null default '{}'::jsonb;
alter table network_leads add column if not exists explanation         jsonb;          -- AI-written, every bullet keyed to evidence ids
alter table network_leads add column if not exists insight_type        text;
alter table network_leads add column if not exists pipeline_status     text not null default 'NEW' check (pipeline_status in (
  'NEW','RESEARCHING','INTRODUCTION_NEEDED','INTRO_REQUESTED','CONTACTED','MEETING','PROPOSAL',
  'AWAITING_DECISION','WON','LOST','DEFERRED','NOT_A_FIT'));
alter table network_leads add column if not exists owner               text;
alter table network_leads add column if not exists next_action         text;
alter table network_leads add column if not exists next_action_date    date;
alter table network_leads add column if not exists outcome             text;
alter table network_leads add column if not exists dismissal_reason    text;
alter table network_leads add column if not exists updated_at          timestamptz not null default now();
-- Organization-target leads have no person; relax the old NOT NULL.
alter table network_leads alter column person_id drop not null;
alter table network_leads drop constraint if exists network_leads_person_id_via_org_key;
create unique index if not exists network_leads_target_uq on network_leads (
  org_id, via_org,
  coalesce(person_id,    '00000000-0000-0000-0000-000000000000'),
  coalesce(target_org_id,'00000000-0000-0000-0000-000000000000'));

create table if not exists network_actions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  lead_id      uuid not null references network_leads(id) on delete cascade,
  action       text not null,      -- status_change | note | assign | next_action | outcome | dismiss
  status       text,               -- pipeline_status after the action, when applicable
  assigned_to  text,
  notes        text,
  actor        text,               -- user email
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists network_actions_lead_idx on network_actions (lead_id, created_at desc);

-- ── 8. Multi-hop insights ──────────────────────────────────────────────────
create table if not exists network_insights (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  insight_type text not null check (insight_type in (
                 'Untapped Funder','Warm Introduction','Shared Employer','Shared Board','Funder Cluster',
                 'Corporate Giving Opportunity','Emerging Funder','Repeated Peer Funder',
                 'Dormant Relationship','High-Confidence Path')),
  title        text not null,
  summary      text,
  path         jsonb not null default '[]'::jsonb,   -- ordered [{kind:'person'|'org'|'edge', id, label}]
  score        numeric not null default 0,
  confidence   text not null default 'Medium' check (confidence in ('Low','Medium','High')),
  evidence     jsonb not null default '[]'::jsonb,   -- source_ids + row ids
  lead_id      uuid references network_leads(id) on delete set null,
  generated_at timestamptz not null default now(),
  dismissed_at timestamptz
);
create index if not exists network_insights_org_idx on network_insights (org_id, score desc);

-- ── 9. Spend ledgers on refresh runs (D5) ──────────────────────────────────
alter table network_refresh_runs add column if not exists categories        text[] not null default '{}';
alter table network_refresh_runs add column if not exists rapidapi_credits  int not null default 0;
alter table network_refresh_runs add column if not exists claude_micro_cents int not null default 0;
alter table network_refresh_runs add column if not exists relationships_found int not null default 0;
alter table network_refresh_runs add column if not exists funding_events_found int not null default 0;

-- ── 10. RLS: service-role only, like every cyc_* / network_* table ─────────
do $$
declare t text;
begin
  foreach t in array array['network_sources','network_organizations','network_educations','network_boards',
                           'network_relationships','network_peer_orgs','network_actions','network_insights']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "service_role_only_%s" on %I', t, t);
    execute format('create policy "service_role_only_%s" on %I using (false) with check (false)', t, t);
  end loop;
end $$;

-- ── 11. Seed the known sources + relabel the hand-curated funding edges ────
insert into network_sources (source_type, source_name, source_url, confidence, raw_reference)
select v.* from (values
  ('seed',         'CYC funder graph seed v1 (hand-curated, no per-edge citation)', null, 0.6, 'lib/graph/seed-cyc-graph.ts'),
  ('cyc_workbook', 'Foundation Cultivation List FY27 (CYC)',                       null, 0.85, 'Foundation Cultivation List FY27(Sheet1).csv'),
  ('cyc_workbook', 'Funder Prospecting Master File (eo_il.xlsx, Claude-assisted)', null, 0.75, 'eo_il.xlsx'),
  ('instrumentl',  'Instrumentl export — CYC outcomes',                            null, 0.95, 'Instrumentl Data.xlsx'),
  ('irs_bmf',      'IRS Exempt Organizations BMF — Illinois',                       'https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf', 0.95, 'eo_il sheet'),
  ('cyc_site',     'Chicago Youth Centers — Our Boards',                            'https://www.chicagoyouthcenters.org/cyc-boards', 0.95, 'public roster page')
) as v(source_type, source_name, source_url, confidence, raw_reference)
where not exists (select 1 from network_sources s where s.raw_reference = v.raw_reference);

-- Seed edges are real relationships but were never cited; cap their
-- confidence until a citation is attached (Phase 3 re-sources them).
update grants_made g
set source_id  = s.id,
    confidence = least(g.confidence, 0.6)
from network_sources s
where s.raw_reference = 'lib/graph/seed-cyc-graph.ts'
  and g.source = 'cyc_graph_seed_v1'
  and g.source_id is null;
