/**
 * Corpus vector search — Tier 1B of the grant-search redesign.
 *
 * Instead of discovery being bounded to ~32 grants pulled from grants.gov
 * on every run, this lets the app search the entire stored corpus by
 * cosine similarity. A user-facing query (or the org's program
 * embeddings) becomes a vector that ranks every embedded grant on file.
 *
 * Backed by the pgvector HNSW index + nearest_grants / nearest_grants_for_org
 * RPCs created in supabase/tier1b_corpus_search.sql.
 */

import { createServerClient } from '@/lib/supabase';
import type { ExtractedFields } from '@/types';

export interface CorpusGrant {
  id:               string;
  title:            string;
  agency_name:      string;
  agency_code:      string;
  aln_codes:        string[] | null;
  close_date:       string | null;
  extracted_fields: ExtractedFields;
  /** Cosine similarity to the query embedding. Range [0, 1]. */
  similarity:       number;
  /** Composite score from match_results if the calling org has seen this grant. */
  composite_score?: number | null;
  /** Pipeline stage from match_results if the calling org has seen this grant. */
  pipeline_stage?:  string | null;
  /** match_results row id (lets the UI link straight to /grant/{id}?match={match_id}). */
  match_id?:        string | null;
}

export interface CorpusSearchOptions {
  /** If supplied, joins match_results to surface stored composite_score + pipeline_stage. */
  orgId?:         string;
  /** Minimum grant close_date (ISO yyyy-mm-dd). Filters out already-closed grants. */
  minCloseDate?:  string;
  /** Max number of results. Defaults to 50. */
  k?:             number;
}

function toPgVectorLiteral(embedding: number[]): string {
  // pgvector accepts a string '[v1,v2,...]' which gets auto-cast to
  // vector(N) when the parameter type is declared on the function.
  return `[${embedding.join(',')}]`;
}

/**
 * Top-K nearest grants by cosine similarity. If options.orgId is supplied,
 * returns the stored composite_score and pipeline_stage from match_results
 * (NULL columns for grants the org has not seen yet).
 *
 * Use this from the natural-language search bar (Tier 2D) AND from any
 * org-level "show me my best matches" query.
 */
export async function searchCorpusByEmbedding(
  queryEmbedding: number[],
  options: CorpusSearchOptions = {},
): Promise<CorpusGrant[]> {
  const k             = options.k ?? 50;
  const queryVector   = toPgVectorLiteral(queryEmbedding);
  const minCloseDate  = options.minCloseDate ?? null;

  const db = createServerClient();

  if (options.orgId) {
    const { data, error } = await db.rpc('nearest_grants_for_org', {
      query_embedding: queryVector,
      p_org_id:        options.orgId,
      k,
      min_close_date:  minCloseDate,
    });
    if (error) {
      console.error('[searchCorpus] nearest_grants_for_org failed:', error.message);
      return [];
    }
    return (data as CorpusGrant[]) ?? [];
  }

  const { data, error } = await db.rpc('nearest_grants', {
    query_embedding: queryVector,
    k,
    min_close_date:  minCloseDate,
  });
  if (error) {
    console.error('[searchCorpus] nearest_grants failed:', error.message);
    return [];
  }
  return (data as CorpusGrant[]) ?? [];
}

/**
 * Convenience: search the corpus by running each of the org's program
 * embeddings as a separate query, then merge + dedup, keeping the best
 * similarity per grant. Lets a "show me my best fits" page surface grants
 * that are excellent for ANY program of the org, not just whatever single
 * vector you pass in.
 *
 * Pass the same array you would pass to computeMatchScore.
 */
export async function searchCorpusByProgramEmbeddings(
  programEmbeddings: Array<{ programName: string; embedding: number[]; weight: number }>,
  options: CorpusSearchOptions = {},
): Promise<Array<CorpusGrant & { bestProgram: string }>> {
  const perK = Math.max(10, Math.ceil((options.k ?? 50) / Math.max(programEmbeddings.length, 1)));

  const results = await Promise.all(
    programEmbeddings.map(async pe => {
      const grants = await searchCorpusByEmbedding(pe.embedding, { ...options, k: perK });
      return grants.map(g => ({
        ...g,
        // weight the similarity so a slightly down-weighted "general operating"
        // embedding does not eclipse specific-program matches.
        similarity:   Math.min(1, g.similarity * pe.weight),
        bestProgram:  pe.programName,
      }));
    }),
  );

  // Merge: keep the best (similarity) entry per grant id.
  const merged = new Map<string, CorpusGrant & { bestProgram: string }>();
  for (const list of results) {
    for (const g of list) {
      const existing = merged.get(g.id);
      if (!existing || g.similarity > existing.similarity) {
        merged.set(g.id, g);
      }
    }
  }

  // Final K cap, sorted by similarity desc.
  return Array.from(merged.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.k ?? 50);
}
