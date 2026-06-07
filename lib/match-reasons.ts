/**
 * "Why it's a match" — deterministic bullets derived from the score breakdown
 * and the extracted grant fields. Pure function, works on any grant immediately
 * (no migration, no extra AI calls). Mirrors Instrumentl's checkmark-bullet
 * "Why it's a match" block, but grounded in Fundir's own 7-factor score and
 * the org's actual profile.
 */

import { ExtractedFields, ScoreBreakdown } from '@/types';

export type ReasonCategory =
  | 'mission' | 'eligibility' | 'geography'
  | 'population' | 'financial' | 'strategic' | 'compliance';

export interface MatchReason {
  text:     string;
  category: ReasonCategory;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function buildMatchReasons(
  score:    ScoreBreakdown,
  fields:   ExtractedFields,
  grant:    { agency_name?: string | null; aln_codes?: string[] | null },
  orgState: string = 'IL',
): MatchReason[] {
  const reasons: MatchReason[] = [];

  // ── Matched program (lead, when present) ────────────────────────────────────
  // The per-program embedding scoring tells us which specific program within
  // the org this grant best fits. That's the most concrete, decision-useful
  // signal we have, so it leads the bullet list.
  if (score.matchedProgram && score.matchedProgram !== 'General Operating') {
    reasons.push({
      category: 'mission',
      text: `Best fit for your ${score.matchedProgram} program`,
    });
  } else if (score.matchedProgram === 'General Operating') {
    reasons.push({
      category: 'mission',
      text: `Best fit as mission-level / general operating support`,
    });
  }

  // ── Mission / semantic alignment ────────────────────────────────────────────
  if (score.semantic >= 65) {
    const areas = fields.program_areas?.slice(0, 2);
    if (areas?.length) {
      reasons.push({
        category: 'mission',
        text: `Strong mission alignment with ${areas.join(' and ')}`,
      });
    } else {
      reasons.push({
        category: 'mission',
        text: `Strong semantic alignment with your organization's mission`,
      });
    }
  } else if (score.semantic >= 50 && fields.program_areas?.length) {
    reasons.push({
      category: 'mission',
      text: `Program-area overlap on ${fields.program_areas.slice(0, 2).join(', ')}`,
    });
  }

  // ── Entity eligibility ─────────────────────────────────────────────────────
  if (fields.eligible_entity_types?.some(t => /nonprofit|501|charity|non-profit/i.test(t))) {
    reasons.push({
      category: 'eligibility',
      text: `501(c)(3) nonprofits are explicitly eligible`,
    });
  }

  // ── Geographic fit ─────────────────────────────────────────────────────────
  const scope = fields.geographic_scope;
  const includesOrgState = fields.geographic_states?.includes(orgState);
  if (scope === 'national') {
    reasons.push({
      category: 'geography',
      text: `National opportunity open to ${orgState} nonprofits`,
    });
  } else if (scope === 'state' && includesOrgState) {
    reasons.push({
      category: 'geography',
      text: `${orgState}-specific opportunity`,
    });
  } else if (scope === 'city' && includesOrgState) {
    reasons.push({
      category: 'geography',
      text: `Local/regional grant in your service area`,
    });
  }

  // ── Target population ──────────────────────────────────────────────────────
  if (fields.target_population?.length) {
    const pops = fields.target_population.slice(0, 2).join(', ');
    reasons.push({
      category: 'population',
      text: `Targets ${pops}`,
    });
  }

  // ── Financial profile fit (from reverse-990 screen) ────────────────────────
  if (score.financial_990 >= 70) {
    reasons.push({
      category: 'financial',
      text: `Strong financial profile fit — budget, reserves, and NTEE align`,
    });
  } else if (score.financial_990 >= 50) {
    reasons.push({
      category: 'financial',
      text: `Financial profile adequate — review the Reverse-990 Verdict for specifics`,
    });
  }

  // ── Award size fit ─────────────────────────────────────────────────────────
  if (fields.award_floor && fields.award_ceiling) {
    reasons.push({
      category: 'strategic',
      text: `Award size ${money(fields.award_floor)}–${money(fields.award_ceiling)} fits typical grant range`,
    });
  } else if (fields.award_ceiling) {
    reasons.push({
      category: 'strategic',
      text: `Award up to ${money(fields.award_ceiling)}`,
    });
  }

  // ── Compliance readiness ───────────────────────────────────────────────────
  if (fields.compliance_frameworks?.some(f => /GATA/i.test(f))) {
    reasons.push({
      category: 'compliance',
      text: `GATA-compliant application — org already registered`,
    });
  }

  // ── Federal program track record ───────────────────────────────────────────
  if (score.historical >= 60 && grant.aln_codes?.length) {
    reasons.push({
      category: 'strategic',
      text: `Strong historical win rate on ${grant.aln_codes[0]} (${Math.round(score.historical)}%)`,
    });
  }

  return reasons.slice(0, 6);
}
