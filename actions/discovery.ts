'use server';

import { createServerClient } from '@/lib/supabase';
import { searchGrants, SearchParams } from '@/lib/grants-gov';
import { extractGrantFields } from '@/lib/extraction';
import { generateEmbedding, buildGrantText } from '@/lib/embeddings';
import {
  computeMatchScore, generateRecommendation, getEligibilityFlags,
  hardExclusionReason, MIN_STORE_SCORE, OrgMatchProfile, ProgramEmbeddingRef,
} from '@/lib/matching';
import { screen990Against, neutralFinancialResult, FinancialEligibilityResult } from '@/lib/990-screener';
import { ComputedFinancials, OrgProfile } from '@/lib/propublica';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import { CYC_FINANCIAL_PROFILE } from '@/lib/cyc-live-data';
import { YMCA_MATCH_PROFILE } from '@/lib/ymca-live-data';
import { getAuthContext } from '@/lib/auth-context';
import { ExtractedFields } from '@/types';
import crypto from 'crypto';

type FinancialCache = {
  computed: ComputedFinancials;
  org: OrgProfile;
  history?: Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  profileData?: Record<string, number>;
};

// Per-org caches keyed by orgCode (reset on cold start)
const programEmbeddingsCache = new Map<string, ProgramEmbeddingRef[]>();
const financialProfileCache  = new Map<string, FinancialCache>();

function getOrgProfile(orgCode: string): OrgMatchProfile {
  if (orgCode === 'CYC2025') return CYC_PROFILE as unknown as OrgMatchProfile;
  if (orgCode === 'YOM2026') return YMCA_MATCH_PROFILE;
  // Generic 501(c)(3) fallback for orgs without a dedicated profile
  return {
    name:              'Nonprofit Organization',
    mission:           'Community-serving nonprofit organization providing social services and programs.',
    city:              'Chicago',
    state:             'IL',
    annualBudget:      1_000_000,
    sites:             1,
    gataRegistered:    false,
    orgGrantMin:       10_000,
    orgGrantMax:       500_000,
    targetPopulations: ['community', 'low-income', 'underserved'],
    programs:          [{ name: 'Community Services', areas: ['community', 'social services', 'nonprofit'] }],
    historicalWinRates: {},
  };
}

/**
 * Per-program embeddings — one focused vector per org program plus a
 * "general operating" fallback. Replaces the single muddled org-wide
 * embedding so a grant for a specific program area matches that program
 * cleanly instead of getting diluted by the rest of the org's mission.
 *
 * For CYC this yields 5 embeddings:
 *   - Early Learning / Head Start
 *   - Afterschool Programs
 *   - Summer Day Camps
 *   - Teen Programming
 *   - General Operating (slightly down-weighted so program-specific wins)
 *
 * Cost: ~5 × $0.000026 per cold start = negligible. Cached in-process.
 */
async function getOrgProgramEmbeddings(orgCode: string): Promise<ProgramEmbeddingRef[]> {
  const cached = programEmbeddingsCache.get(orgCode);
  if (cached) return cached;

  const profile = getOrgProfile(orgCode);

  // Stable context block so each program embedding gets the same
  // org-level grounding (location, scale, populations) — only the
  // program-specific lines differ.
  const baseContext = [
    `Organization: ${profile.name}, a ${profile.city}, ${profile.state}-based 501(c)(3) nonprofit.`,
    `Annual budget: $${(profile.annualBudget / 1_000_000).toFixed(1)}M across ${profile.sites} sites.`,
    `Serves: ${profile.targetPopulations.slice(0, 5).join(', ')}.`,
    `Focus: domestic, USA, ${profile.state}.`,
  ].join(' ');

  const programs = await Promise.all(profile.programs.map(async (p) => {
    // Program-specific text: lead with the program name and areas so the
    // embedding's strongest signals are program-aligned. baseContext is at
    // the bottom so cosine isn't washed out by repeated org-level boilerplate.
    const text = [
      `Program: ${p.name}`,
      `Focus areas: ${p.areas.join(', ')}.`,
      `What we do in this program: deliver ${p.areas.slice(0, 3).join(', ')} services to ${profile.targetPopulations.slice(0, 3).join(', ')}.`,
      baseContext,
    ].join('\n');
    return {
      programName: p.name,
      embedding:   await generateEmbedding(text),
      weight:      1.0,
    };
  }));

  // General operating embedding — captures mission-level / unrestricted
  // grants that don't map to one specific program. Down-weighted so a
  // tied cosine on a specific program wins.
  const generalText = [
    `Program area: General Operating Support`,
    `Mission: ${profile.mission}`,
    `This embedding represents grants that fund the organization's general operations, unrestricted use, or mission-level work that spans all programs.`,
    baseContext,
  ].join('\n');

  const general: ProgramEmbeddingRef = {
    programName: 'General Operating',
    embedding:   await generateEmbedding(generalText),
    weight:      0.85,
  };

  const all: ProgramEmbeddingRef[] = [...programs, general];
  programEmbeddingsCache.set(orgCode, all);
  return all;
}

async function getFinancialProfile(orgCode: string): Promise<FinancialCache | null> {
  const cached = financialProfileCache.get(orgCode);
  if (cached) return cached;

  // CYC uses hand-audited FY2025 financials — more accurate and current than
  // ProPublica's stale 990 snapshot, and consistent with the Financials page.
  if (orgCode === 'CYC2025') {
    financialProfileCache.set(orgCode, CYC_FINANCIAL_PROFILE);
    return CYC_FINANCIAL_PROFILE;
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('financial_data, profile_data')
    .eq('org_code', orgCode)
    .single();

  if (!data?.financial_data) return null;
  const fd = data.financial_data as {
    computed: ComputedFinancials;
    org: OrgProfile;
    history?: Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  };
  if (!fd.computed) return null;

  const profile: FinancialCache = {
    computed:    fd.computed,
    org:         fd.org,
    history:     fd.history,
    profileData: (data.profile_data as Record<string, number>) || undefined,
  };
  financialProfileCache.set(orgCode, profile);
  return profile;
}

function computeContentHash(sourceId: string, title: string): string {
  return crypto.createHash('sha256').update(`${sourceId}:${title}`).digest('hex');
}

// ── Targeted search profiles for Chicago youth nonprofit ─────────────────────
// These go well beyond generic Grants.gov categories and use specific
// program-aligned keywords to dramatically improve relevance.
const TARGETED_SEARCHES: Array<{ name: string; params: SearchParams }> = [
  // Core mission areas
  { name: 'Youth Afterschool',     params: { keyword: 'youth afterschool out-of-school time', rows: 25 } },
  { name: 'Early Childhood',       params: { keyword: 'early childhood education Head Start pre-K', rows: 25 } },
  { name: 'Youth Workforce Dev',   params: { keyword: 'youth workforce development job training 14-24', rows: 25 } },
  { name: 'STEM Youth',            params: { keyword: 'STEM youth nonprofit afterschool Chicago Illinois', rows: 20 } },
  { name: '21st CCLC',             params: { keyword: '21st Century Community Learning Centers', rows: 20 } },
  { name: 'Violence Prevention',   params: { keyword: 'youth violence prevention community nonprofit Illinois', rows: 20 } },
  { name: 'Mentoring',             params: { keyword: 'youth mentoring at-risk young people nonprofit', rows: 20 } },
  { name: 'Social-Emotional',      params: { keyword: 'social emotional learning youth development nonprofit', rows: 20 } },
  // Population-specific
  { name: 'Low-Income Youth',      params: { keyword: 'low-income youth education nonprofit disadvantaged', rows: 20 } },
  { name: 'Summer Learning',       params: { keyword: 'summer learning loss youth camps nonprofit', rows: 15 } },
  // Compliance/operations
  { name: 'Nonprofit Capacity',    params: { keyword: 'nonprofit capacity building community organization grant', rows: 15 } },
];

export async function runDiscovery(params: SearchParams, orgId?: string, orgCode?: string): Promise<{
  discovered: number;
  newGrants: number;
  highMatches: number;
  mediumMatches: number;
  excluded: number;
  belowThreshold: number;
  errors: string[];
}> {
  const supabase      = createServerClient();
  const errors: string[] = [];
  let discovered        = 0;
  let newGrants         = 0;
  let highMatches       = 0;
  let mediumMatches     = 0;
  let excluded          = 0;   // hard-excluded (international/defense)
  let belowThreshold    = 0;   // passed gates but scored too low to store

  const resolvedOrgCode = orgCode ?? 'CYC2025';
  const orgProfile      = getOrgProfile(resolvedOrgCode);

  try {
    // Use targeted search profiles if no specific params provided
    const searches = (params.keyword || params.fundingCategories)
      ? [{ name: 'Custom', params }]
      : TARGETED_SEARCHES.slice(0, 4); // run first 4 on demand; all via cron

    const [programEmbeddings, financialProfile] = await Promise.all([
      getOrgProgramEmbeddings(resolvedOrgCode),
      getFinancialProfile(resolvedOrgCode),
    ]);

    for (const search of searches) {
      let hits;
      try {
        const searchResult = await searchGrants(search.params);
        hits = searchResult.data?.oppHits || [];
        discovered += hits.length;
      } catch (err) {
        errors.push(`Search "${search.name}" failed: ${String(err)}`);
        continue;
      }

      if (!hits.length) continue;

      // Cap per-search to control API costs: 8 grants per search profile
      for (const hit of hits.slice(0, 8)) {
        try {
          // ── 1. Hard exclusion gate (free — no API calls) ──────────────────
          const exclusionReason = hardExclusionReason(
            hit.agencyCode || '',
            hit.title || '',
            '',
            hit.alnlist?.join(' ') || '',
          );
          if (exclusionReason) {
            excluded++;
            continue;
          }

          // ── 2. Duplicate check ────────────────────────────────────────────
          const contentHash = computeContentHash(hit.id, hit.title);
          const { data: existing } = await supabase
            .from('grant_opportunities')
            .select('id')
            .eq('source_id', hit.id)
            .single();
          if (existing) continue;

          // ── 3. Claude extraction ──────────────────────────────────────────
          const fullText = [
            hit.title,
            hit.agencyName,
            hit.alnlist?.join(', '),
          ].filter(Boolean).join('\n');

          const extractedFields = await extractGrantFields(
            hit.title,
            hit.agencyName,
            hit.agencyCode,
            hit.alnlist || [],
            fullText,
          );

          // ── 4. Post-extraction exclusion (now we have geographic_scope) ────
          const postExclusionReason = hardExclusionReason(
            hit.agencyCode || '',
            hit.title || '',
            '',
            [
              extractedFields.geographic_scope || '',
              ...(extractedFields.geographic_states || []),
            ].join(' '),
          );
          if (postExclusionReason) {
            excluded++;
            continue;
          }

          // International scope check after extraction
          if (extractedFields.geographic_scope === 'international' ||
              extractedFields.geographic_scope === 'foreign') {
            excluded++;
            continue;
          }

          // ── 5. Embed using richer text (title + extraction) ────────────────
          const grantText = buildGrantText(
            hit.title,
            hit.agencyName,
            '', // synopsis still empty from Grants.gov; extraction fields compensate
            extractedFields as Record<string, unknown>,
          );
          const embedding = await generateEmbedding(grantText);

          // ── 6. 990 screening ───────────────────────────────────────────────
          let financialResult: FinancialEligibilityResult;
          if (financialProfile) {
            financialResult = screen990Against(
              financialProfile.computed,
              financialProfile.org,
              extractedFields,
              hit.agencyCode,
              hit.alnlist || [],
              { history: financialProfile.history, profileData: financialProfile.profileData },
            );
          } else {
            financialResult = neutralFinancialResult();
          }

          // ── 7. Composite score ─────────────────────────────────────────────
          // Per-program scoring: cosine is computed against each program
          // embedding and the max wins, with the winning program name
          // surfaced on scoreBreakdown.matchedProgram.
          const scoreBreakdown = computeMatchScore(
            embedding, programEmbeddings, extractedFields,
            hit.agencyCode, hit.alnlist || [], financialResult, orgProfile,
          );

          // ── 8. Minimum score gate — skip low-signal grants ─────────────────
          if (scoreBreakdown.composite < MIN_STORE_SCORE) {
            belowThreshold++;
            continue;
          }

          // ── 9. Insert grant ────────────────────────────────────────────────
          const closeDate = hit.closeDate ? parseGrantDate(hit.closeDate) : null;
          const openDate  = hit.openDate  ? parseGrantDate(hit.openDate)  : null;

          const { data: insertedGrant, error: grantError } = await supabase
            .from('grant_opportunities')
            .insert({
              source:              'grants.gov',
              source_id:           hit.id,
              opportunity_number:  hit.number,
              title:               hit.title,
              agency_code:         hit.agencyCode,
              agency_name:         hit.agencyName,
              open_date:           openDate,
              close_date:          closeDate,
              status:              hit.oppStatus || 'posted',
              aln_codes:           hit.alnlist || [],
              synopsis:            '',
              full_text:           fullText.slice(0, 20000),
              extracted_fields:    extractedFields,
              extraction_confidence: extractedFields.confidence_score || 0,
              embedding:           `[${embedding.join(',')}]`,
              content_hash:        contentHash,
            })
            .select()
            .single();

          if (grantError) {
            errors.push(`DB insert failed for ${hit.id}: ${grantError.message}`);
            continue;
          }

          newGrants++;

          // ── 10. Upsert match result ────────────────────────────────────────
          // Prefix the recommendation with the matched program so the user
          // sees which of their programs this grant is for — the most
          // valuable signal in the per-program scoring rebuild.
          const baseRec = generateRecommendation(scoreBreakdown, extractedFields, orgProfile);
          const recommendation = scoreBreakdown.matchedProgram
            ? `Best program fit: ${scoreBreakdown.matchedProgram}. ${baseRec}`
            : baseRec;
          const eligibilityFlags = getEligibilityFlags(extractedFields, orgProfile);

          await supabase.from('match_results').upsert({
            grant_id:            insertedGrant.id,
            org_id:              orgId ?? null,
            composite_score:     scoreBreakdown.composite,
            semantic_similarity: scoreBreakdown.semantic,
            eligibility_score:   scoreBreakdown.eligibility,
            financial_score:     financialResult.score,
            historical_score:    scoreBreakdown.historical,
            strategic_score:     scoreBreakdown.strategic,
            pipeline_stage:      'discovered',
            eligibility_flags:   eligibilityFlags,
            financial_signals:   financialResult.signals,
            recommendation,
          });

          if (scoreBreakdown.composite >= 70) highMatches++;
          else if (scoreBreakdown.composite >= 40) mediumMatches++;

        } catch (err) {
          errors.push(`Error processing ${hit.id}: ${String(err)}`);
        }
      }
    }

    // Log pipeline run
    await supabase.from('pipeline_runs').insert({
      run_id:           `run-${Date.now()}`,
      org_id:            orgId ?? null,
      started_at:       new Date().toISOString(),
      completed_at:     new Date().toISOString(),
      grants_discovered: discovered,
      grants_new:        newGrants,
      high_matches:      highMatches,
      medium_matches:    mediumMatches,
      duration_seconds:  0,
      errors,
    });

  } catch (err) {
    errors.push(`Discovery failed: ${String(err)}`);
  }

  return { discovered, newGrants, highMatches, mediumMatches, excluded, belowThreshold, errors };
}

export async function updatePipelineStage(matchId: string, stage: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('match_results').update({ pipeline_stage: stage }).eq('id', matchId);
}

function parseGrantDate(dateStr: string): string | null {
  try {
    const [month, day, year] = dateStr.split('/');
    if (!month || !day || !year) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return null;
  }
}

// ── Re-score existing grants (cleans up historical bad matches) ──────────────
// Run once to purge Ukraine-relief-style noise from the DB.
export async function rescoreAndPruneExistingMatches(): Promise<{
  pruned: number;
  errors: string[];
}> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let pruned = 0;

  const { data: matches } = await supabase
    .from('match_results')
    .select('id, grant_id, composite_score, grant:grant_opportunities(title, agency_code, full_text, extracted_fields)')
    .order('composite_score', { ascending: true })
    .limit(200);

  if (!matches?.length) return { pruned: 0, errors: [] };

  for (const match of matches) {
    const grant = match.grant as {
      title?: string;
      agency_code?: string;
      full_text?: string;
      extracted_fields?: Record<string, unknown>;
    } | null;
    if (!grant) continue;

    const exclusionReason = hardExclusionReason(
      grant.agency_code || '',
      grant.title || '',
      '',
      grant.full_text || '',
    );

    if (exclusionReason) {
      // Delete match result + grant opportunity for hard-excluded grants
      await supabase.from('match_results').delete().eq('id', match.id);
      await supabase.from('grant_opportunities').delete().eq('id', match.grant_id);
      pruned++;
    }
  }

  return { pruned, errors };
}

// ── Re-extract financial_requirements on existing grants ─────────────────────
// Grants discovered before the financial_requirements schema landed lack the
// payment-structure / cost-share / audit-trigger data the reverse-990 verdict
// needs. This action re-runs Claude extraction on grants in the org's pipeline
// that are missing it. Processes in small batches so a single click stays
// within serverless time limits — re-click to continue.

const REEXTRACT_BATCH_SIZE = 12;

interface GrantRowForReExtract {
  id:               string;
  title:            string;
  agency_name:      string;
  agency_code:      string;
  aln_codes:        string[] | null;
  full_text:        string | null;
  extracted_fields: Record<string, unknown> | null;
}

export async function reExtractFinancialRequirements(): Promise<{
  totalRemaining: number;   // grants still missing financial_requirements BEFORE this batch
  scanned:        number;   // attempted this batch
  updated:        number;   // successfully updated this batch
  errors:         string[];
}> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { totalRemaining: 0, scanned: 0, updated: 0, errors: ['Not authenticated.'] };
  }

  const supabase = createServerClient();
  const { data: matches, error: matchErr } = await supabase
    .from('match_results')
    .select('grant:grant_opportunities(id, title, agency_name, agency_code, aln_codes, full_text, extracted_fields)')
    .eq('org_id', ctx.orgId);

  if (matchErr) {
    return { totalRemaining: 0, scanned: 0, updated: 0, errors: [matchErr.message] };
  }

  const grants: GrantRowForReExtract[] = (matches ?? [])
    .map(m => m.grant as unknown as GrantRowForReExtract | null)
    .filter((g): g is GrantRowForReExtract => g != null);

  const needsExtraction = grants.filter(g => {
    const ef = g.extracted_fields;
    return !ef || !ef.financial_requirements;
  });

  const totalRemaining = needsExtraction.length;
  const errors: string[] = [];
  let updated = 0;
  let scanned = 0;

  for (const g of needsExtraction.slice(0, REEXTRACT_BATCH_SIZE)) {
    scanned++;
    try {
      const newFields = await extractGrantFields(
        g.title,
        g.agency_name,
        g.agency_code,
        g.aln_codes ?? [],
        g.full_text ?? '',
      ) as ExtractedFields;

      // If Claude returned only a confidence_score, treat as failed extraction
      if (Object.keys(newFields).filter(k => k !== 'confidence_score').length === 0) {
        errors.push(`${g.id}: empty extraction`);
        continue;
      }

      // Merge: keep any existing keys not in the new extraction; new wins on conflict
      const merged = { ...(g.extracted_fields ?? {}), ...newFields };

      const { error } = await supabase
        .from('grant_opportunities')
        .update({ extracted_fields: merged })
        .eq('id', g.id);

      if (error) errors.push(`${g.id}: ${error.message}`);
      else updated++;
    } catch (err) {
      errors.push(`${g.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { totalRemaining, scanned, updated, errors };
}
