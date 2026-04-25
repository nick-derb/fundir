import { ExtractedFields, ScoreBreakdown } from '@/types';
import { CYC_PROFILE } from './cyc-profile';
import { FinancialEligibilityResult, neutralFinancialResult } from './990-screener';

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return normA && normB ? Math.max(0, dot / (normA * normB)) : 0;
}

function computeEligibility(fields: ExtractedFields): number {
  let score = 0;

  // Entity type (35%)
  if (!fields.eligible_entity_types?.length) {
    score += 0.8 * 0.35;
  } else {
    const isEligible = fields.eligible_entity_types.some(t =>
      t.toLowerCase().includes('nonprofit') || t.toLowerCase().includes('501')
    );
    score += (isEligible ? 1.0 : 0.0) * 0.35;
  }

  // Geography (25%)
  if (!fields.geographic_scope || fields.geographic_scope === 'national') {
    score += 1.0 * 0.25;
  } else if (fields.geographic_states?.includes('IL')) {
    score += 1.0 * 0.25;
  } else if (!fields.geographic_states?.length) {
    score += 0.7 * 0.25;
  }

  // Population (20%)
  const grantPops = fields.target_population?.map(p => p.toLowerCase()) || [];
  const orgPops = CYC_PROFILE.targetPopulations.map(p => p.toLowerCase());
  if (!grantPops.length) {
    score += 0.5 * 0.20;
  } else {
    const matches = grantPops.filter(gp => orgPops.some(op => gp.includes(op) || op.includes(gp)));
    score += Math.min(1.0, matches.length / Math.max(grantPops.length, 1)) * 0.20;
  }

  // Compliance (20%)
  const requiresGATA = fields.compliance_frameworks?.some(f => f.toUpperCase().includes('GATA'));
  if (!requiresGATA) {
    score += 1.0 * 0.20;
  } else {
    score += (CYC_PROFILE.gataRegistered ? 1.0 : 0.0) * 0.20;
  }

  return Math.min(1.0, score);
}

function computeStrategicFit(fields: ExtractedFields): number {
  let score = 0;

  // Program overlap (50%)
  const grantAreas = fields.program_areas?.map(a => a.toLowerCase()) || [];
  const orgAreas = CYC_PROFILE.programs.flatMap(p => p.areas.map(a => a.toLowerCase()));
  if (!grantAreas.length) {
    score += 0.3 * 0.50;
  } else {
    const intersection = grantAreas.filter(ga => orgAreas.some(oa => ga.includes(oa) || oa.includes(ga)));
    const union = new Set([...grantAreas, ...orgAreas]).size;
    score += (intersection.length / union) * 0.50;
  }

  // Award size fit (30%)
  const awardMin = fields.award_floor || 0;
  const awardMax = fields.award_ceiling || awardMin;
  const orgMin = 50_000;
  const orgMax = 750_000;
  if (!awardMax) {
    score += 0.5 * 0.30;
  } else {
    const overlapMin = Math.max(orgMin, awardMin);
    const overlapMax = Math.min(orgMax, awardMax);
    if (overlapMax > overlapMin) {
      const unionSpan = Math.max(orgMax, awardMax) - Math.min(orgMin, awardMin);
      score += ((overlapMax - overlapMin) / unionSpan) * 0.30;
    }
  }

  // Compliance fit (20%)
  score += 0.8 * 0.20; // CYC is well-compliant, default high

  return Math.min(1.0, score);
}

export function computeMatchScore(
  grantEmbedding: number[],
  orgEmbedding: number[],
  extractedFields: ExtractedFields,
  agencyCode: string,
  alnCodes: string[],
  financialResult?: FinancialEligibilityResult,
): ScoreBreakdown {
  const semantic = cosineSimilarity(grantEmbedding, orgEmbedding);
  const eligibility = computeEligibility(extractedFields);
  const financial = (financialResult ?? neutralFinancialResult()).score / 100;

  const historical =
    CYC_PROFILE.historicalWinRates[agencyCode] ??
    CYC_PROFILE.historicalWinRates[alnCodes?.[0]] ??
    0.5;

  const strategic = computeStrategicFit(extractedFields);

  // Weights: semantic 35% · financial_990 25% · eligibility 20% · historical 15% · strategic 5%
  const composite = (
    semantic    * 0.35 +
    financial   * 0.25 +
    eligibility * 0.20 +
    historical  * 0.15 +
    strategic   * 0.05
  ) * 100;

  return {
    composite:     Math.min(100, Math.max(0, composite)),
    semantic:      semantic    * 100,
    eligibility:   eligibility * 100,
    financial_990: financial   * 100,
    historical:    historical  * 100,
    strategic:     strategic   * 100,
  };
}

export function generateRecommendation(score: ScoreBreakdown, _fields: ExtractedFields): string {
  const fin = score.financial_990 >= 70 ? 'financial profile is well-matched' :
              score.financial_990 >= 40 ? 'financial profile is adequate' : 'financial profile needs review';
  if (score.composite >= 70) {
    return `Strong match (${score.composite.toFixed(0)}/100). High program alignment and ${fin}. Recommend immediate eligibility review.`;
  } else if (score.composite >= 40) {
    return `Moderate match (${score.composite.toFixed(0)}/100). Some alignment detected; ${fin}. Verify eligibility before pursuing.`;
  }
  return `Low match (${score.composite.toFixed(0)}/100). Limited program or financial alignment. Review 990 signals before investing application resources.`;
}

export function getEligibilityFlags(fields: ExtractedFields): string[] {
  const flags: string[] = [];
  if (fields.cost_sharing_required) {
    flags.push(`Cost share required: ${fields.cost_sharing_percentage ?? 'unknown'}%`);
  }
  if (fields.geographic_scope === 'state' && !fields.geographic_states?.includes('IL')) {
    flags.push('May not be eligible in Illinois');
  }
  if (fields.compliance_frameworks?.some(f => f.includes('GATA'))) {
    flags.push('GATA required — CYC registered ✓');
  }
  return flags;
}
