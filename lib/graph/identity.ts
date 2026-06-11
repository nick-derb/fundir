/**
 * Recipient identity resolution — Phase 2C.
 *
 * Decision 3 from PHASE_0_PLAN.md §6: EIN-first; when no EIN matches,
 * fuzzy-match by name + state + NTEE. Returns a confidence score that
 * downstream grants_made.confidence multiplies through, so low-quality
 * matches naturally down-weight in the Phase 3 funder-affinity factor.
 *
 * Fuzzy strategy:
 *  - candidate pool from the trigram index (lib/graph/repo.ts)
 *  - per-candidate score = normalized name similarity (0-1)
 *                          + 0.15 state match bonus
 *                          + 0.10 NTEE-prefix match bonus
 *                          capped at 1.0
 *  - accept the top candidate iff score >= 0.70 (the threshold from
 *    Decision 3). Below that, insert a fresh recipient row and let
 *    confidence flag the noise.
 *
 * The identity layer is the bottleneck for 990-PF ingestion quality —
 * most foundation grant schedules are name-only. Confidence < 1.0 is
 * normal, not an alarm.
 */

import { findRecipientByEin, findRecipientCandidates, upsertRecipient } from './repo';
import type { RecipientRow } from './types';

export interface ResolveRecipientInput {
  ein?:        string | null;
  name:        string;
  state?:      string | null;
  ntee_code?:  string | null;
  /** Extra metadata to persist on a newly-inserted recipient row. */
  metadata?:   Record<string, unknown>;
}

export interface ResolvedRecipient {
  recipient:  RecipientRow;
  confidence: number;
  source:     'ein-exact' | 'fuzzy' | 'inserted';
  /** When fuzzy, the score breakdown for debugging. */
  scoring?:   {
    name_sim:    number;
    state_match: boolean;
    ntee_match:  boolean;
    total:       number;
  };
}

// Threshold below which we don't trust a fuzzy match. Decision 3.
const FUZZY_ACCEPT_THRESHOLD = 0.70;

// Tokens stripped during name normalization. These appear in nearly
// every recipient name and would otherwise inflate similarity.
const STOPWORDS = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co',
  'foundation', 'fund', 'fdn', 'org',
  'the', 'of', 'and', '&',
  'llc', 'ltd', 'plc',
]);

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * Jaccard similarity over token sets. Robust to "Inc.", "The", and
 * ordering variations. Returns 0 when one side is empty rather than
 * NaN.
 */
function nameSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function scoreCandidate(
  candidate: RecipientRow,
  input: ResolveRecipientInput,
): { name_sim: number; state_match: boolean; ntee_match: boolean; total: number } {
  const name_sim = nameSimilarity(candidate.name, input.name);
  const state_match = !!(
    input.state &&
    typeof candidate.metadata?.state === 'string' &&
    (candidate.metadata.state as string).toUpperCase() === input.state.toUpperCase()
  );
  const ntee_match = !!(
    input.ntee_code &&
    candidate.ntee_code &&
    candidate.ntee_code.startsWith(input.ntee_code.slice(0, 1))
    // Only the first NTEE letter (major group) — too strict otherwise.
  );
  const total = Math.min(
    1.0,
    name_sim
    + (state_match ? 0.15 : 0)
    + (ntee_match  ? 0.10 : 0),
  );
  return { name_sim, state_match, ntee_match, total };
}

/**
 * Resolve an input to a recipient row. Either returns an existing one
 * (EIN-exact, or fuzzy above threshold) or inserts a new row and
 * returns it. NEVER throws on a no-match — that case is the common
 * one for 990-PF name-only entries.
 */
export async function resolveRecipient(input: ResolveRecipientInput): Promise<ResolvedRecipient> {
  // Step 1: EIN-exact.
  if (input.ein) {
    const hit = await findRecipientByEin(input.ein);
    if (hit) {
      return { recipient: hit, confidence: 1.0, source: 'ein-exact' };
    }
    // EIN supplied but no existing recipient → insert canonically.
    const inserted = await upsertRecipient({
      ein:       input.ein,
      name:      input.name,
      ntee_code: input.ntee_code ?? null,
      metadata:  { ...(input.metadata ?? {}), ...(input.state ? { state: input.state } : {}) },
    });
    return { recipient: inserted, confidence: 1.0, source: 'inserted' };
  }

  // Step 2: fuzzy candidate pool.
  const candidates = await findRecipientCandidates(input.name, {
    state:       input.state,
    ntee_prefix: input.ntee_code ? input.ntee_code.slice(0, 1) : null,
    limit:       8,
  });

  let best: { candidate: RecipientRow; scoring: ReturnType<typeof scoreCandidate> } | null = null;
  for (const c of candidates) {
    const scoring = scoreCandidate(c, input);
    if (!best || scoring.total > best.scoring.total) {
      best = { candidate: c, scoring };
    }
  }

  if (best && best.scoring.total >= FUZZY_ACCEPT_THRESHOLD) {
    return {
      recipient:  best.candidate,
      confidence: best.scoring.total,
      source:     'fuzzy',
      scoring:    best.scoring,
    };
  }

  // Step 3: insert a fresh recipient. confidence on this recipient is
  // 1.0 (it's canonically itself); confidence on the *edge* in
  // grants_made stays high — the doubt is whether this is the same
  // org as some other name-only entry we'll see later.
  const inserted = await upsertRecipient({
    ein:       null,
    name:      input.name,
    ntee_code: input.ntee_code ?? null,
    metadata:  { ...(input.metadata ?? {}), ...(input.state ? { state: input.state } : {}) },
  });
  return { recipient: inserted, confidence: 1.0, source: 'inserted' };
}
