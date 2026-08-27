-- impersonation_audit: an append-only trail of every "view as" (impersonation)
-- session an admin starts or stops. Written server-side only, so we always know
-- who viewed the app as whom, and when.
create table if not exists impersonation_audit (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid not null references auth.users(id) on delete cascade,
  admin_email    text,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_email   text,
  action         text not null check (action in ('start', 'stop')),
  created_at     timestamptz not null default now()
);

create index if not exists impersonation_audit_admin_idx  on impersonation_audit (admin_user_id, created_at desc);
create index if not exists impersonation_audit_target_idx on impersonation_audit (target_user_id, created_at desc);

-- RLS: service role only (all writes/reads via server routes).
alter table impersonation_audit enable row level security;

create policy "service_role_only_impersonation_audit" on impersonation_audit
  using (false) with check (false);
