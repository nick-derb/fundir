-- org_goals: organization-wide fundraising goals shown on the dashboard's
-- "FY goals" card and editable via its modal. Shared across the whole org
-- (visible/editable to everyone in the tenant), not per-user.
create table if not exists org_goals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  label       text not null,
  current     numeric not null default 0,
  target      numeric not null default 0,
  unit        text not null default 'count' check (unit in ('percent','count','currency')),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists org_goals_org_idx on org_goals(org_id);

-- RLS: service role only (all access via server routes keyed by the session's org).
alter table org_goals enable row level security;

create policy "service_role_only_org_goals" on org_goals
  using (false) with check (false);
