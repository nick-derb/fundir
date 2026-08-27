-- user_integrations: per-USER OAuth tokens (distinct from org_integrations,
-- which holds the org's shared Microsoft 365 / OneDrive connection). Used for
-- each person's own Microsoft calendar so the dashboard shows THEIR schedule,
-- not the single connecting account's.
create table if not exists user_integrations (
  user_id           uuid not null references auth.users(id) on delete cascade,
  provider          text not null check (provider in ('google', 'microsoft')),
  access_token      text not null,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,
  email             text,
  connected_at      timestamptz not null default now(),
  primary key (user_id, provider)
);

-- RLS: service role only (all access via server routes keyed by the session user).
alter table user_integrations enable row level security;

create policy "service_role_only_user_integrations" on user_integrations
  using (false) with check (false);
