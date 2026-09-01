-- RAG knowledge base for the Fundir advisor: embedded chunks of CYC's own
-- proprietary data (real win/loss history, board connections, cultivation notes,
-- financial profile, peers). The advisor retrieves from this so its answers are
-- grounded in CYC's reality, and it gets smarter every time the index is rebuilt
-- after new outcomes/notes land. Embeddings stored as jsonb (small per-org set;
-- cosine done in-process — no pgvector RPC needed).
create table if not exists cyc_context_chunks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  kind       text not null,   -- track_record | board | cultivation | financial | peers | metrics
  title      text,
  text       text not null,
  embedding  jsonb not null,  -- number[1536]
  updated_at timestamptz not null default now()
);
create index if not exists cyc_context_chunks_org_idx on cyc_context_chunks (org_id, kind);

alter table cyc_context_chunks enable row level security;
create policy "service_role_only_cyc_context_chunks" on cyc_context_chunks using (false) with check (false);
