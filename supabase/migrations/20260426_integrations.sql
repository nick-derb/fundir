-- org_integrations: stores OAuth tokens per org per provider
create table if not exists org_integrations (
  id                uuid primary key default gen_random_uuid(),
  org_code          text not null,
  provider          text not null check (provider in ('google', 'microsoft')),
  access_token      text not null,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,
  user_email        text,
  connected_at      timestamptz not null default now(),
  unique (org_code, provider)
);

-- grant_workspaces: links a grant match to a cloud folder
create table if not exists grant_workspaces (
  id          uuid primary key default gen_random_uuid(),
  match_id    text not null,
  provider    text not null check (provider in ('google', 'microsoft')),
  folder_id   text not null,
  folder_url  text,
  created_at  timestamptz not null default now(),
  unique (match_id, provider)
);

-- RLS: service role bypasses, anon blocked
alter table org_integrations enable row level security;
alter table grant_workspaces  enable row level security;

-- No public access — all access goes through service role key
create policy "service_role_only_integrations" on org_integrations
  using (false) with check (false);

create policy "service_role_only_workspaces" on grant_workspaces
  using (false) with check (false);
