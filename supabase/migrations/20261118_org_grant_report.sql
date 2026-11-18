-- The organization's own grant report for a fiscal year: one row per
-- application (awarded, declined or pending) with funding type, purpose, ask
-- type, requested and awarded amounts. CYC keeps this as a curated workbook
-- (less cluttered than the Instrumentl export), so it is the better source
-- for the year's funding picture: the dashboard reads its totals and
-- breakdowns, awarded funders become current funders on org_known_funders,
-- and open network leads for these funders move to the matching stage.
--
-- An upload replaces the rows for its fiscal year.

create table if not exists org_grant_report (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  fiscal_year      integer not null check (fiscal_year between 2000 and 2100),
  funder           text not null,
  normalized_funder text not null,
  network_org_id   uuid references network_organizations(id) on delete set null,
  status           text not null check (status in ('awarded', 'declined', 'pending')),
  funding          text,             -- Restricted / Unrestricted, as written
  purpose          text,
  purpose_group    text,             -- the part before " - " ("OST - Calumet Heights" → "OST")
  ask_type         text,             -- New / Renewal / Re-engagement, as written
  requested        numeric,
  requested_text   text,             -- non-cash asks: "200 books", "In-kind"
  awarded          numeric,
  notes            text,
  row_order        integer not null default 0,
  imported_at      timestamptz not null default now(),
  imported_by      text
);

create index if not exists org_grant_report_org_fy_idx on org_grant_report (org_id, fiscal_year);
create index if not exists org_grant_report_funder_idx on org_grant_report (org_id, normalized_funder);

alter table org_grant_report enable row level security;

-- The report is a source for the funder record too.
alter table org_known_funders drop constraint if exists org_known_funders_source_check;
alter table org_known_funders add constraint org_known_funders_source_check check (source in ('manual', 'raisers_edge', 'feedback', 'grant_report'));
