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

// ── Hard-exclusion gate ─────────────────────────────────────────────────────
//
// Agencies, keywords, and scopes that are incompatible with a Chicago youth
// nonprofit regardless of embedding similarity.  Returns a human-readable
// reason string when excluded, or null when the grant should proceed.

const EXCLUDED_AGENCIES = new Set([
  'DOS',   // State Dept (international)
  'STATE', // State Dept alt code
  'DOD',   // Dept of Defense
  'USAID', // US Agency for International Development
  'ARMY',  // US Army
  'NAVY',  // US Navy
  'AIR',   // Air Force
  'MDA',   // Missile Defense Agency
  'DARPA', // Defense Advanced Research Projects
  'NSA',   // National Security Agency
  'DIA',   // Defense Intelligence Agency
  'USMC',  // Marine Corps
]);

// Title/synopsis keywords that indicate international/foreign-aid grants
const INTERNATIONAL_KEYWORDS = [
  'ukraine', 'ukrainian', 'russia', 'russian',
  'afghanistan', 'afghan',
  'israel', 'gaza', 'west bank',
  'iraq', 'syria', 'somalia', 'sudan', 'myanmar',
  'overseas', 'foreign country', 'foreign nation',
  'international development',
  'usaid', 'foreign assistance',
  'refugees abroad', 'displaced persons abroad',
  'global health',
  'democracy abroad', 'rule of law abroad',
  'peacekeeping', 'military support',
  'arms', 'weapons', 'combat',
  'embassy', 'consulate',
];

// Agency code prefixes that signal military/defence/international
const EXCLUDED_AGENCY_PREFIXES = ['DOD-', 'ARMY-', 'NAVY-', 'USAF-', 'DLA-'];

export function hardExclusionReason(
  agencyCode: string,
  title: string,
  synopsis: string,
  fullText: string,
): string | null {
  const code = (agencyCode || '').toUpperCase();

  // Direct agency exclusion
  if (EXCLUDED_AGENCIES.has(code)) {
    return `Agency ${agencyCode} is outside CYC's eligible funding universe (international/defense)`;
  }
  for (const prefix of EXCLUDED_AGENCY_PREFIXES) {
    if (code.startsWith(prefix)) {
      return `Agency prefix ${prefix} indicates defense/military funding — excluded`;
    }
  }

  // International keyword scan (case-insensitive, whole-word)
  const textToScan = `${title} ${synopsis} ${fullText}`.toLowerCase();
  for (const kw of INTERNATIONAL_KEYWORDS) {
    if (textToScan.includes(kw)) {
      return `Grant references international/foreign context ("${kw}") — not applicable to Chicago domestic nonprofit`;
    }
  }

  return null; // grant passes hard gate
}

// ── Eligibility scoring ─────────────────────────────────────────────────────

function computeEligibility(fields: ExtractedFields): number {
  let score = 0;

  // Entity type (35%)
  if (!fields.eligible_entity_types?.length) {
    score += 0.7 * 0.35; // unknown → partial credit (conservative)
  } else {
    const isEligible = fields.eligible_entity_types.some(t =>
      t.toLowerCase().includes('nonprofit') ||
      t.toLowerCase().includes('501') ||
      t.toLowerCase().includes('non-profit') ||
      t.toLowerCase().includes('charity')
    );
    const isExplicitlyExcluded = fields.eligible_entity_types.every(t =>
      t.toLowerCase().includes('government') ||
      t.toLowerCase().includes('tribal') ||
      t.toLowerCase().includes('state only') ||
      t.toLowerCase().includes('for-profit')
    );
    score += (isExplicitlyExcluded ? 0.0 : isEligible ? 1.0 : 0.4) * 0.35;
  }

  // Geography (30%) — increased weight because Chicago-specificity matters
  const scope = fields.geographic_scope || 'national';
  if (scope === 'international' || scope === 'foreign') {
    return 0; // hard zero — IL org cannot apply to international grants
  } else if (scope === 'national' || !scope) {
    score += 1.0 * 0.30;
  } else if (scope === 'state') {
    if (fields.geographic_states?.includes('IL')) {
      score += 1.0 * 0.30;
    } else if (!fields.geographic_states?.length) {
      score += 0.6 * 0.30;
    } else {
      score += 0.0 * 0.30; // explicitly excludes IL
    }
  } else if (scope === 'city' || scope === 'local') {
    if (fields.geographic_states?.includes('IL')) {
      score += 0.8 * 0.30;
    } else {
      score += 0.1 * 0.30;
    }
  } else {
    score += 0.5 * 0.30;
  }

  // Target population alignment (20%)
  const grantPops = fields.target_population?.map(p => p.toLowerCase()) || [];
  const orgPops   = CYC_PROFILE.targetPopulations.map(p => p.toLowerCase());
  if (!grantPops.length) {
    score += 0.4 * 0.20; // unknown — conservative
  } else {
    const matches = grantPops.filter(gp =>
      orgPops.some(op => gp.includes(op) || op.includes(gp))
    );
    score += Math.min(1.0, matches.length / Math.max(grantPops.length, 1)) * 0.20;
  }

  // Compliance (15%)
  const requiresGATA = fields.compliance_frameworks?.some(f => f.toUpperCase().includes('GATA'));
  score += (!requiresGATA || CYC_PROFILE.gataRegistered ? 1.0 : 0.2) * 0.15;

  return Math.min(1.0, score);
}

// ── Strategic fit scoring ───────────────────────────────────────────────────

function computeStrategicFit(fields: ExtractedFields): number {
  let score = 0;

  // Program area overlap (60%) — most important strategic signal
  const grantAreas = fields.program_areas?.map(a => a.toLowerCase()) || [];
  const orgAreas   = CYC_PROFILE.programs.flatMap(p => p.areas.map(a => a.toLowerCase()));

  if (!grantAreas.length) {
    score += 0.25 * 0.60; // unknown — conservative (was 0.3 before, lowered to reduce noise)
  } else {
    const intersection = grantAreas.filter(ga =>
      orgAreas.some(oa => ga.includes(oa) || oa.includes(ga) || editDistance(ga, oa) <= 2)
    );
    const jaccard = intersection.length / new Set([...grantAreas, ...orgAreas]).size;
    score += jaccard * 0.60;
  }

  // Award size fit (30%)
  const awardMin = fields.award_floor   || 0;
  const awardMax = fields.award_ceiling || awardMin;
  const orgMin   = 50_000;
  const orgMax   = 750_000;

  if (!awardMax) {
    score += 0.5 * 0.30;
  } else {
    const overlapMin = Math.max(orgMin, awardMin);
    const overlapMax = Math.min(orgMax, awardMax);
    if (overlapMax > overlapMin) {
      const unionSpan = Math.max(orgMax, awardMax) - Math.min(orgMin, awardMin);
      score += ((overlapMax - overlapMin) / unionSpan) * 0.30;
    }
    // Penalty for grants far outside our range
    else if (awardMax < 10_000) {
      score += 0.05 * 0.30; // too small
    }
  }

  // Compliance / operational fit (10%)
  score += 0.8 * 0.10;

  return Math.min(1.0, score);
}

// Simple edit distance for fuzzy program area matching
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 4) return 99;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// ── Composite score ─────────────────────────────────────────────────────────

export function computeMatchScore(
  grantEmbedding: number[],
  orgEmbedding: number[],
  extractedFields: ExtractedFields,
  agencyCode: string,
  alnCodes: string[],
  financialResult?: FinancialEligibilityResult,
): ScoreBreakdown {
  const semantic    = cosineSimilarity(grantEmbedding, orgEmbedding);
  const eligibility = computeEligibility(extractedFields);
  const financial   = (financialResult ?? neutralFinancialResult()).score / 100;

  const historical =
    CYC_PROFILE.historicalWinRates[agencyCode] ??
    CYC_PROFILE.historicalWinRates[alnCodes?.[0]] ??
    0.35; // reduced default: was 0.5, now 0.35 to avoid over-crediting unknown agencies

  const strategic = computeStrategicFit(extractedFields);

  // Geography hard-zero: if international, everything collapses
  const geographyHardZero = extractedFields.geographic_scope === 'international' ||
                             extractedFields.geographic_scope === 'foreign';
  if (geographyHardZero) {
    return {
      composite: 0, semantic: 0, eligibility: 0,
      financial_990: 0, historical: 0, strategic: 0,
    };
  }

  // Weights: semantic 40% · eligibility 22% · financial_990 20% · strategic 12% · historical 6%
  // Rationale: semantic now dominant (we have better full-text); historical de-weighted
  // since it defaults high and shouldn't carry unknown grants
  const composite = (
    semantic    * 0.40 +
    eligibility * 0.22 +
    financial   * 0.20 +
    strategic   * 0.12 +
    historical  * 0.06
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

// ── Minimum store threshold ─────────────────────────────────────────────────
// Grants below this score are not worth storing or surfacing to the user.
export const MIN_STORE_SCORE = 32;

export function generateRecommendation(score: ScoreBreakdown, fields: ExtractedFields): string {
  const fin = score.financial_990 >= 70 ? 'financial profile is well-matched' :
              score.financial_990 >= 40 ? 'financial profile is adequate' : 'financial profile needs review';

  const geo = fields.geographic_scope === 'state' && fields.geographic_states?.includes('IL')
    ? 'Illinois-specific opportunity. '
    : fields.geographic_scope === 'national' ? 'National opportunity open to IL nonprofits. '
    : '';

  if (score.composite >= 70) {
    return `${geo}Strong match (${score.composite.toFixed(0)}/100). High program alignment and ${fin}. Recommend immediate eligibility review and application planning.`;
  } else if (score.composite >= 50) {
    return `${geo}Moderate-strong match (${score.composite.toFixed(0)}/100). Meaningful program alignment; ${fin}. Verify full eligibility criteria before committing resources.`;
  } else if (score.composite >= 35) {
    return `${geo}Partial match (${score.composite.toFixed(0)}/100). Some program or population overlap, but limited alignment overall. Review carefully — may fit a specific program only.`;
  }
  return `Low match (${score.composite.toFixed(0)}/100). Limited program and financial alignment with CYC's current priorities.`;
}

export function getEligibilityFlags(fields: ExtractedFields): string[] {
  const flags: string[] = [];
  if (fields.cost_sharing_required) {
    flags.push(`Cost share required${fields.cost_sharing_percentage ? `: ${fields.cost_sharing_percentage}%` : ''}`);
  }
  if (fields.geographic_scope === 'state' && fields.geographic_states?.length &&
      !fields.geographic_states.includes('IL')) {
    flags.push(`Geographic restriction: ${fields.geographic_states.join(', ')} only — CYC may not be eligible`);
  }
  if (fields.compliance_frameworks?.some(f => f.includes('GATA'))) {
    flags.push('GATA required — CYC registered ✓');
  }
  if (fields.grant_duration_months && fields.grant_duration_months < 6) {
    flags.push(`Short grant period: ${fields.grant_duration_months} months — assess implementation feasibility`);
  }
  return flags;
}
