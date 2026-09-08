// Incremental document ingestion for the advisor RAG index.
//
// When a document lands in the Data Hub (OneDrive), we extract its text, split it
// into retrievable chunks, embed each, and upsert them into cyc_context_chunks
// under the document's OneDrive item id (source_doc_id). Re-uploading or deleting
// a document replaces/removes exactly its chunks — no full re-embed of the org.
//
// This is the unstructured half of the hybrid design: narrative docs (board
// minutes, strategic plans, program reports, PDFs, narrative spreadsheets) become
// searchable meaning. Exact figures (pipeline, deadlines, financials) stay in
// their tables and are read live by agent tools — never embedded as lossy prose.

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import { extractContent, downloadFileBase64, type GraphFile } from '@/lib/microsoft-graph';

export const DOCUMENT_KIND = 'document';
const CHUNK_SIZE = 1400;
// A single upload shouldn't be able to spend unbounded embedding calls; cap the
// number of chunks we index per document (≈ 90k chars of a very large file).
const MAX_CHUNKS_PER_DOC = 64;
// Cheap model for turning a PDF into plain text for embedding.
const PDF_MODEL = 'claude-haiku-4-5-20251001';

function splitText(s: string, size = CHUNK_SIZE): string[] {
  const clean = s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const out: string[] = [];
  for (let i = 0; i < clean.length && out.length < MAX_CHUNKS_PER_DOC; i += size) {
    out.push(clean.slice(i, i + size));
  }
  return out;
}

const ext = (name: string) => name.toLowerCase().slice(name.lastIndexOf('.'));
const TEXTUAL = new Set(['.xlsx', '.xls', '.docx', '.doc', '.pptx', '.csv', '.txt', '.md', '.json', '.tsv']);
const isPdf = (name: string) => ext(name) === '.pdf';

/** True for file types we can turn into indexable text. */
export function isIndexableDoc(name: string): boolean {
  return TEXTUAL.has(ext(name)) || isPdf(name);
}

/**
 * Pull plain, embeddable text out of a OneDrive document. Text-based formats go
 * through the existing Graph extractors; PDFs are transcribed by Claude natively
 * (no server-side PDF library needed). Best-effort — returns '' if unreadable.
 */
export async function extractIndexableText(token: string, file: { id: string; name: string }): Promise<string> {
  try {
    if (isPdf(file.name)) return await extractPdfText(token, file.id);
    if (!TEXTUAL.has(ext(file.name))) return '';
    const gf: GraphFile = { id: file.id, name: file.name, lastModifiedDateTime: '' };
    const text = await extractContent(token, gf);
    return (text ?? '').trim();
  } catch {
    return '';
  }
}

async function extractPdfText(token: string, itemId: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  const { base64, bytes } = await downloadFileBase64(token, itemId);
  // Graph's document block accepts PDFs comfortably to ~32MB; skip huge scans.
  if (bytes > 24_000_000) return '';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: PDF_MODEL,
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Transcribe this document to clean plain text for search indexing. Preserve headings, names, dates, figures, and tables (as readable rows). Output only the transcription — no preamble, no commentary.' },
      ],
    }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

/** Remove every chunk that came from one document. */
export async function removeDocumentChunks(orgId: string, sourceDocId: string): Promise<void> {
  const db = createServerClient();
  await db.from('cyc_context_chunks').delete().eq('org_id', orgId).eq('source_doc_id', sourceDocId);
}

/**
 * Index (or re-index) one uploaded document into the RAG store. Replaces any
 * existing chunks for the same source_doc_id, so it's safe to call on every
 * upload/refresh. Returns the number of chunks embedded (0 = unreadable/skipped).
 */
export async function indexDocument(
  orgId: string,
  token: string,
  file: { id: string; name: string },
): Promise<{ chunks: number; skipped?: string }> {
  if (!isIndexableDoc(file.name)) return { chunks: 0, skipped: 'unsupported type' };

  const text = await extractIndexableText(token, file);
  const pieces = splitText(text);
  const db = createServerClient();

  // Replace this document's chunks atomically-ish: clear, then insert fresh.
  await removeDocumentChunks(orgId, file.id);
  if (pieces.length === 0) return { chunks: 0, skipped: 'no extractable text' };

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < pieces.length; i++) {
    const body = pieces[i];
    const embedding = await generateEmbedding(`${file.name}. ${body}`);
    rows.push({
      org_id: orgId,
      kind: DOCUMENT_KIND,
      title: pieces.length > 1 ? `${file.name} (${i + 1}/${pieces.length})` : file.name,
      text: body,
      embedding,
      source_doc_id: file.id,
      source_name: file.name,
      chunk_ix: i,
    });
  }
  const { error } = await db.from('cyc_context_chunks').insert(rows);
  if (error) throw new Error(`index insert failed: ${error.message}`);
  return { chunks: rows.length };
}

/**
 * Reconcile the whole Documents folder against the index: index anything new or
 * changed, drop chunks for documents that no longer exist. Used by the manual
 * "reindex documents" admin action and a nightly backstop.
 */
export async function reconcileDocuments(
  orgId: string,
  token: string,
  liveDocs: Array<{ id: string; name: string }>,
): Promise<{ indexed: number; removed: number }> {
  const db = createServerClient();
  const { data: existing } = await db
    .from('cyc_context_chunks')
    .select('source_doc_id')
    .eq('org_id', orgId)
    .eq('kind', DOCUMENT_KIND);

  const liveIds = new Set(liveDocs.map(d => d.id));
  const indexedIds = new Set((existing ?? []).map(r => r.source_doc_id as string).filter(Boolean));

  // Remove chunks for documents deleted from OneDrive.
  let removed = 0;
  for (const id of indexedIds) {
    if (!liveIds.has(id)) { await removeDocumentChunks(orgId, id); removed++; }
  }
  // Index documents not yet in the store.
  let indexed = 0;
  for (const d of liveDocs) {
    if (indexedIds.has(d.id) || !isIndexableDoc(d.name)) continue;
    const { chunks } = await indexDocument(orgId, token, d);
    if (chunks > 0) indexed++;
  }
  return { indexed, removed };
}
