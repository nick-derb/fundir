'use server';

import { createServerClient } from '@/lib/supabase';
import { searchGrants, SearchParams } from '@/lib/grants-gov';
import { extractGrantFields } from '@/lib/extraction';
import { generateEmbedding, buildGrantText } from '@/lib/embeddings';
import { computeMatchScore, generateRecommendation, getEligibilityFlags } from '@/lib/matching';
import { screen990Against, neutralFinancialResult, FinancialEligibilityResult } from '@/lib/990-screener';
import { ComputedFinancials, OrgProfile } from '@/lib/propublica';
import { CYC_PROFILE } from '@/lib/cyc-profile';
import crypto from 'crypto';

// Module-level caches (reset per cold start; warm across requests in same instance)
let cachedOrgEmbedding: number[] | null = null;
let cachedFinancialProfile: {
  computed: ComputedFinancials;
  org: OrgProfile;
  history?: Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  profileData?: Record<string, number>;
} | null = null;

async function getOrgEmbedding(): Promise<number[]> {
  if (cachedOrgEmbedding) return cachedOrgEmbedding;
  const orgText = [
    `Organization: ${CYC_PROFILE.name}`,
    `Mission: ${CYC_PROFILE.mission}`,
    `Programs: ${CYC_PROFILE.programs.flatMap(p => p.areas).join(', ')}`,
    `Target populations: ${CYC_PROFILE.targetPopulations.join(', ')}`,
    `Location: ${CYC_PROFILE.city}, ${CYC_PROFILE.state}`,
  ].join('\n');
  cachedOrgEmbedding = await generateEmbedding(orgText);
  return cachedOrgEmbedding;
}

async function getFinancialProfile(): Promise<{
  computed: ComputedFinancials;
  org: OrgProfile;
  history?: Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  profileData?: Record<string, number>;
} | null> {
  if (cachedFinancialProfile) return cachedFinancialProfile;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('financial_data, profile_data')
    .eq('org_code', 'CYC2025')
    .single();

  if (!data?.financial_data) return null;
  const fd = data.financial_data as {
    computed: ComputedFinancials;
    org: OrgProfile;
    history?: Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  };
  if (!fd.computed) return null;
  cachedFinancialProfile = {
    computed:    fd.computed,
    org:         fd.org,
    history:     fd.history,
    profileData: (data.profile_data as Record<string, number>) || undefined,
  };
  return cachedFinancialProfile;
}

function computeContentHash(sourceId: string, title: string): string {
  return crypto.createHash('sha256').update(`${sourceId}:${title}`).digest('hex');
}

export async function runDiscovery(params: SearchParams): Promise<{
  discovered: number;
  newGrants: number;
  highMatches: number;
  mediumMatches: number;
  errors: string[];
}> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let discovered = 0;
  let newGrants = 0;
  let highMatches = 0;
  let mediumMatches = 0;

  try {
    // 1. Search Grants.gov
    const searchResult = await searchGrants(params);
    const hits = searchResult.data?.oppHits || [];
    discovered = hits.length;

    if (!hits.length) return { discovered: 0, newGrants: 0, highMatches: 0, mediumMatches: 0, errors };

    // 2. Get org embedding + 990 financial profile once per run
    const orgEmbedding = await getOrgEmbedding();
    const financialProfile = await getFinancialProfile();

    // 3. Process each hit
    for (const hit of hits.slice(0, 5)) { // cap at 5 per run to minimize API costs
      try {
        const contentHash = computeContentHash(hit.id, hit.title);

        // Check if already exists
        const { data: existing } = await supabase
          .from('grant_opportunities')
          .select('id')
          .eq('source_id', hit.id)
          .single();

        if (existing) continue;

        // 4. Use search result data directly (skip fetchOpportunity to save API calls)
        const synopsis = '';
        const fullText = [
          hit.title,
          hit.agencyName,
          hit.alnlist?.join(', '),
        ].filter(Boolean).join('\n');

        // 5. Claude extraction
        const extractedFields = await extractGrantFields(
          hit.title,
          hit.agencyName,
          hit.agencyCode,
          hit.alnlist || [],
          fullText
        );

        // 6. Generate embedding
        const grantText = buildGrantText(hit.title, hit.agencyName, synopsis, extractedFields as Record<string, unknown>);
        const embedding = await generateEmbedding(grantText);

        // 7. Insert grant
        const closeDate = hit.closeDate ? parseGrantDate(hit.closeDate) : null;
        const openDate = hit.openDate ? parseGrantDate(hit.openDate) : null;

        const { data: insertedGrant, error: grantError } = await supabase
          .from('grant_opportunities')
          .insert({
            source: 'grants.gov',
            source_id: hit.id,
            opportunity_number: hit.number,
            title: hit.title,
            agency_code: hit.agencyCode,
            agency_name: hit.agencyName,
            open_date: openDate,
            close_date: closeDate,
            status: hit.oppStatus || 'posted',
            aln_codes: hit.alnlist || [],
            synopsis: synopsis.slice(0, 5000),
            full_text: fullText.slice(0, 20000),
            extracted_fields: extractedFields,
            extraction_confidence: extractedFields.confidence_score || 0,
            embedding: `[${embedding.join(',')}]`,
            content_hash: contentHash,
          })
          .select()
          .single();

        if (grantError) {
          errors.push(`DB insert failed for ${hit.id}: ${grantError.message}`);
          continue;
        }

        newGrants++;

        // 8. Run reverse 990 screening (if financial data is loaded)
        let financialResult: FinancialEligibilityResult;
        if (financialProfile) {
          financialResult = screen990Against(
            financialProfile.computed,
            financialProfile.org,
            extractedFields,
            hit.agencyCode,
            hit.alnlist || [],
            {
              history:     financialProfile.history,
              profileData: financialProfile.profileData,
            },
          );
        } else {
          financialResult = neutralFinancialResult();
        }

        // 9. Compute composite match score (now includes financial_990 factor)
        const scoreBreakdown = computeMatchScore(
          embedding,
          orgEmbedding,
          extractedFields,
          hit.agencyCode,
          hit.alnlist || [],
          financialResult,
        );

        const recommendation = generateRecommendation(scoreBreakdown, extractedFields);
        const eligibilityFlags = getEligibilityFlags(extractedFields);

        // 10. Upsert match result
        await supabase.from('match_results').upsert({
          grant_id: insertedGrant.id,
          composite_score:   scoreBreakdown.composite,
          semantic_similarity: scoreBreakdown.semantic,
          eligibility_score: scoreBreakdown.eligibility,
          financial_score:   financialResult.score,
          historical_score:  scoreBreakdown.historical,
          strategic_score:   scoreBreakdown.strategic,
          pipeline_stage:    'discovered',
          eligibility_flags: eligibilityFlags,
          financial_signals: financialResult.signals,
          recommendation,
        });

        if (scoreBreakdown.composite >= 70) highMatches++;
        else if (scoreBreakdown.composite >= 40) mediumMatches++;

      } catch (err) {
        errors.push(`Error processing ${hit.id}: ${String(err)}`);
      }
    }

    // 10. Log pipeline run
    await supabase.from('pipeline_runs').insert({
      run_id: `run-${Date.now()}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      grants_discovered: discovered,
      grants_new: newGrants,
      high_matches: highMatches,
      medium_matches: mediumMatches,
      duration_seconds: 0,
      errors,
    });

  } catch (err) {
    errors.push(`Discovery failed: ${String(err)}`);
  }

  return { discovered, newGrants, highMatches, mediumMatches, errors };
}

export async function updatePipelineStage(matchId: string, stage: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('match_results').update({ pipeline_stage: stage }).eq('id', matchId);
}

function parseGrantDate(dateStr: string): string | null {
  // Grants.gov dates come as MM/DD/YYYY
  try {
    const [month, day, year] = dateStr.split('/');
    if (!month || !day || !year) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return null;
  }
}
