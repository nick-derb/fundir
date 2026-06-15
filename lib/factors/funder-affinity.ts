/**
 * Funder-affinity factor — Phase 3D.
 *
 * Formula (from PHASE_0_PLAN.md SS 3):
 *
 *   affinity = min(1,
 *       0.50 * (peers_funded_by_funder  / peer_count)
 *     + 0.30 * (funder.focus ∩ segment.funder_categories) / max(|funder.focus|, 1)
 *     + 0.20 * (funder gave to ANY recipient in org's region in the last 3 FY ? 1 : 0)
 *     + 0.15 * (funder is a bank AND org's tract ∈ funder's CRA AA ? 1 : 0)
 *   )
 *
 * When the grant has no resolvable funder (federal NOFOs, region
 * adapters), the factor returns a neutral 0.35 — the same fallback the
 * historical factor uses for unknown agencies. That keeps non-funder-
 * anchored opportunities competitive without pretending we have signal.
 *
 * The snapshot is loaded once per discovery / rescore pass and shared
 * across every grant — cheap to compute against.
 */

import { createServerClient } from '@/lib/supabase';

const NEUTRAL_FALLBACK = 0.35;
const LOOKBACK_YEARS = 3;

export interface FunderAffinitySnapshot {
  org_id:             string;
  /** Recipient ids that constitute the org's peer set. */
  peer_recipient_ids: Set<string>;
  /** Funder ids that gave to ANY recipient in the org's region within the lookback window. */
  funders_in_region:  Set<string>;
  /** Funder ids whose CRA AA covers the org's primary tract. */
  banks_covering_tract: Set<string>;
  /** segment.funder_categories — for focus-overlap scoring. */
  segment_funder_categories: Set<string>;
}

export async function loadFunderAffinitySnapshot(
  orgId: string,
  regionStates: string[],
  censusTract: string | null,
  segmentFunderCategories: string[],
): Promise<FunderAffinitySnapshot> {
  const db = createServerClient();

  // ── Peer set ────────────────────────────────────────────────────────────
  const { data: peers } = await db
    .from('peer_orgs')
    .select('peer_recipient_id')
    .eq('organization_id', orgId);
  const peer_recipient_ids = new Set<string>(
    (peers ?? []).map(p => p.peer_recipient_id as string),
  );

  // ── Funders that gave to ANY recipient in region in last N FY ───────────
  // PostgREST doesn't expose a clean "find recipients whose metadata.state
  // is in [...]" without a custom RPC, so we read recipients filtered by
  // metadata->>state IN (region states), then funders via grants_made.
  const funders_in_region = new Set<string>();
  if (regionStates.length > 0) {
    const minYear = new Date().getFullYear() - LOOKBACK_YEARS;
    const { data: regionalRecipients } = await db
      .from('recipients')
      .select('id, metadata')
      .in('metadata->>state', regionStates);
    const regionalRecipientIds = (regionalRecipients ?? [])
      .map(r => r.id as string);
    if (regionalRecipientIds.length > 0) {
      const { data: regionalGrants } = await db
        .from('grants_made')
        .select('funder_id')
        .in('recipient_id', regionalRecipientIds)
        .gte('fiscal_year', minYear);
      for (const g of (regionalGrants ?? [])) {
        funders_in_region.add(g.funder_id as string);
      }
    }
  }

  // ── Bank funders whose AA covers this org's tract ───────────────────────
  const banks_covering_tract = new Set<string>();
  if (censusTract) {
    const { data: aaRows } = await db
      .from('bank_assessment_areas')
      .select('funder_id')
      .eq('tract_id', censusTract);
    for (const a of (aaRows ?? [])) {
      banks_covering_tract.add(a.funder_id as string);
    }
  }

  return {
    org_id: orgId,
    peer_recipient_ids,
    funders_in_region,
    banks_covering_tract,
    segment_funder_categories: new Set(segmentFunderCategories.map(c => c.toLowerCase())),
  };
}

export interface FunderAffinityEvidence {
  peers_funded_count:    number;
  peer_total_count:      number;
  focus_overlap_count:   number;
  gave_in_region:        boolean;
  cra_aa_covers_tract:   boolean;
  funder_name?:          string | null;
}

export interface FunderAffinityResult {
  /** 0..1 score. */
  score:    number;
  /** Per-factor evidence; carried onto ScoreBreakdown.funderAffinityEvidence. */
  evidence: FunderAffinityEvidence;
}

export async function computeFunderAffinity(
  funderId: string | null,
  snapshot: FunderAffinitySnapshot,
): Promise<FunderAffinityResult> {
  if (!funderId) {
    return {
      score: NEUTRAL_FALLBACK,
      evidence: {
        peers_funded_count: 0,
        peer_total_count:   snapshot.peer_recipient_ids.size,
        focus_overlap_count: 0,
        gave_in_region:     false,
        cra_aa_covers_tract: false,
        funder_name:        null,
      },
    };
  }

  const db = createServerClient();

  // Look up the funder's focus areas + name (for evidence) + funder_type
  // (for the bank CRA boost gate).
  const { data: funder } = await db
    .from('funders')
    .select('id, name, funder_type, metadata')
    .eq('id', funderId)
    .maybeSingle();

  // Peer-funded share.
  let peers_funded_count = 0;
  if (snapshot.peer_recipient_ids.size > 0) {
    const { data: hits } = await db
      .from('grants_made')
      .select('recipient_id')
      .eq('funder_id', funderId)
      .in('recipient_id', [...snapshot.peer_recipient_ids]);
    const fundedSet = new Set<string>(
      (hits ?? []).map(h => h.recipient_id as string),
    );
    peers_funded_count = fundedSet.size;
  }
  const peer_total_count = snapshot.peer_recipient_ids.size;
  const peer_funded_share = peer_total_count > 0
    ? peers_funded_count / peer_total_count
    : 0;

  // Focus overlap.
  const funderFocus = ((funder?.metadata as { focus_areas?: unknown })?.focus_areas);
  const funderFocusList = Array.isArray(funderFocus)
    ? funderFocus.filter((x): x is string => typeof x === 'string').map(s => s.toLowerCase())
    : [];
  let focus_overlap_count = 0;
  for (const f of funderFocusList) {
    if (snapshot.segment_funder_categories.has(f)) focus_overlap_count += 1;
    else {
      // Loose substring match for "youth development" vs "youth_development".
      for (const seg of snapshot.segment_funder_categories) {
        if (f.includes(seg) || seg.includes(f)) {
          focus_overlap_count += 1;
          break;
        }
      }
    }
  }
  const focus_overlap_share = funderFocusList.length > 0
    ? Math.min(1, focus_overlap_count / funderFocusList.length)
    : 0;

  // Region presence.
  const gave_in_region = snapshot.funders_in_region.has(funderId);

  // Bank CRA AA covers tract.
  const isBank = funder?.funder_type === 'bank';
  const cra_aa_covers_tract = isBank && snapshot.banks_covering_tract.has(funderId);

  const score = Math.min(1,
      0.50 * peer_funded_share
    + 0.30 * focus_overlap_share
    + 0.20 * (gave_in_region ? 1 : 0)
    + 0.15 * (cra_aa_covers_tract ? 1 : 0),
  );

  return {
    score,
    evidence: {
      peers_funded_count,
      peer_total_count,
      focus_overlap_count,
      gave_in_region,
      cra_aa_covers_tract,
      funder_name: funder?.name ?? null,
    },
  };
}
