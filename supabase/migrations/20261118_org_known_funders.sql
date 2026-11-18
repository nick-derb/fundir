-- Funders a tenant already has a relationship with, recorded by the tenant:
-- one click on a lead ("Past funder" / "Current funder") or a Raiser's Edge
-- export uploaded through the Data Hub. Grant trackers miss many of these
-- (funders that just send money, or that gave before the tracked years), so
-- without this the network kept pitching them as untapped prospects.
--
-- Keyed by the funder's normalized name so an imported funder that is not yet
-- in the relationship graph is still recognised when a lead for it appears.
-- network_org_id is filled when the name resolves to one graph node; the app
-- then also writes an existing_cyc_relationship edge (source_type
-- 'known_funder'), which the untapped-funder generator already excludes and
-- which the derived-edge rebuild (derived:% only) leaves alone.

create table if not exists org_known_funders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  normalized_name text not null,
  network_org_id  uuid references network_organizations(id) on delete set null,
  relationship    text not null check (relationship in ('current', 'past')),
  last_gift_year  integer check (last_gift_year between 1900 and 2100),
  last_gift_date  date,
  last_gift_amount numeric,
  total_given     numeric,
  gift_count      integer,
  source          text not null check (source in ('manual', 'raisers_edge', 'feedback')),
  notes           text,
  recorded_by     text,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (org_id, normalized_name)
);

create index if not exists org_known_funders_org_idx on org_known_funders (org_id);
create index if not exists org_known_funders_network_org_idx on org_known_funders (network_org_id);

-- Server-side access only (service role), like the rest of the network tables' writes.
alter table org_known_funders enable row level security;
