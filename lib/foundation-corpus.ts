/**
 * In-process foundation corpus — Tier 2E.
 *
 * Foundations live in foundation-intelligence.ts as static seed records.
 * To unify them with federal grants in the natural-language search feed,
 * we treat each foundation as a "grant" with a rolling deadline, the
 * foundation's grantRange as award_floor/ceiling, and a one-shot
 * embedding built from focus areas + geography + typical award.
 *
 * Embeddings are computed on first use and cached in-process. ~15
 * embeddings @ ~$0.000026 = $0.0004 per cold start. Negligible.
 *
 * The shape returned matches CorpusGrant (the same type the federal
 * grant retrieval returns) so the search API can interleave both
 * sources in one ranked feed without UI branching.
 */

import { generateEmbedding } from '@/lib/embeddings';
import { SEED_FOUNDATIONS } from '@/lib/foundation-intelligence';
import { cosineSimilarity } from '@/lib/matching';
import type { CorpusGrant } from '@/lib/corpus-search';

interface FoundationRecord {
  id:           string;
  title:        string;
  agency_name:  string;
  agency_code:  string;
  city:         string;
  state:        string;
  focusAreas:   readonly string[];
  geographic:   readonly string[];
  avgGrant:     number;
  grantMin:     number;
  grantMax:     number;
  totalGiving:  number;
  deadlinePattern: string;
  applicationUrl: string | null;
  embedding:    number[];
}

let cachedRecords: FoundationRecord[] | null = null;
let inflight: Promise<FoundationRecord[]> | null = null;

function buildFoundationText(f: typeof SEED_FOUNDATIONS[number]): string {
  return [
    `Foundation: ${f.name}`,
    `Based in ${f.city}, ${f.state}.`,
    `Focus areas: ${f.focusAreas.join(', ')}.`,
    `Geographic focus: ${f.geographicFocus.join(', ')}.`,
    `Typical grant size: $${f.avgGrantAmount.toLocaleString()} (range $${f.grantRange.min.toLocaleString()} to $${f.grantRange.max.toLocaleString()}).`,
    `Annual giving: $${f.totalGrantsGiven.toLocaleString()}.`,
    `Deadline pattern: ${f.deadlinePattern}.`,
  ].join('\n');
}

async function ensureFoundationRecords(): Promise<FoundationRecord[]> {
  if (cachedRecords) return cachedRecords;
  if (inflight) return inflight;
  inflight = (async () => {
    const records = await Promise.all(SEED_FOUNDATIONS.map(async f => {
      const embedding = await generateEmbedding(buildFoundationText(f));
      // Synthetic id so the foundation row can be told apart from any
      // real grant_opportunities.id (which is a uuid).
      const id = `foundation:${f.ein}`;
      return {
        id,
        title:           f.name,
        agency_name:     `${f.name} (foundation, ${f.city}, ${f.state})`,
        agency_code:     'FOUNDATION',
        city:            f.city,
        state:           f.state,
        focusAreas:      f.focusAreas,
        geographic:      f.geographicFocus,
        avgGrant:        f.avgGrantAmount,
        grantMin:        f.grantRange.min,
        grantMax:        f.grantRange.max,
        totalGiving:     f.totalGrantsGiven,
        deadlinePattern: f.deadlinePattern,
        applicationUrl:  f.applicationUrl,
        embedding,
      };
    }));
    cachedRecords = records;
    inflight = null;
    return records;
  })();
  return inflight;
}

/**
 * Top-K foundations by cosine similarity to the query embedding,
 * shaped exactly like a CorpusGrant so the natural-language search
 * route can interleave them with federal grants and apply the same
 * post-filter pass.
 */
export async function searchFoundationsByEmbedding(
  queryEmbedding: number[],
  k: number = 20,
): Promise<CorpusGrant[]> {
  const records = await ensureFoundationRecords();
  const scored  = records
    .map(r => ({ r, similarity: cosineSimilarity(queryEmbedding, r.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);

  return scored.map(({ r, similarity }) => ({
    id:           r.id,
    title:        r.title,
    agency_name:  r.agency_name,
    agency_code:  r.agency_code,
    aln_codes:    null,
    close_date:   null,                  // rolling — foundations don't have hard close dates
    extracted_fields: {
      award_floor:    r.grantMin,
      award_ceiling:  r.grantMax,
      program_areas:  Array.from(r.focusAreas),
      geographic_scope: 'state',
      geographic_states: r.state === 'IL' ? ['IL'] : [],
    },
    similarity,
    composite_score: null,
    pipeline_stage:  null,
    match_id:        null,
  }));
}

/**
 * Build a short funder-behavior signal for a foundation row in the
 * search feed. Tier 2F: concrete, demoable bullets that Instrumentl's
 * generic match summary can't produce.
 *
 * Returns up to one phrase (caller adds it to the row's reason string).
 */
export async function foundationSignal(grantId: string): Promise<string | null> {
  // grantId is "foundation:<ein>" for foundation rows. Anything else has
  // no foundation signal to add.
  if (!grantId.startsWith('foundation:')) return null;
  const records = await ensureFoundationRecords();
  const ein = grantId.slice('foundation:'.length);
  const r = records.find(rec => rec.id === grantId || rec.id.endsWith(ein));
  if (!r) return null;

  // Prefer the most concrete signal: rolling deadline > avg grant fit.
  if (r.deadlinePattern === 'rolling') {
    return `Rolling deadline · avg grant $${Math.round(r.avgGrant / 1000)}K`;
  }
  if (r.deadlinePattern === 'annual-spring') {
    return `Spring LOI window · avg grant $${Math.round(r.avgGrant / 1000)}K`;
  }
  if (r.deadlinePattern === 'annual-fall') {
    return `Fall LOI window · avg grant $${Math.round(r.avgGrant / 1000)}K`;
  }
  if (r.deadlinePattern === 'cycle') {
    return `Cycle-based · avg grant $${Math.round(r.avgGrant / 1000)}K`;
  }
  return `Avg grant $${Math.round(r.avgGrant / 1000)}K`;
}
