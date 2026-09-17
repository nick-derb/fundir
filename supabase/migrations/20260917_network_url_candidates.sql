-- Candidate LinkedIn profile URLs found by public web search (no provider
-- credits). A candidate is promoted to network_people.linkedin_url only after
-- the live profile corroborates the person (name + a known organization) in
-- the refresh's "candidates" step; otherwise it is rejected or left ambiguous.
create table if not exists network_url_candidates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  person_id   uuid not null references network_people(id) on delete cascade,
  url         text not null,
  source      text not null default 'web_search',
  query       text,
  evidence    text,                       -- search-result title/snippet that pointed here
  rank        integer not null default 1, -- 1 = strongest candidate for this person
  status      text not null default 'pending',  -- pending | verified | rejected | ambiguous | error
  note        text,
  checked_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (person_id, url)
);
create index if not exists network_url_candidates_pending_idx on network_url_candidates (org_id, status, rank);
alter table network_url_candidates enable row level security;

-- Per-run count of URLs found by name + employer search.
alter table network_refresh_runs add column if not exists urls_found integer not null default 0;
