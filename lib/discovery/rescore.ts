/**
 * Re-score an org's stored grant corpus against the current matcher
 * state — Phase 4 follow-up.
 *
 * runDiscovery (actions/discovery.ts) dedupes against grant_opportunities
 * and skips known hits, so adding a new factor (CRA boost) doesn't
 * retroactively change existing match_results. This function does the
 * retroactive work: iterates existing match_results for one org, pulls
 * the stored embedding + extracted_fields off grant_opportunities,
 * re-runs computeMatchScore with the live CRA snapshot, UPSERTs the
 * updated scores back into match_results.
 *
 * Cost: zero external API calls. Pure compute + DB writes.
 */

import { createServerClient } from '@/lib/supabase';
import {
  computeMatchScore, generateRecommendation, getEligibilityFlags,
  hardExclusionReason, type ProgramEmbeddingRef, type ExclusionRules,
} from '@/lib/matching';
import { screen990Against, neutralFinancialResult, type FinancialEligibilityResult } from '@/lib/990-screener';
import { getOrgConfig } from '@/lib/config/loader';
import { getOrgFinancialProfile } from '@/lib/org-financials';
import { generateEmbedding } from '@/lib/embeddings';
import { fetchOrgOutcomeCounts, buildHistoricalWinRates } from '@/lib/win-rate-bayes';
import { loadOrgCraSnapshot } from '@/lib/cra/repo';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import { YMCA_MATCH_PROFILE } from '@/lib/ymca-live-data';
import type { OrgMatchProfile } from '@/lib/matching';
import type { ExtractedFields } from '@/types';

const FIXTURE_PROFILES: Record<string, OrgMatchProfile> = {
  CYC2025: CYC_PROFILE as unknown as OrgMatchProfile,
  YOM2026: YMCA_MATCH_PROFILE,
};

function genericProfile(state: string, stateLabel: string): OrgMatchProfile {
  return {
    name:              'Nonprofit Organization',
    mission:           'Community-serving nonprofit.',
    city:              stateLabel,
    state,
    annualBudget:      1_000_000,
    sites:             1,
    gataRegistered:    false,
    orgGrantMin:       10_000,
    orgGrantMax:       500_000,
    targetPopulations: ['community', 'low-income', 'underserved'],
    programs:          [{ name: 'Community Services', areas: ['community', 'social services'] }],
    historicalWinRates: {},
  };
}

/**
 * Build the per-program embedding refs. Replicates the helper in
 * actions/discovery.ts but doesn't share its cache — rescore is rare and
 * called from an admin endpoint, so cold-rebuilding is fine.
 */
async function buildProgramEmbeddings(profile: OrgMatchProfile): Promise<ProgramEmbeddingRef[]> {
  const baseContext = [
    `Organization: ${profile.name}, a ${profile.city}, ${profile.state}-based 501(c)(3) nonprofit.`,
    `Annual budget: $${(profile.annualBudget / 1_000_000).toFixed(1)}M across ${profile.sites} sites.`,
    `Serves: ${profile.targetPopulations.slice(0, 5).join(', ')}.`,
    `Focus: domestic, USA, ${profile.state}.`,
  ].join(' ');

  const programs = await Promise.all(profile.programs.map(async p => {
    const text = [
      `Program: ${p.name}`,
      `Focus areas: ${p.areas.join(', ')}.`,
      baseContext,
    ].join('\n');
    return { programName: p.name, embedding: await generateEmbedding(text), weight: 1.0 };
  }));

  const general: ProgramEmbeddingRef = {
    programName: 'General Operating',
    embedding:   await generateEmbedding(`Program: General Operating Support. Mission: ${profile.mission}\n${baseContext}`),
    weight:      0.85,
  };
  return [...programs, general];
}

/**
 * Parse a pgvector-text-format embedding ("[0.1,0.2,...]") into a
 * number[]. PostgREST returns the column as a text-coerced string for
 * the vector type; we re-hydrate here.
 */
function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw !== 'string') return null;
  try {
    const trimmed = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
    return trimmed.split(',').map(Number);
  } catch { return null; }
}

export interface RescoreResult {
  org_id:           string;
  scanned:          number;
  rescored:         number;
  excluded:         number;
  cra_boosts:       number;
  composite_delta_avg: number | null;
  errors:           string[];
}

/**
 * Re-score every match_result row for one org against the current
 * matcher state (which now includes Phase 4's CRA snapshot).
 */
export async function rescoreOrgCorpus(orgIdInput: string, orgCode: string): Promise<RescoreResult> {
  const errors: string[] = [];
  const db = createServerClient();

  const orgConfig    = await getOrgConfig(orgCode);
  const baseProfile  = FIXTURE_PROFILES[orgCode] ?? genericProfile(
    orgConfig?.region?.geo_scope?.states?.[0] ?? '',
    orgConfig?.region?.name ?? '',
  );

  // Segment-scoped exclusion rules. Without this, rescore would use
  // the matcher's built-in DEFAULT_ lists, which don't carry tenant-
  // specific blocks (the DOS- / STATE- / USAID- prefixes added in the
  // youth-ost segment, for example). Falls through to defaults when the
  // org isn't pinned to a segment yet.
  const segment = orgConfig?.segment ?? null;
  const exclusionRules: ExclusionRules | undefined = segment ? {
    agencies:        segment.exclusion_rules.agencies,
    agency_prefixes: segment.exclusion_rules.agency_prefixes,
    keywords:        segment.exclusion_rules.keywords,
    segment_label:   segment.name,
  } : undefined;

  const [programEmbeddings, financialProfile, observedOutcomes, craSnapshot] = await Promise.all([
    buildProgramEmbeddings(baseProfile),
    getOrgFinancialProfile(orgCode),
    fetchOrgOutcomeCounts(orgIdInput),
    loadOrgCraSnapshot(orgIdInput),
  ]);

  const observedRates = observedOutcomes ? buildHistoricalWinRates(observedOutcomes) : {};
  const orgProfile: OrgMatchProfile = {
    ...baseProfile,
    historicalWinRates: { ...baseProfile.historicalWinRates, ...observedRates },
  };

  // Pull every grant in the corpus + this org's existing match_results
  // (if any) in two round trips. We treat first-scoring and re-scoring
  // identically: UPSERT against match_results(grant_id, org_id) at the
  // end. That way orgs whose discovery never ran (the common case after
  // adding a new factor) still pick up the change.
  const [{ data: grants, error: grantsErr }, { data: existing }] = await Promise.all([
    db.from('grant_opportunities')
      .select('id, agency_code, agency_name, title, aln_codes, extracted_fields, embedding'),
    db.from('match_results')
      .select('grant_id, composite_score, pipeline_stage')
      .eq('org_id', orgIdInput),
  ]);

  if (grantsErr) {
    return {
      org_id: orgIdInput, scanned: 0, rescored: 0, excluded: 0, cra_boosts: 0,
      composite_delta_avg: null, errors: [`fetch grants: ${grantsErr.message}`],
    };
  }

  // Index prior composite_score + pipeline_stage by grant_id so the
  // UPSERT preserves stage transitions the user made manually.
  const priorByGrantId = new Map<string, { composite: number | null; stage: string | null }>();
  for (const row of (existing ?? [])) {
    priorByGrantId.set(
      row.grant_id as string,
      {
        composite: (row.composite_score as number) ?? null,
        stage:     (row.pipeline_stage as string) ?? null,
      },
    );
  }

  let scanned    = 0;
  let rescored   = 0;
  let excluded   = 0;
  let cra_boosts = 0;
  const deltas: number[] = [];

  for (const grant of (grants ?? [])) {
    scanned += 1;

    const embedding = parseEmbedding(grant.embedding);
    if (!embedding || embedding.length !== 1536) {
      errors.push(`grant ${grant.id}: missing or malformed embedding`);
      continue;
    }
    const extractedFields = (grant.extracted_fields ?? {}) as ExtractedFields;
    const reason = hardExclusionReason(
      grant.agency_code ?? '', grant.title ?? '', '',
      [extractedFields.geographic_scope ?? '', ...(extractedFields.geographic_states ?? [])].join(' '),
      exclusionRules,
    );
    if (reason) { excluded += 1; continue; }

    let financialResult: FinancialEligibilityResult;
    if (financialProfile) {
      financialResult = screen990Against(
        financialProfile.computed, financialProfile.org,
        extractedFields, grant.agency_code ?? '', grant.aln_codes ?? [],
        { history: financialProfile.history, profileData: financialProfile.profileData },
      );
    } else {
      financialResult = neutralFinancialResult();
    }

    const breakdown = computeMatchScore(
      embedding, programEmbeddings, extractedFields,
      grant.agency_code ?? '', grant.aln_codes ?? [],
      financialResult, orgProfile, craSnapshot,
    );

    const baseRec = generateRecommendation(breakdown, extractedFields, orgProfile);
    const recommendation = breakdown.matchedProgram
      ? `Best program fit: ${breakdown.matchedProgram}. ${baseRec}`
      : baseRec;
    const eligibilityFlags = getEligibilityFlags(extractedFields, orgProfile);

    if (breakdown.craEvidence?.lmi_match) cra_boosts += 1;
    const prior = priorByGrantId.get(grant.id as string);
    deltas.push(breakdown.composite - (prior?.composite ?? 0));

    const { error: upsertErr } = await db
      .from('match_results')
      .upsert(
        {
          grant_id:            grant.id,
          org_id:              orgIdInput,
          composite_score:     breakdown.composite,
          semantic_similarity: breakdown.semantic,
          eligibility_score:   breakdown.eligibility,
          financial_score:     breakdown.financial_990,
          historical_score:    breakdown.historical,
          strategic_score:     breakdown.strategic,
          eligibility_flags:   eligibilityFlags,
          financial_signals:   financialResult.signals,
          recommendation,
          // Preserve the user's manual pipeline_stage progression. New
          // matches default to 'discovered'.
          pipeline_stage:      prior?.stage ?? 'discovered',
        },
        { onConflict: 'grant_id,org_id' },
      );
    if (upsertErr) {
      errors.push(`upsert match for grant ${grant.id}: ${upsertErr.message}`);
    } else {
      rescored += 1;
    }
  }

  const composite_delta_avg = deltas.length
    ? Math.round((deltas.reduce((s, x) => s + x, 0) / deltas.length) * 100) / 100
    : null;

  return {
    org_id: orgIdInput, scanned, rescored, excluded, cra_boosts,
    composite_delta_avg, errors,
  };
}
