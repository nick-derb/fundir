-- Peer-organization staff: which peers CYC wants the development and executive
-- staff of, and a record of each LinkedIn employee scan (so a re-run never
-- re-spends credits on a peer already scanned). The people themselves live in
-- network_people with kind 'peer_staff', kept apart from CYC's own contacts.
alter table network_peer_orgs add column if not exists staff_scan boolean not null default false;
alter table network_peer_orgs add column if not exists staff_scan_name text;   -- the name LinkedIn knows the org by

create table if not exists network_peer_scans (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  peer_organization_id uuid not null references network_organizations(id) on delete cascade,
  company              text not null,
  linkedin_company_id  text,
  searches             jsonb not null default '[]'::jsonb,   -- [{keyword, hits, kept}]
  hits                 int  not null default 0,
  kept                 int  not null default 0,
  status               text not null default 'done',         -- done | no_company | error
  note                 text,
  scanned_at           timestamptz not null default now(),
  unique (org_id, peer_organization_id)
);
create index if not exists network_peer_scans_org_idx on network_peer_scans (org_id, scanned_at);
alter table network_peer_scans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'network_peer_scans' and policyname = 'service_role_only_network_peer_scans') then
    create policy "service_role_only_network_peer_scans" on network_peer_scans using (false) with check (false);
  end if;
end $$;
