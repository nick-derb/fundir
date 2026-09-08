-- Extend the advisor RAG index (cyc_context_chunks) to hold chunks that come
-- from UPLOADED DOCUMENTS (Data Hub / OneDrive), not just the structured tables.
-- Each document produces N chunks that all share its source_doc_id (the OneDrive
-- item id), so a re-upload or delete can replace/remove exactly that document's
-- chunks incrementally — without a full re-embed of the whole org index.
alter table cyc_context_chunks add column if not exists source_doc_id text;
alter table cyc_context_chunks add column if not exists source_name   text;
alter table cyc_context_chunks add column if not exists chunk_ix      int;

-- Fast per-document replace/delete.
create index if not exists cyc_context_chunks_srcdoc_idx
  on cyc_context_chunks (org_id, source_doc_id);
