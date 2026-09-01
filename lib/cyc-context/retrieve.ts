import { createServerClient } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';

export interface ContextHit {
  kind: string;
  title: string | null;
  text: string;
  score: number;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Retrieve the top-k CYC knowledge chunks most relevant to a query. The chunk
 * set is small (dozens per org), so we embed the query and cosine in-process
 * rather than maintaining a pgvector RPC.
 */
export async function retrieveCycContext(orgId: string, query: string, k = 6): Promise<ContextHit[]> {
  if (!orgId || !query.trim()) return [];
  const db = createServerClient();
  const { data, error } = await db
    .from('cyc_context_chunks')
    .select('kind, title, text, embedding')
    .eq('org_id', orgId);
  if (error || !data || data.length === 0) return [];

  const qvec = await generateEmbedding(query);
  return (data as Array<{ kind: string; title: string | null; text: string; embedding: number[] }>)
    .map(c => ({ kind: c.kind, title: c.title, text: c.text, score: cosine(qvec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
