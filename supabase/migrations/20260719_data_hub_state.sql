-- data_hub_state: cached OneDrive handles for the CYC Data Hub.
--
-- The hub folder id, workbook id, table name, and documents folder id are
-- STABLE per org — but resolving them from Microsoft Graph costs ~5 sequential
-- round-trips (folder $filter lookups + an Excel workbook-session spin-up).
-- We persist them here so ensureHub()'s discovery runs ONCE per org instead of
-- on every read, cutting a cold Data Hub open from ~10 Graph calls to ~2.
--
-- This is a cache, not a source of truth: if a handle 404s (file moved/renamed
-- in OneDrive), the app deletes the row and re-discovers. Safe to truncate.
create table if not exists data_hub_state (
  org_code      text primary key,
  workbook_id   text not null,
  workbook_url  text,
  table_name    text not null,
  sheet_name    text not null default 'Data',
  docs_id       text not null,
  docs_url      text,
  updated_at    timestamptz not null default now()
);

-- RLS: service role only, same posture as org_integrations.
alter table data_hub_state enable row level security;

create policy "service_role_only_data_hub_state" on data_hub_state
  using (false) with check (false);
