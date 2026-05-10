-- Team Collaboration: presence, activity feed, and org chat
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- After running, also go to: Database → Replication → supabase_realtime publication
-- and toggle ON: org_messages, org_activity
-- This enables real-time push for chat and activity without polling.

-- ── Presence (heartbeat-based) ────────────────────────────────────────────────
create table if not exists public.user_presence (
  user_id      uuid references auth.users(id) on delete cascade primary key,
  org_id       uuid references public.organizations(id) on delete cascade not null,
  user_email   text not null,
  last_seen    timestamptz default now() not null,
  current_path text  -- e.g. '/discover', '/pipeline' — shown as "currently viewing Matches"
);

create index if not exists user_presence_org_id_idx on public.user_presence(org_id);
create index if not exists user_presence_last_seen_idx on public.user_presence(last_seen desc);

-- ── Activity feed ─────────────────────────────────────────────────────────────
-- action types: grant_view | pipeline_move | note_added | login | grant_passed | grant_saved
create table if not exists public.org_activity (
  id           uuid default gen_random_uuid() primary key,
  org_id       uuid references public.organizations(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete set null,
  user_email   text not null,
  action       text not null,
  entity_type  text,   -- 'grant'
  entity_id    text,   -- opportunity_id or match UUID
  entity_title text,   -- grant title for display (denormalized for speed)
  metadata     jsonb default '{}'::jsonb,
  -- examples:
  --   pipeline_move: { "from": "discovered", "to": "reviewing" }
  --   grant_view:    { "agency": "HHS", "score": 84 }
  --   note_added:    { "note_preview": "Decided to pass — wrong geography" }
  created_at   timestamptz default now() not null
);

create index if not exists org_activity_org_id_created_idx on public.org_activity(org_id, created_at desc);

-- ── Team chat ─────────────────────────────────────────────────────────────────
create table if not exists public.org_messages (
  id         uuid default gen_random_uuid() primary key,
  org_id     uuid references public.organizations(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete set null,
  user_email text not null,
  content    text not null check (char_length(content) between 1 and 2000),
  -- Future paid upgrade: add thread_id uuid references public.org_messages(id)
  -- Future paid upgrade: add reactions jsonb default '[]'::jsonb
  created_at timestamptz default now() not null
);

create index if not exists org_messages_org_id_created_idx on public.org_messages(org_id, created_at desc);

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table public.user_presence enable row level security;
alter table public.org_activity   enable row level security;
alter table public.org_messages   enable row level security;

-- Presence: visible to org members; each user manages their own row
create policy "presence: org members can view"
  on public.user_presence for select
  using (org_id in (select org_id from public.user_organizations where user_id = auth.uid()));

create policy "presence: user manages own row"
  on public.user_presence for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Activity: org members can view; any org member can log
create policy "activity: org members can view"
  on public.org_activity for select
  using (org_id in (select org_id from public.user_organizations where user_id = auth.uid()));

create policy "activity: org members can insert"
  on public.org_activity for insert
  with check (
    org_id in (select org_id from public.user_organizations where user_id = auth.uid())
    and user_id = auth.uid()
  );

-- Messages: org members can view and send
create policy "messages: org members can view"
  on public.org_messages for select
  using (org_id in (select org_id from public.user_organizations where user_id = auth.uid()));

create policy "messages: org members can send"
  on public.org_messages for insert
  with check (
    org_id in (select org_id from public.user_organizations where user_id = auth.uid())
    and user_id = auth.uid()
  );

-- ── Realtime (enable in dashboard after running this migration) ───────────────
-- alter publication supabase_realtime add table public.org_messages;
-- alter publication supabase_realtime add table public.org_activity;
-- Uncomment the two lines above if your Supabase plan supports programmatic Realtime setup,
-- otherwise enable via Dashboard → Database → Replication.
