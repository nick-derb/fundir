-- Target companies: corporations CYC wants community-affairs and giving
-- contacts at, independent of where the board has worked (grocers, retailers,
-- utilities). Each target is resolved to its LinkedIn company once, searched
-- for community / foundation / local-leadership titles, and the people kept
-- enter network_people as kind 'corporate_contact' — apart from CYC's own
-- people, the funder trustees and the peer staff. One scan row per target so
-- a re-run never re-spends credits on a company already scanned this cycle.
create table if not exists network_target_companies (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  name                 text not null,
  normalized_name      text not null,
  search_name          text,                                   -- the name LinkedIn knows the company by, when different
  category             text not null default 'other',          -- grocery | retail | pharmacy | restaurant | food | utility | airline | bank | other
  organization_id      uuid references network_organizations(id) on delete set null,
  linkedin_company_id  text,
  status               text not null default 'pending',        -- pending | done | no_company | error
  note                 text,
  searches             jsonb not null default '[]'::jsonb,     -- [{keyword, hits, kept}]
  hits                 int  not null default 0,
  kept                 int  not null default 0,
  scanned_at           timestamptz,
  created_by           text,
  created_at           timestamptz not null default now(),
  unique (org_id, normalized_name)
);
create index if not exists network_target_companies_org_idx on network_target_companies (org_id, scanned_at);
alter table network_target_companies enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'network_target_companies' and policyname = 'service_role_only_network_target_companies') then
    create policy "service_role_only_network_target_companies" on network_target_companies using (false) with check (false);
  end if;
end $$;
