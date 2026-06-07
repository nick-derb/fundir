/**
 * Bayesian-smoothed historical win rates from real org submission
 * outcomes — Tier 1C of the grant-search redesign.
 *
 * Before this, computeMatchScore's historical component was pulled from
 * orgProfile.historicalWinRates, a hand-coded dictionary. Real grants
 * the org actually submitted and won/lost never updated the model. With
 * the org_outcomes table + this lib, every awarded/rejected submission
 * sharpens the matching: the historical score reflects the org's actual
 * track record, smoothed by a weak Beta(α=1, β=2) prior so a single
 * loss doesn't tank an agency's rate.
 */

import { createServerClient } from '@/lib/supabase';

/**
 * Posterior mean of Beta(α + wins, β + losses).
 *
 * Default prior: Beta(1, 2) — mean 1/3, weakly informative. After ~5
 * data points the prior is mostly washed out; before that it keeps
 * sparse-data rates from being insanely volatile (one win out of one
 * submission should not return 100%).
 */
export function bayesianWinRate(
  wins:   number,
  losses: number,
  alpha:  number = 1,
  beta:   number = 2,
): number {
  return (alpha + wins) / (alpha + beta + wins + losses);
}

interface BucketCounts { wins: number; losses: number; }

export interface OrgOutcomeCounts {
  byAgency: Record<string, BucketCounts>;
  byAln:    Record<string, BucketCounts>;
  total:    BucketCounts;
}

/**
 * Pull the org's recorded grant outcomes and tally wins/losses per
 * agency and per ALN code.
 */
export async function fetchOrgOutcomeCounts(orgId: string): Promise<OrgOutcomeCounts> {
  const counts: OrgOutcomeCounts = {
    byAgency: {},
    byAln:    {},
    total:    { wins: 0, losses: 0 },
  };

  if (!orgId) return counts;

  const db = createServerClient();
  const { data, error } = await db
    .from('org_outcomes')
    .select('agency_code, aln_codes, outcome')
    .eq('org_id', orgId);

  if (error || !data) {
    // org_outcomes may not exist yet (migration not applied). Return zeros
    // so discovery falls back to orgProfile.historicalWinRates instead of
    // throwing.
    return counts;
  }

  for (const row of data as Array<{
    agency_code: string | null;
    aln_codes:   string[] | null;
    outcome:     string;
  }>) {
    const isWin = row.outcome === 'awarded';
    counts.total.wins   += isWin ? 1 : 0;
    counts.total.losses += isWin ? 0 : 1;

    if (row.agency_code) {
      const key = row.agency_code.toUpperCase();
      counts.byAgency[key] ??= { wins: 0, losses: 0 };
      counts.byAgency[key].wins   += isWin ? 1 : 0;
      counts.byAgency[key].losses += isWin ? 0 : 1;
    }
    for (const aln of row.aln_codes ?? []) {
      counts.byAln[aln] ??= { wins: 0, losses: 0 };
      counts.byAln[aln].wins   += isWin ? 1 : 0;
      counts.byAln[aln].losses += isWin ? 0 : 1;
    }
  }

  return counts;
}

/**
 * Build a {key -> rate} dictionary suitable for merging into
 * OrgMatchProfile.historicalWinRates. computeMatchScore looks up by
 * agency_code, then by alnCodes[0], so we cover both axes.
 */
export function buildHistoricalWinRates(counts: OrgOutcomeCounts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, c] of Object.entries(counts.byAgency)) {
    out[key] = bayesianWinRate(c.wins, c.losses);
  }
  for (const [key, c] of Object.entries(counts.byAln)) {
    out[key] = bayesianWinRate(c.wins, c.losses);
  }
  return out;
}
