-- Organizations table
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  org_code    text not null unique,
  created_at  timestamptz default now()
);

-- User → org mapping
create table if not exists user_organizations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz default now(),
  unique(user_id, org_id)
);

-- Seed CYC org
insert into organizations (name, org_code)
values ('Chicago Youth Centers', 'CYC2026')
on conflict (org_code) do nothing;

-- Enable RLS
alter table organizations enable row level security;
alter table user_organizations enable row level security;

-- Anyone can read organizations (needed for signup validation)
create policy "Public can read orgs"
  on organizations for select
  using (true);

-- Users can only see their own org memberships
create policy "Users see own memberships"
  on user_organizations for select
  using (auth.uid() = user_id);

-- Users can insert their own membership
create policy "Users insert own membership"
  on user_organizations for insert
  with check (auth.uid() = user_id);
