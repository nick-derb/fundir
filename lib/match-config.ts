// Per-org AI matching configuration — the score weights and the minimum-score
// floor that Settings edits.
//
// Two things make a saved change show up across the whole app immediately:
//   1. WEIGHTS  — every match_results row stores all six sub-scores, so a new
//      weighting recomputes each composite_score exactly (one SQL statement via
//      the recompute_match_composites function). No re-embedding, no re-extract.
//   2. MIN SCORE — a non-destructive display floor. Rows stay in the database;
//      list surfaces filter with `.gte('composite_score', minScore)`, so raising
//      or lowering the floor reveals/hides grants instantly and reversibly.

import { createServerClient } from '@/lib/supabase';

export interface MatchWeights {
  semantic:    number;
  eligibility: number;
  financial:   number;
  affinity:    number;
  strategic:   number;
  historical:  number;
}

export interface MatchConfig {
  minScore: number;
  weights:  MatchWeights;
}

/** The engine's live weights (lib/matching.ts) — an org that never edits keeps
 *  exactly today's behavior. */
export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  minScore: 32,
  weights: { semantic: 32, eligibility: 20, financial: 18, affinity: 12, strategic: 12, historical: 6 },
};

/** Display metadata for the Settings editor — order matters. */
export const WEIGHT_FIELDS: Array<{ key: keyof MatchWeights; label: string; desc: string }> = [
  { key: 'semantic',    label: 'Semantic weight',    desc: 'Embedding similarity' },
  { key: 'eligibility', label: 'Eligibility weight', desc: 'Org-type and geographic fit' },
  { key: 'financial',   label: 'Financial weight',   desc: '990 health signals' },
  { key: 'affinity',    label: 'Funder affinity',    desc: 'Track record with this funder' },
  { key: 'strategic',   label: 'Strategic weight',   desc: 'Mission keyword alignment' },
  { key: 'historical',  label: 'Historical weight',  desc: 'Award track record' },
];

export const WEIGHT_KEYS = WEIGHT_FIELDS.map(f => f.key);

export function weightSum(w: MatchWeights): number {
  return WEIGHT_KEYS.reduce((t, k) => t + (Number(w[k]) || 0), 0);
}

/** Returns an error message, or null when the config is valid to save. */
export function validateMatchConfig(cfg: MatchConfig): string | null {
  const { minScore, weights } = cfg;
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    return 'Minimum score must be between 0 and 100.';
  }
  for (const k of WEIGHT_KEYS) {
    const v = Number(weights?.[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100) return `${k} weight must be between 0 and 100.`;
  }
  // Allow a hair of float slop, but the UI enforces whole numbers summing to 100.
  const sum = weightSum(weights);
  if (Math.abs(sum - 100) > 0.01) return `Weights must sum to 100% (currently ${sum}%).`;
  return null;
}

export async function getMatchConfig(orgId: string): Promise<MatchConfig> {
  if (!orgId) return DEFAULT_MATCH_CONFIG;
  const db = createServerClient();
  const { data } = await db
    .from('org_match_config')
    .select('min_score, w_semantic, w_eligibility, w_financial, w_affinity, w_strategic, w_historical')
    .eq('org_id', orgId)
    .maybeSingle();
  if (!data) return DEFAULT_MATCH_CONFIG;
  return {
    minScore: Number(data.min_score),
    weights: {
      semantic:    Number(data.w_semantic),
      eligibility: Number(data.w_eligibility),
      financial:   Number(data.w_financial),
      affinity:    Number(data.w_affinity),
      strategic:   Number(data.w_strategic),
      historical:  Number(data.w_historical),
    },
  };
}

/** Persist the config and re-score the org's stored matches under the new
 *  weights. Returns how many match rows were recomputed. */
export async function saveMatchConfig(
  orgId: string,
  cfg: MatchConfig,
  updatedBy?: string,
): Promise<{ rescored: number }> {
  const err = validateMatchConfig(cfg);
  if (err) throw new Error(err);

  const db = createServerClient();
  const { weights: w } = cfg;
  const { error } = await db.from('org_match_config').upsert({
    org_id:        orgId,
    min_score:     Math.round(cfg.minScore),
    w_semantic:    w.semantic,
    w_eligibility: w.eligibility,
    w_financial:   w.financial,
    w_affinity:    w.affinity,
    w_strategic:   w.strategic,
    w_historical:  w.historical,
    updated_at:    new Date().toISOString(),
    updated_by:    updatedBy ?? null,
  }, { onConflict: 'org_id' });
  if (error) throw new Error(`Could not save matching config: ${error.message}`);

  const rescored = await recomputeComposites(orgId, w);
  return { rescored };
}

/** Recompute composite_score for every match in the org from its stored
 *  sub-scores under `weights`. Exact and lossless — one SQL statement. */
export async function recomputeComposites(orgId: string, weights: MatchWeights): Promise<number> {
  const db = createServerClient();
  const { data, error } = await db.rpc('recompute_match_composites', {
    p_org_id: orgId,
    w_sem:    weights.semantic,
    w_elig:   weights.eligibility,
    w_fin:    weights.financial,
    w_aff:    weights.affinity,
    w_strat:  weights.strategic,
    w_hist:   weights.historical,
  });
  if (error) throw new Error(`Re-score failed: ${error.message}`);
  return Number(data) || 0;
}
