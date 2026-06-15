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
  // No default: the caller must pass the org's state. This used to default
  // to 'IL' which silently lied about geography for any non-IL tenant.
  orgState: string,
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
  // orgState may be empty when the org isn't pinned to a region yet — handle
  // that path silently by dropping state-specific bullets rather than printing
  // "open to  nonprofits".
  const scope = fields.geographic_scope;
  const hasState = orgState.length > 0;
  const includesOrgState = hasState ? fields.geographic_states?.includes(orgState) : false;
  if (scope === 'national') {
    reasons.push({
      category: 'geography',
      text: hasState ? `National opportunity open to ${orgState} nonprofits` : 'National opportunity',
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

  // ── Funder affinity ────────────────────────────────────────────────────────
  // Phase 3: surface the graph signal. "N of your peer orgs were funded by
  // this funder in the last 3 FY" is the bullet no other tool can produce.
  if (score.funderAffinityEvidence) {
    const ev = score.funderAffinityEvidence;
    if (ev.peer_total_count > 0 && ev.peers_funded_count > 0) {
      const funderLabel = ev.funder_name ? `the ${ev.funder_name}` : 'this funder';
      reasons.push({
        category: 'strategic',
        text: `${ev.peers_funded_count} of your ${ev.peer_total_count} peer orgs were funded by ${funderLabel} in the last 3 years`,
      });
    }
    if (ev.cra_aa_covers_tract && ev.funder_name) {
      reasons.push({
        category: 'eligibility',
        text: `${ev.funder_name}'s CRA assessment area covers your service tract`,
      });
    }
  }

  // ── CRA evidence ───────────────────────────────────────────────────────────
  // Phase 4: surface the LMI tract match and any bank funders with CRA
  // assessment areas covering the org's service area. These are signals
  // the directories don't expose — banks aren't on Grants.gov, and no
  // competitor reverse-screens applicant addresses against CRA
  // obligations.
  if (score.craEvidence) {
    const ev = score.craEvidence;
    if (ev.lmi_match) {
      const community = ev.community ? `${ev.community} site` : 'service area';
      reasons.push({
        category: 'eligibility',
        text: `Your ${community} qualifies as ${ev.lmi_status === 'low' ? 'low-income' : 'low-to-moderate income'} (CRA-eligible tract)`,
      });
    }
    if (ev.bank_funders.length > 0) {
      const sample = ev.bank_funders.slice(0, 2).join(' and ');
      const extra  = ev.bank_funders.length > 2 ? ` plus ${ev.bank_funders.length - 2} more` : '';
      reasons.push({
        category: 'strategic',
        text: `${ev.bank_funders.length} bank${ev.bank_funders.length > 1 ? 's' : ''} legally serve your tract under CRA — ${sample}${extra}`,
      });
    }
  }

  return reasons.slice(0, 6);
}
