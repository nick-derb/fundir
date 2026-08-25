-- profiles: per-user identity captured by the first-run onboarding flow (/welcome).
--
-- Auth + org membership already live in auth.users + user_organizations; this
-- table holds the human profile (name, photo, role, focus areas) that nothing
-- stored before. `onboarded_at` is the first-run gate: when set, the user skips
-- /welcome on subsequent logins.
--
-- avatar_url is a client-resized data URL for v1 (no Storage bucket yet).
create table if not exists profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  first_name    text,
  last_name     text,
  display_name  text,
  avatar_url    text,
  role          text,
  focus         text[] not null default '{}',
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS: service role only, same posture as org_integrations / data_hub_state.
-- All reads/writes go through server routes using the service-role key + the
-- authenticated session's user id.
alter table profiles enable row level security;

create policy "service_role_only_profiles" on profiles
  using (false) with check (false);
