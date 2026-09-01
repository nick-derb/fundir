import { createServerClient } from '@/lib/supabase';

/**
 * Feature spec version. Freeze the feature set behind this string; bump it when
 * the feature extractors change so old and new examples never mix silently.
 */
export const FEATURE_SPEC_VERSION = 'v1';

export interface ExportResult {
  /** outcomes that had a usable match to draw features from */
  labeled: number;
  /** examples written to training_examples */
  written: number;
  awarded: number;
  rejected: number;
}

interface OutcomeRow {
  outcome: 'awarded' | 'rejected';
  recorded_at: string;
  match_id: string;
  match_results: {
    grant_id: string;
    composite_score: number;
    semantic_similarity: number;
    eligibility_score: number;
    financial_score: number;
    historical_score: number;
    strategic_score: number;
    matched_at: string;
    eligibility_flags: string[] | null;
  } | null;
}

/**
 * Materialize one (features, label) row per historical match with a known
 * outcome into training_examples. Features come from the factor scores already
 * stored on match_results — no re-scoring, no leakage of post-outcome info.
 *
 * This does not train anything; it turns CYC's outcome history into an
 * inspectable, versioned dataset (see docs/model-development-plan.md §7).
 */
export async function exportTrainingExamples(
  orgId: string,
  snapshotId?: string | null,
): Promise<ExportResult> {
  const db = createServerClient();

  const { data, error } = await db
    .from('org_outcomes')
    .select(
      'outcome, recorded_at, match_id, ' +
      'match_results(grant_id, composite_score, semantic_similarity, eligibility_score, ' +
      'financial_score, historical_score, strategic_score, matched_at, eligibility_flags)',
    )
    .eq('org_id', orgId)
    .not('match_id', 'is', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as OutcomeRow[];

  let awarded = 0;
  let rejected = 0;
  const upserts = [];
  for (const r of rows) {
    const m = r.match_results;
    if (!m?.grant_id) continue;
    if (r.outcome === 'awarded') awarded++; else rejected++;
    upserts.push({
      org_id: orgId,
      grant_id: m.grant_id,
      match_id: r.match_id,
      label: r.outcome,
      applied_at: m.matched_at,
      outcome_at: r.recorded_at,
      snapshot_id: snapshotId ?? null,
      feature_spec_version: FEATURE_SPEC_VERSION,
      features: {
        composite_score: m.composite_score,
        semantic_similarity: m.semantic_similarity,
        eligibility_score: m.eligibility_score,
        financial_score: m.financial_score,
        historical_score: m.historical_score,
        strategic_score: m.strategic_score,
        eligibility_flag_count: (m.eligibility_flags ?? []).length,
      },
    });
  }

  if (upserts.length) {
    const { error: upErr } = await db
      .from('training_examples')
      .upsert(upserts, { onConflict: 'org_id,grant_id,feature_spec_version' });
    if (upErr) throw new Error(upErr.message);
  }

  return { labeled: upserts.length, written: upserts.length, awarded, rejected };
}
