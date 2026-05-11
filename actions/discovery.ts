'use server';

import { createServerClient } from '@/lib/supabase';
import { searchGrants, SearchParams } from '@/lib/grants-gov';
import { extractGrantFields } from '@/lib/extraction';
import { generateEmbedding, buildGrantText } from '@/lib/embeddings';
import {
  computeMatchScore, generateRecommendation, getEligibilityFlags,
  hardExclusionReason, MIN_STORE_SCORE, OrgMatchProfile,
} from '@/lib/matching';
import { screen990Against, neutralFinancialResult, FinancialEligibilityResult } from '@/lib/990-screener';
import { ComputedFinancials, OrgProfile } from '@/lib/propublica';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import { YMCA_MATCH_PROFILE } from '@/lib/ymca-live-data';
import crypto from 'crypto';

type FinancialCache = {
  computed: ComputedFinancials;
  org: OrgProfile;
  history?: Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  profileData?: Record<string, number>;
};

// Per-org caches keyed by orgCode (reset on cold start)
const orgEmbeddingCache   = new Map<string, number[]>();
const financialProfileCache = new Map<string, FinancialCache>();

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

async function getOrgEmbedding(orgCode: string): Promise<number[]> {
  const cached = orgEmbeddingCache.get(orgCode);
  if (cached) return cached;

  const profile = getOrgProfile(orgCode);
  const orgText = [
    `Organization: ${profile.name}`,
    `Mission: ${profile.mission}`,
    `Location: ${profile.city}, ${profile.state}`,
    `Entity type: 501(c)(3) nonprofit`,
    `Programs: ${profile.programs.map(p => `${p.name} (${p.areas.join(', ')})`).join('; ')}`,
    `Target populations: ${profile.targetPopulations.join(', ')}`,
    `Annual budget: $${(profile.annualBudget / 1_000_000).toFixed(1)}M`,
    `Sites: ${profile.sites} locations`,
    `Focus: domestic, USA, ${profile.state}`,
  ].join('\n');

  const embedding = await generateEmbedding(orgText);
  orgEmbeddingCache.set(orgCode, embedding);
  return embedding;
}

async function getFinancialProfile(orgCode: string): Promise<FinancialCache | null> {
  const cached = financialProfileCache.get(orgCode);
  if (cached) return cached;

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

    const [orgEmbedding, financialProfile] = await Promise.all([
      getOrgEmbedding(resolvedOrgCode),
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
          const scoreBreakdown = computeMatchScore(
            embedding, orgEmbedding, extractedFields,
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
          const recommendation  = generateRecommendation(scoreBreakdown, extractedFields, orgProfile);
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
