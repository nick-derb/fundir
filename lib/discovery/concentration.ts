/**
 * Funding-concentration computation — Phase 6A.
 *
 * Reads the org's stored financial_data (sourced from the 990 +
 * self-reported overrides in profile_data) and produces a single
 * concentration snapshot: revenue breakdown by stream, the
 * Herfindahl-Hirschman concentration index, and a list of risk flags.
 *
 * Risk-flag thresholds are conservative and ungenerous:
 *   - govt_dependency        > 0.60  ('elevated_govt_dependency')
 *   - largest_stream         > 0.50  ('dominant_single_stream')
 *   - private_grants_share   < 0.10  AND govt > 0.60  ('underdeveloped_private_pipeline')
 *   - months_reserves        < 3.0   ('low_operating_reserves')
 *
 * The matcher and the dashboard surface these flags as actionable signals
 * — every flag carries a remediation hint, derived from the existing
 * corpus (e.g. 'You have 13 indexed foundation opportunities — start
 * cultivation now to balance government dependency.').
 */

import { createServerClient } from '@/lib/supabase';
import { getOrgFinancialProfile } from '@/lib/org-financials';

export interface RevenueBreakdown {
  govt_grants_pct:    number;
  private_grants_pct: number;
  program_revenue_pct: number;
  other_pct:          number;
  total_revenue:      number;
}

export interface ConcentrationRiskFlag {
  flag:            'elevated_govt_dependency' | 'dominant_single_stream' |
                   'underdeveloped_private_pipeline' | 'low_operating_reserves';
  severity:        'critical' | 'elevated' | 'moderate';
  metric:          string;
  remediation:     string;
}

export interface ConcentrationSnapshot {
  organization_id:      string;
  revenue_breakdown:    RevenueBreakdown;
  concentration_index:  number;
  risk_flags:           ConcentrationRiskFlag[];
}

function hhi(shares: number[]): number {
  // Herfindahl-Hirschman Index over revenue shares. Each share is 0..1;
  // HHI = sum of squares. Range: 1/n (perfectly diversified across n
  // streams) to 1 (single stream). Normalize to a 0..1 scale so the UI
  // can render a familiar progress bar.
  const total = shares.reduce((s, x) => s + x, 0);
  if (total === 0) return 0;
  return shares.reduce((acc, x) => acc + Math.pow(x / total, 2), 0);
}

/**
 * Compute a single concentration snapshot for one org. Reads
 * organizations.financial_data.computed (the 990-derived block we already
 * persist) and returns the structured snapshot without writing to DB —
 * the caller persists it.
 */
export async function computeConcentration(orgCode: string): Promise<ConcentrationSnapshot | null> {
  // Resolve org_id from org_code.
  const db = createServerClient();
  const { data: org } = await db
    .from('organizations')
    .select('id, financial_data')
    .eq('org_code', orgCode)
    .maybeSingle();
  if (!org) return null;

  // Prefer the same getOrgFinancialProfile resolution the matcher uses —
  // honors per-tenant fixtures (CYC) and falls back to the DB row.
  const fin = await getOrgFinancialProfile(orgCode);
  if (!fin) return null;
  const c = fin.computed;

  const govt_grants_pct     = (c.governmentGrantsPct ?? 0)  / 100;
  const private_grants_pct  = (c.privateGrantsPct ?? 0)     / 100;
  const program_revenue_pct = (c.programRevenuePct ?? 0)    / 100;
  // 'Other' captures the residual: investment income, special-event net,
  // misc. revenue. Floors at 0 to avoid negative shares from rounding.
  const known = govt_grants_pct + private_grants_pct + program_revenue_pct;
  const other_pct = Math.max(0, 1 - known);

  const breakdown: RevenueBreakdown = {
    govt_grants_pct, private_grants_pct, program_revenue_pct, other_pct,
    total_revenue: c.totalRevenue ?? 0,
  };

  const concentration_index = hhi([
    govt_grants_pct, private_grants_pct, program_revenue_pct, other_pct,
  ]);

  const flags: ConcentrationRiskFlag[] = [];

  if (govt_grants_pct > 0.60) {
    flags.push({
      flag:        'elevated_govt_dependency',
      severity:    govt_grants_pct > 0.75 ? 'critical' : 'elevated',
      metric:      `${Math.round(govt_grants_pct * 100)}% of revenue is government grants`,
      remediation: 'Build the private/foundation pipeline. The corpus has indexed foundation opportunities aligned to your segment — start cultivation now to absorb a federal cut.',
    });
  }

  const largest = Math.max(govt_grants_pct, private_grants_pct, program_revenue_pct, other_pct);
  if (largest > 0.50 && largest !== govt_grants_pct) {
    flags.push({
      flag:        'dominant_single_stream',
      severity:    largest > 0.65 ? 'elevated' : 'moderate',
      metric:      `Single stream is ${Math.round(largest * 100)}% of revenue`,
      remediation: 'One funder/stream pulling a check on its own would put the org under. Diversify the top stream.',
    });
  }

  if (private_grants_pct < 0.10 && govt_grants_pct > 0.60) {
    flags.push({
      flag:        'underdeveloped_private_pipeline',
      severity:    'moderate',
      metric:      `Private grants are only ${Math.round(private_grants_pct * 100)}% of revenue`,
      remediation: 'Foundation cultivation is the lever to balance government dependency. Phase 5 region adapters surface Chicago Metro foundation opportunities below.',
    });
  }

  if ((c.monthsOfReserves ?? 0) < 3.0) {
    flags.push({
      flag:        'low_operating_reserves',
      severity:    (c.monthsOfReserves ?? 0) < 1.5 ? 'critical' : 'elevated',
      metric:      `${(c.monthsOfReserves ?? 0).toFixed(1)} months of operating reserves`,
      remediation: 'Healthy benchmark is 3-6 months. Reimbursement-based federal awards (most of the corpus) compound the cash strain; prioritize foundation grants with advance payment terms.',
    });
  }

  return {
    organization_id:     org.id,
    revenue_breakdown:   breakdown,
    concentration_index,
    risk_flags:          flags,
  };
}

/**
 * Persist a freshly-computed snapshot. Idempotent in the sense that
 * INSERTing multiple rows over time is the intended pattern (history) —
 * the caller is responsible for not racing themselves.
 */
export async function persistConcentrationSnapshot(snap: ConcentrationSnapshot): Promise<{ id: string }> {
  const db = createServerClient();
  const { data, error } = await db
    .from('concentration_snapshots')
    .insert({
      organization_id:     snap.organization_id,
      revenue_breakdown:   snap.revenue_breakdown,
      concentration_index: snap.concentration_index,
      risk_flags:          snap.risk_flags,
    })
    .select('id')
    .single();
  if (error) throw new Error(`persistConcentrationSnapshot: ${error.message}`);
  return { id: data.id as string };
}

/**
 * Load the latest snapshot for one org. Returns null if none exists yet.
 */
export async function loadLatestConcentration(orgId: string): Promise<ConcentrationSnapshot | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('concentration_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`loadLatestConcentration: ${error.message}`);
  if (!data) return null;
  return {
    organization_id:     data.organization_id as string,
    revenue_breakdown:   data.revenue_breakdown as RevenueBreakdown,
    concentration_index: Number(data.concentration_index),
    risk_flags:          (data.risk_flags as ConcentrationRiskFlag[]) ?? [],
  };
}
