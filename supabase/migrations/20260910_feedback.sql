-- Beta feedback: bug reports, data-correction requests and ideas from CYC users,
-- queued for the admin. Data requests carry the record they concern so a
-- correction can be applied with provenance rather than as a silent edit.
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid,
  user_email  text,
  user_name   text,
  kind        text not null check (kind in ('bug','data','idea')),
  page        text,                         -- app path where it was raised
  title       text not null,
  details     text,
  expected    text,                         -- bugs: what should have happened
  record_ref  jsonb,                        -- data: {entity, name, field, current, proposed, source}
  client      jsonb,                        -- viewport / user agent, for bugs
  attachments jsonb not null default '[]'::jsonb, -- [{name, path, size, type}] in the private 'feedback' storage bucket
  status      text not null default 'new' check (status in ('new','triaged','in_progress','done','wont_fix')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists feedback_org_idx on feedback (org_id, status, created_at desc);
alter table feedback enable row level security;
drop policy if exists "service_role_only_feedback" on feedback;
create policy "service_role_only_feedback" on feedback using (false) with check (false);

-- Private bucket for attachments (50 MB per file). Uploads use signed upload
-- URLs minted by the server; downloads use short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('feedback', 'feedback', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
