/**
 * Reverse 990 Screening Engine  v2
 *
 * Given an organization's IRS Form 990 financial profile and a grant opportunity,
 * produces a structured eligibility assessment across 7 financial dimensions.
 *
 * v2 additions:
 *  • Multi-year revenue trend signal (growth trajectory matters to funders)
 *  • Executive compensation efficiency signal
 *  • Self-reported org profile integration (overrides stale 990 fields when available)
 *  • Data confidence metadata (how many years old is the most recent filing?)
 *  • Rebalanced weights across 7 signals
 */

import { ComputedFinancials, OrgProfile, Filing990 } from './propublica';
import { ExtractedFields } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalStatus = 'match' | 'likely' | 'unknown' | 'mismatch';

export interface EligibilitySignal {
  factor:    string;
  status:    SignalStatus;
  headline:  string;      // one-line conclusion
  detail:    string;      // supporting data for the analyst
  score:     number;      // 0.0–1.0 contribution
  weight:    number;      // relative weight (sum across all signals = 1.0)
  source?:   'irs_990' | 'self_reported' | 'estimated' | 'n/a';
}

export interface FinancialEligibilityResult {
  score:              number;     // 0–100 composite score
  signals:            EligibilitySignal[];
  preQualified:       boolean;
  hardDisqualifiers:  string[];
  dataConfidence:     DataConfidence;
}

export interface DataConfidence {
  level:           'high' | 'medium' | 'low' | 'none';
  filingYear:      number | null;
  dataAgeYears:    number | null;
  hasProfileData:  boolean;    // true if org filled out self-reported profile
  label:           string;
}

/** Subset of OrgProfileData used by the screener — avoids circular import */
export interface ProfileOverrides {
  current_annual_budget?:       number;
  current_annual_revenue?:      number;
  current_months_reserves?:     number;
  current_net_assets?:          number;
  current_govt_revenue_pct?:    number;
  current_private_grants_pct?:  number;
  current_program_revenue_pct?: number;
}

export interface ScreenOptions {
  /** Historical filings (up to 5 years) from stored 990 snapshot */
  history?: Array<Pick<Filing990, 'tax_prd_yr' | 'totrevenue' | 'totfuncexpns' | 'compnsatncurrofcr'>>;
  /** Self-reported current-year data from org profile portal */
  profileData?: ProfileOverrides;
  /** Current calendar year — used to compute data age */
  currentYear?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FEDERAL_AGENCY_CODES = new Set([
  'ED', 'HHS', 'HHS-ACF', 'HHS-HRSA', 'HHS-SAMHSA', 'HHS-CDC',
  'DOJ', 'HUD', 'USDA', 'DOL', 'DOT', 'EPA', 'SBA', 'NSF', 'NEA', 'NEH',
  'IMLS', 'CNCS', 'FEMA', 'NIH', 'NIJ',
]);

function isFederalGrant(agencyCode: string, alnCodes: string[]): boolean {
  if (FEDERAL_AGENCY_CODES.has(agencyCode?.toUpperCase())) return true;
  if (alnCodes?.some(a => /^\d{2}\.\d{3}/.test(a))) return true;
  return false;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// NTEE major-group → grant program area keywords
const NTEE_MAP: Record<string, string[]> = {
  A: ['arts', 'culture', 'humanities', 'museum', 'theater', 'music', 'dance', 'creative'],
  B: ['education', 'school', 'stem', 'steam', 'literacy', 'academic', 'learning', 'early childhood', 'college readiness', 'classroom', 'tutoring'],
  C: ['environment', 'conservation', 'climate', 'energy', 'sustainability', 'green'],
  D: ['animal', 'wildlife', 'veterinary', 'pet'],
  E: ['health', 'healthcare', 'hospital', 'medical', 'primary care', 'public health', 'wellness'],
  F: ['mental health', 'counseling', 'behavioral health', 'substance abuse', 'addiction', 'crisis', 'trauma'],
  G: ['disease', 'cancer', 'chronic illness', 'disorder'],
  H: ['medical research', 'biomedical', 'clinical trial', 'health research'],
  I: ['crime', 'legal', 'justice', 'reentry', 'corrections', 'public safety', 'violence prevention', 'delinquency'],
  J: ['workforce', 'employment', 'job training', 'career', 'vocational', 'labor', 'apprenticeship'],
  K: ['food', 'nutrition', 'hunger', 'food security', 'agriculture', 'food bank', 'meal'],
  L: ['housing', 'homelessness', 'shelter', 'affordable housing', 'hud', 'eviction prevention'],
  M: ['emergency', 'disaster', 'public safety', 'fire', 'ems', 'first responder'],
  N: ['recreation', 'sports', 'fitness', 'parks', 'leisure', 'athletics'],
  O: ['youth', 'youth development', 'afterschool', 'mentoring', 'teen', 'juvenile', 'camp', 'child', 'summer program', 'out-of-school'],
  P: ['human services', 'social services', 'family', 'poverty', 'low-income', 'community services', 'basic needs'],
  Q: ['international', 'global', 'foreign', 'refugee', 'immigrant', 'global health'],
  R: ['civil rights', 'equity', 'advocacy', 'discrimination', 'racial justice', 'voting'],
  S: ['community development', 'neighborhood', 'civic', 'community improvement', 'revitalization'],
  T: ['philanthropy', 'foundation', 'giving', 'volunteer', 'capacity building'],
  U: ['science', 'technology', 'research', 'innovation', 'data', 'ai'],
  W: ['government', 'public policy', 'civic education', 'democratic'],
};

// ── Signal 1: Budget Fit ───────────────────────────────────────────────────────

function scoreBudgetFit(
  orgRevenue: number,
  awardFloor: number | null,
  awardCeiling: number | null,
  isProfileData: boolean,
): EligibilitySignal {
  const weight  = 0.20;
  const source: EligibilitySignal['source'] = isProfileData ? 'self_reported' : 'irs_990';
  const tag     = isProfileData ? ' (self-reported)' : '';

  if (!awardCeiling && !awardFloor) {
    return { factor: 'Budget Fit', status: 'unknown', source,
      headline: 'Award amount not specified — budget fit unverifiable',
      detail: 'Cannot assess budget fit without a defined award range. Review RFP for unofficial size signals.',
      score: 0.5, weight };
  }

  const award   = awardCeiling || awardFloor || 0;
  const tooSmall = orgRevenue / 500;    // <0.2% of budget
  const idealMin = orgRevenue / 200;    // 0.5%
  const idealMax = orgRevenue / 10;     // 10%
  const large    = orgRevenue / 3;      // 33% dependency risk
  const tooLarge = orgRevenue * 1.0;    // >100% absorption impossibility

  const pct = ((award / orgRevenue) * 100).toFixed(1);

  if (award < tooSmall) return {
    factor: 'Budget Fit', status: 'mismatch', source,
    headline: `Award (${fmt(award)}) is <0.2% of budget${tag} — too small to justify`,
    detail: `${fmt(orgRevenue)} annual budget${tag}; ${pct}% yield makes administrative overhead likely to exceed strategic value.`,
    score: 0.2, weight };

  if (award < idealMin) return {
    factor: 'Budget Fit', status: 'likely', source,
    headline: `Award (${fmt(award)}) is small relative to org size — consider ROI`,
    detail: `${fmt(award)} = ${pct}% of ${fmt(orgRevenue)} budget${tag}. Eligible, but weigh application cost against award value.`,
    score: 0.55, weight };

  if (award <= idealMax) return {
    factor: 'Budget Fit', status: 'match', source,
    headline: `Award (${fmt(award)}) is ${pct}% of budget${tag} — optimal range`,
    detail: `Well-calibrated: meaningful enough to move the needle, small enough to avoid single-source dependency.`,
    score: 1.0, weight };

  if (award <= large) return {
    factor: 'Budget Fit', status: 'likely', source,
    headline: `Award (${fmt(award)}) = ${pct}% of budget${tag} — elevated dependency`,
    detail: `Manageable but significant. Plan for renewal risk in budget projections if awarded.`,
    score: 0.65, weight };

  if (award < tooLarge) return {
    factor: 'Budget Fit', status: 'likely', source,
    headline: `Award (${fmt(award)}) large relative to budget${tag} — verify absorption capacity`,
    detail: `${pct}% of budget. Document financial controls and staffing capacity explicitly in the application narrative.`,
    score: 0.4, weight };

  return {
    factor: 'Budget Fit', status: 'mismatch', source,
    headline: `Award (${fmt(award)}) exceeds total revenue${tag} — absorption risk`,
    detail: `Grant exceeds annual budget. Most funders view this as a disqualifying risk — consider consortia or phased application.`,
    score: 0.1, weight };
}

// ── Signal 2: Financial Stability ────────────────────────────────────────────

function scoreFinancialStability(
  monthsOfReserves: number,
  netAssets: number,
  isProfileData: boolean,
): EligibilitySignal {
  const weight = 0.20;
  const source: EligibilitySignal['source'] = isProfileData ? 'self_reported' : 'irs_990';
  const tag = isProfileData ? ' (self-reported)' : '';

  const reserveScore =
    monthsOfReserves >= 6 ? 1.0 :
    monthsOfReserves >= 3 ? 0.75 :
    monthsOfReserves >= 1 ? 0.4 : 0.1;

  const netAssetsPositive = netAssets > 0;
  const rawScore  = reserveScore * 0.6 + (netAssetsPositive ? 1.0 : 0.0) * 0.4;
  const status: SignalStatus = rawScore >= 0.8 ? 'match' : rawScore >= 0.5 ? 'likely' : 'mismatch';

  const reserveLabel =
    monthsOfReserves >= 6 ? 'strong (≥6mo benchmark)' :
    monthsOfReserves >= 3 ? 'adequate (3–6mo)' :
    monthsOfReserves >= 1 ? 'below benchmark (<3mo)' : 'critical (<1mo)';

  return {
    factor: 'Financial Stability', status, source,
    headline: `${monthsOfReserves}mo operating reserves${tag} · Net assets ${netAssetsPositive ? '+' : ''}${fmt(netAssets)}`,
    detail: `Reserves: ${reserveLabel}. Net assets ${netAssetsPositive ? 'positive — accumulated surplus' : 'negative — liabilities exceed assets, a common funder flag'}. Most competitive grants require ≥3 months of reserves.`,
    score: rawScore, weight,
  };
}

// ── Signal 3: Funding Source Diversification ─────────────────────────────────

function scoreFundingDiversification(
  govtPct: number,
  agencyCode: string,
  alnCodes: string[],
  isProfileData: boolean,
): EligibilitySignal {
  const weight  = 0.15;
  const source: EligibilitySignal['source'] = isProfileData ? 'self_reported' : 'irs_990';
  const tag     = isProfileData ? ' (self-reported)' : '';
  const federal = isFederalGrant(agencyCode, alnCodes);

  if (federal) return {
    factor: 'Funding Diversification', status: 'match', source: 'n/a',
    headline: `Federal grant — no private diversification requirement`,
    detail: `Federal programs (ALN/CFDA) do not restrict based on government revenue concentration. ${govtPct}% govt revenue${tag} is irrelevant here.`,
    score: 1.0, weight };

  if (govtPct < 30) return {
    factor: 'Funding Diversification', status: 'match', source,
    headline: `${govtPct}% government revenue${tag} — well-diversified funding base`,
    detail: `Private foundations prefer <50% government revenue. At ${govtPct}%, this org demonstrates strong diversification and reduced policy-change risk.`,
    score: 1.0, weight };

  if (govtPct < 50) return {
    factor: 'Funding Diversification', status: 'likely', source,
    headline: `${govtPct}% government revenue${tag} — approaching private funder thresholds`,
    detail: `Many private foundations prefer <50% government revenue. Address diversification strategy proactively in the narrative.`,
    score: 0.65, weight };

  if (govtPct < 70) return {
    factor: 'Funding Diversification', status: 'likely', source,
    headline: `${govtPct}% government revenue${tag} — elevated concentration`,
    detail: `Exceeds 50% govt revenue, which many private funders flag. Include a diversification roadmap and explain how this grant fits that strategy.`,
    score: 0.4, weight };

  return {
    factor: 'Funding Diversification', status: 'mismatch', source,
    headline: `${govtPct}% government revenue${tag} — critical concentration for private funder`,
    detail: `At ${govtPct}%, this org may not meet private foundation eligibility criteria (typical cap: 50–60%). Federal applications are unaffected.`,
    score: 0.15, weight };
}

// ── Signal 4: Organizational Scale ───────────────────────────────────────────

function scoreOrgScale(
  computed: ComputedFinancials,
  awardCeiling: number | null,
): EligibilitySignal {
  const weight = 0.10;
  const programRev   = computed.totalRevenue * (computed.programRevenuePct / 100);
  const hasDelivery  = programRev > 100_000;
  const hasAssetBase = computed.netAssets > 50_000;

  let score = 0.5; let status: SignalStatus = 'unknown';
  let headline = ''; let detail = '';

  if (hasDelivery && hasAssetBase) {
    score = 0.9; status = 'match';
    headline = `${fmt(programRev)} program revenue + ${fmt(computed.netAssets)} net assets — proven delivery scale`;
    detail = `Active program revenue confirms service delivery capacity. Net asset base demonstrates financial infrastructure to manage grant funds responsibly.`;
  } else if (hasDelivery) {
    score = 0.65; status = 'likely';
    headline = `${fmt(programRev)} program revenue — delivery track record established`;
    detail = `Active delivery revenue confirmed. Net assets <$50K — ensure financial controls documentation is robust.`;
  } else if (hasAssetBase) {
    score = 0.55; status = 'likely';
    headline = `${fmt(computed.netAssets)} asset base — infrastructure adequate, limited program revenue`;
    detail = `Net assets demonstrate stability. Low program service revenue — document volume using non-financial metrics (participants, sites, outputs).`;
  } else {
    score = 0.3; status = 'mismatch';
    headline = `Limited program revenue and asset base — capacity documentation critical`;
    detail = `Competitive grants typically require demonstrated financial infrastructure. Strong non-financial evidence (partnerships, track record) becomes essential.`;
  }

  if (awardCeiling && awardCeiling > 1_000_000 && score < 0.7) {
    score = Math.max(0.1, score - 0.15);
    detail += ` Awards above $1M typically require commensurate organizational scale — elevated risk factor.`;
  }

  return { factor: 'Organizational Scale', status, source: 'irs_990', headline, detail, score, weight };
}

// ── Signal 5: NTEE / Mission Alignment ───────────────────────────────────────

function scoreNteeAlignment(
  orgNteeCode: string | null | undefined,
  grantProgramAreas: string[],
): EligibilitySignal {
  const weight = 0.15;

  if (!orgNteeCode || !grantProgramAreas?.length) return {
    factor: 'Mission Alignment', status: 'unknown', source: 'irs_990',
    headline: 'Program area mapping unavailable',
    detail: 'Insufficient data to assess NTEE/mission alignment. Review grant focus areas manually.',
    score: 0.5, weight };

  const nteeGroup  = orgNteeCode.charAt(0).toUpperCase();
  const orgKeywords = NTEE_MAP[nteeGroup] || [];

  if (!orgKeywords.length) return {
    factor: 'Mission Alignment', status: 'unknown', source: 'irs_990',
    headline: `NTEE ${nteeGroup} — no keyword mapping available`,
    detail: `NTEE group ${nteeGroup} is not yet mapped. Manual review of program alignment required.`,
    score: 0.5, weight };

  const grantAreas = grantProgramAreas.map(a => a.toLowerCase());
  const matches = grantAreas.filter(ga =>
    orgKeywords.some(kw => ga.includes(kw) || kw.includes(ga))
  );
  const matchRatio = matches.length / grantAreas.length;

  if (matchRatio >= 0.5) return {
    factor: 'Mission Alignment', status: 'match', source: 'irs_990',
    headline: `NTEE ${nteeGroup} aligns with ${matches.length}/${grantAreas.length} grant program areas`,
    detail: `Strong mission overlap: ${matches.slice(0, 3).join(', ')}${matches.length > 3 ? ` +${matches.length - 3} more` : ''}. NTEE ${orgNteeCode} organizations are well-positioned.`,
    score: 0.9, weight };

  if (matchRatio >= 0.25 || matches.length >= 1) return {
    factor: 'Mission Alignment', status: 'likely', source: 'irs_990',
    headline: `Partial NTEE alignment — ${matches.length} of ${grantAreas.length} program areas overlap`,
    detail: `Matched areas: ${matches.join(', ') || 'none direct'}. Application narrative should explicitly bridge organizational mission to funder focus areas.`,
    score: 0.55, weight };

  return {
    factor: 'Mission Alignment', status: 'mismatch', source: 'irs_990',
    headline: `NTEE ${nteeGroup} does not align with grant program areas`,
    detail: `Grant focuses on: ${grantAreas.slice(0, 3).join(', ')}. Org NTEE ${orgNteeCode} maps to: ${orgKeywords.slice(0, 3).join(', ')}. Mission misalignment is a common basis for rejection.`,
    score: 0.15, weight };
}

// ── Signal 6: Multi-Year Revenue Trend ───────────────────────────────────────
// Funders view growing, stable orgs as lower-risk partners.
// Declining or volatile revenue raises sustainability concerns.

function scoreMultiYearTrend(
  history: Array<Pick<Filing990, 'tax_prd_yr' | 'totrevenue'>>,
): EligibilitySignal {
  const weight = 0.15;

  if (!history || history.length < 2) return {
    factor: 'Revenue Trend', status: 'unknown', source: 'irs_990',
    headline: 'Insufficient filing history for trend analysis',
    detail: 'Two or more consecutive 990 filings are required to assess revenue trajectory. Run 990 sync to populate historical data.',
    score: 0.5, weight };

  // Sort oldest → newest
  const sorted = [...history]
    .filter(f => f.totrevenue > 0)
    .sort((a, b) => a.tax_prd_yr - b.tax_prd_yr);

  if (sorted.length < 2) return {
    factor: 'Revenue Trend', status: 'unknown', source: 'irs_990',
    headline: 'Insufficient positive-revenue filings for trend analysis',
    detail: 'At least two filings with positive revenue are required.',
    score: 0.5, weight };

  const revenues = sorted.map(f => f.totrevenue);
  const first    = revenues[0];
  const last     = revenues[revenues.length - 1];
  const years    = sorted[sorted.length - 1].tax_prd_yr - sorted[0].tax_prd_yr;
  const cagr     = years > 0 ? Math.pow(last / first, 1 / years) - 1 : 0;
  const cagrPct  = (cagr * 100).toFixed(1);

  // Volatility: coefficient of variation (std dev / mean)
  const mean  = revenues.reduce((s, r) => s + r, 0) / revenues.length;
  const std   = Math.sqrt(revenues.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / revenues.length);
  const cv    = std / mean; // 0 = perfectly stable, >0.3 = high volatility

  const spanLabel = `${sorted[0].tax_prd_yr}–${sorted[sorted.length - 1].tax_prd_yr}`;

  // Score matrix: growth rate × stability
  if (cagr >= 0.05 && cv < 0.20) return {
    factor: 'Revenue Trend', status: 'match', source: 'irs_990',
    headline: `+${cagrPct}% annual revenue growth (${spanLabel}) — strong, stable trajectory`,
    detail: `CAGR of ${cagrPct}%/yr over ${years} years with low volatility (CV=${(cv * 100).toFixed(0)}%). Growing, consistent organizations are highly competitive with most funders.`,
    score: 1.0, weight };

  if (cagr >= 0.02 && cv < 0.25) return {
    factor: 'Revenue Trend', status: 'match', source: 'irs_990',
    headline: `+${cagrPct}% annual revenue growth (${spanLabel}) — healthy upward trend`,
    detail: `Moderate growth with acceptable stability. ${years}-year trajectory from ${fmt(first)} to ${fmt(last)} demonstrates organizational momentum.`,
    score: 0.80, weight };

  if (Math.abs(cagr) < 0.02 && cv < 0.15) return {
    factor: 'Revenue Trend', status: 'likely', source: 'irs_990',
    headline: `Revenue stable (${spanLabel}) — consistent operations, limited growth`,
    detail: `${fmt(first)}→${fmt(last)} over ${years} years — negligible change (${cagrPct}%/yr CAGR). Stable organizations are considered reliable partners, though funders may prefer growth stories.`,
    score: 0.65, weight };

  if (cv >= 0.30) return {
    factor: 'Revenue Trend', status: 'likely', source: 'irs_990',
    headline: `High revenue volatility (${spanLabel}) — address financial sustainability narrative`,
    detail: `Coefficient of variation of ${(cv * 100).toFixed(0)}% indicates inconsistent revenue year-over-year. Application should explicitly address what drove volatility and how it's been managed.`,
    score: 0.40, weight };

  if (cagr < -0.05) return {
    factor: 'Revenue Trend', status: 'mismatch', source: 'irs_990',
    headline: `${cagrPct}% annual revenue decline (${spanLabel}) — significant funder concern`,
    detail: `Revenue declined from ${fmt(first)} to ${fmt(last)} over ${years} years. Declining trend is a primary filter for many funders — the application must include a credible turnaround or diversification narrative.`,
    score: 0.20, weight };

  return {
    factor: 'Revenue Trend', status: 'likely', source: 'irs_990',
    headline: `Revenue trending ${cagr >= 0 ? 'slightly upward' : 'slightly down'} (${spanLabel})`,
    detail: `${cagrPct}%/yr CAGR over ${years} years (${fmt(first)}→${fmt(last)}). Moderate variation. Acceptable to most funders; include a forward-looking sustainability narrative.`,
    score: 0.55, weight };
}

// ── Signal 7: Executive Compensation Efficiency ───────────────────────────────
// High officer compensation relative to total expenses flags governance concerns.
// Charity Navigator and many funders benchmark this against 25%.

function scoreExecutiveEfficiency(
  officerComp: number,
  totalExpenses: number,
): EligibilitySignal {
  const weight = 0.05;

  if (!officerComp || !totalExpenses || totalExpenses === 0) return {
    factor: 'Executive Efficiency', status: 'unknown', source: 'irs_990',
    headline: 'Officer compensation data unavailable',
    detail: 'IRS 990 officer compensation line not populated. Cannot assess governance efficiency.',
    score: 0.5, weight };

  const pct = (officerComp / totalExpenses) * 100;
  const pctLabel = pct.toFixed(1);

  if (pct < 10) return {
    factor: 'Executive Efficiency', status: 'match', source: 'irs_990',
    headline: `Officer compensation is ${pctLabel}% of total expenses — lean governance`,
    detail: `${fmt(officerComp)} in officer comp against ${fmt(totalExpenses)} total expenses. Well below the 25% Charity Navigator threshold. Signals strong program-forward governance.`,
    score: 1.0, weight };

  if (pct < 20) return {
    factor: 'Executive Efficiency', status: 'match', source: 'irs_990',
    headline: `Officer compensation is ${pctLabel}% of expenses — within normal range`,
    detail: `${fmt(officerComp)} officer comp (${pctLabel}%). Below the 25% watchdog threshold. Generally acceptable to funders.`,
    score: 0.75, weight };

  if (pct < 30) return {
    factor: 'Executive Efficiency', status: 'likely', source: 'irs_990',
    headline: `Officer compensation is ${pctLabel}% of expenses — approaching watchdog threshold`,
    detail: `${fmt(officerComp)} in officer comp. Above 25% triggers flags from Charity Navigator and some foundation funders. Proactively address compensation rationale if applying to watchdog-conscious funders.`,
    score: 0.45, weight };

  return {
    factor: 'Executive Efficiency', status: 'mismatch', source: 'irs_990',
    headline: `Officer compensation is ${pctLabel}% of expenses — governance flag`,
    detail: `${fmt(officerComp)} officer comp against ${fmt(totalExpenses)} total expenses exceeds the 25% threshold commonly used by Charity Navigator and institutional funders. Include board compensation rationale in the application.`,
    score: 0.20, weight };
}

// ── Data Confidence Calculator ────────────────────────────────────────────────

function computeDataConfidence(
  filingYear: number | null,
  hasProfileData: boolean,
  currentYear: number,
): DataConfidence {
  if (!filingYear) return {
    level: 'none', filingYear: null, dataAgeYears: null,
    hasProfileData, label: 'No 990 data synced',
  };

  const age = currentYear - filingYear;
  const level =
    age <= 1 ? 'high' :
    age <= 3 ? 'medium' : 'low';

  const label = hasProfileData
    ? `IRS FY${filingYear} + self-reported current data`
    : age === 0 ? `IRS FY${filingYear} (current)`
    : `IRS FY${filingYear} (${age} year${age > 1 ? 's' : ''} old)`;

  return { level, filingYear, dataAgeYears: age, hasProfileData, label };
}

// ── Main screener ─────────────────────────────────────────────────────────────

export function screen990Against(
  computed: ComputedFinancials,
  org: OrgProfile,
  fields: ExtractedFields,
  agencyCode: string,
  alnCodes: string[],
  options: ScreenOptions = {},
): FinancialEligibilityResult {
  const { history, profileData, currentYear = new Date().getFullYear() } = options;

  // ── Resolve effective values: prefer self-reported over stale 990 ──────────
  const effectiveRevenue      = profileData?.current_annual_budget    || profileData?.current_annual_revenue || computed.totalRevenue;
  const effectiveMonths       = profileData?.current_months_reserves  ?? computed.monthsOfReserves;
  const effectiveNetAssets    = profileData?.current_net_assets       ?? computed.netAssets;
  const effectiveGovtPct      = profileData?.current_govt_revenue_pct ?? computed.governmentGrantsPct;
  const hasProfileData        = !!(profileData && Object.values(profileData).some(v => v !== undefined && v !== 0));

  const signals: EligibilitySignal[] = [
    scoreBudgetFit(
      effectiveRevenue,
      fields.award_floor   ?? null,
      fields.award_ceiling ?? null,
      hasProfileData && !!(profileData?.current_annual_budget || profileData?.current_annual_revenue),
    ),
    scoreFinancialStability(
      effectiveMonths,
      effectiveNetAssets,
      hasProfileData && !!(profileData?.current_months_reserves || profileData?.current_net_assets),
    ),
    scoreFundingDiversification(
      effectiveGovtPct,
      agencyCode,
      alnCodes,
      hasProfileData && profileData?.current_govt_revenue_pct !== undefined,
    ),
    scoreOrgScale(computed, fields.award_ceiling ?? null),
    scoreNteeAlignment(org.ntee_code, fields.program_areas ?? []),
    scoreMultiYearTrend(history ?? []),
    scoreExecutiveEfficiency(computed.filingYear ? 0 : 0, 0), // populated below
  ];

  // For exec comp, we need the raw filing data — pass via history[0] as current year
  // Re-score using actual data if history has the latest filing
  if (history && history.length > 0) {
    const latest = [...history].sort((a, b) => b.tax_prd_yr - a.tax_prd_yr)[0];
    signals[6] = scoreExecutiveEfficiency(
      latest.compnsatncurrofcr ?? 0,
      latest.totfuncexpns ?? 0,
    );
  }

  // ── Composite score ────────────────────────────────────────────────────────
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const rawScore    = signals.reduce((s, sig) => s + sig.score * sig.weight, 0) / totalWeight;
  const score       = Math.round(Math.min(100, Math.max(0, rawScore * 100)));

  // ── Hard disqualifiers ─────────────────────────────────────────────────────
  const hardDisqualifiers = signals
    .filter(s => s.status === 'mismatch' && ['Budget Fit', 'Financial Stability'].includes(s.factor))
    .map(s => s.headline);

  const preQualified = hardDisqualifiers.length === 0;

  const dataConfidence = computeDataConfidence(computed.filingYear, hasProfileData, currentYear);

  return { score, signals, preQualified, hardDisqualifiers, dataConfidence };
}

// ── Neutral fallback ──────────────────────────────────────────────────────────
export function neutralFinancialResult(): FinancialEligibilityResult {
  return {
    score: 50,
    signals: [],
    preQualified: true,
    hardDisqualifiers: [],
    dataConfidence: { level: 'none', filingYear: null, dataAgeYears: null, hasProfileData: false, label: 'No 990 data' },
  };
}
