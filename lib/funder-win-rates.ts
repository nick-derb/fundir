/**
 * Lever #2 — real funder win-rates from CYC's actual submission history
 * (cyc_grant_submissions, loaded from the Instrumentl export).
 *
 * The historical component of computeMatchScore defaulted to 0.35 for every
 * foundation (they all share agency_code 'FOUNDATION'). This replaces that
 * assumption with CYC's REAL overall foundation win-rate, Bayesian-smoothed by
 * the same Beta(1,2) prior used for federal outcomes so a handful of decisions
 * don't produce a wild 0%/100% rate.
 *
 * Per-funder rates are also computed, but only for visibility/advisor grounding:
 * with ~1-2 decisions per funder and no reliable EIN join between the Instrumentl
 * names and the foundation corpus, per-funder rates are too sparse and too
 * fuzzy-to-match to drive the composite. The overall 'FOUNDATION' rate is the
 * robust signal that goes into scoring.
 */

import { createServerClient } from '@/lib/supabase';
import { bayesianWinRate } from '@/lib/win-rate-bayes';

export interface FunderRecord {
  funder: string;
  wins: number;
  losses: number;
  rate: number; // Bayesian-smoothed
}

export interface FunderWinRateSummary {
  total: number;                 // labeled (terminal) submissions
  overall: { wins: number; losses: number; rawRate: number };
  foundationRate: number;        // Bayesian overall rate → the 'FOUNDATION' historical key
  byFunder: FunderRecord[];      // sorted by volume, then rate
}

const NEUTRAL = 0.35;

export async function fetchFunderWinRateSummary(orgId: string): Promise<FunderWinRateSummary> {
  const empty: FunderWinRateSummary = {
    total: 0, overall: { wins: 0, losses: 0, rawRate: NEUTRAL }, foundationRate: NEUTRAL, byFunder: [],
  };
  if (!orgId) return empty;

  const db = createServerClient();
  const { data, error } = await db
    .from('cyc_grant_submissions')
    .select('funder_name, outcome')
    .eq('org_id', orgId)
    .not('outcome', 'is', null);

  // Table may not exist yet (migration not applied) — fall back to neutral.
  if (error || !data || data.length === 0) return empty;

  let wins = 0, losses = 0;
  const byName = new Map<string, { wins: number; losses: number }>();
  for (const r of data as Array<{ funder_name: string | null; outcome: string }>) {
    const isWin = r.outcome === 'awarded';
    if (isWin) wins++; else losses++;
    const key = r.funder_name || '(unknown funder)';
    const b = byName.get(key) ?? { wins: 0, losses: 0 };
    if (isWin) b.wins++; else b.losses++;
    byName.set(key, b);
  }

  const byFunder = [...byName.entries()]
    .map(([funder, c]) => ({ funder, wins: c.wins, losses: c.losses, rate: bayesianWinRate(c.wins, c.losses) }))
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses) || b.rate - a.rate);

  const total = wins + losses;
  return {
    total,
    overall: { wins, losses, rawRate: total ? wins / total : NEUTRAL },
    foundationRate: bayesianWinRate(wins, losses),
    byFunder,
  };
}

/**
 * Rates to merge into OrgMatchProfile.historicalWinRates. Keyed by the
 * 'FOUNDATION' agency_code every foundation grant carries, so foundation
 * matches inherit CYC's real overall foundation win-rate instead of 0.35.
 * Returns {} when there's no labeled history (keeps the neutral default).
 */
export function buildFoundationHistoricalRates(summary: FunderWinRateSummary): Record<string, number> {
  return summary.total > 0 ? { FOUNDATION: summary.foundationRate } : {};
}
