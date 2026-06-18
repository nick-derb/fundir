/**
 * Prospect scorer — Workstream B5.
 *
 * For each (tenant org × funder) with peer-funding overlap, compute a
 * 0–1 prospect_score and write it to `funder_intel`. Pure DB compute —
 * no Claude, no embeddings.
 *
 * Formula (per BUILD_PLAN.md §6 B5):
 *
 *   prospect_score = clamp01(
 *       0.45 * peer_overlap_share        // how many peers funder gave to
 *     + 0.20 * recency_score             // weighted to last 3 FY
 *     + 0.15 * region_fit                // funder gives in org's state(s)
 *     + 0.10 * size_fit                  // funder's typical grant size vs ask
 *     + 0.10 * total_disclosure          // confidence boost from $-volume
 *   )
 *
 * peer_overlap_share = min(1, |peers funded by funder| / max(|org peers|, 4))
 *     We cap at /4 so an org with only 3 peers can still hit 1.0 if all 3
 *     are funded.
 * recency_score      = max(edge_recency over funder's edges to peers)
 *     edge_recency = 1.0 if FY in current 3 years; 0.6 if 4-5; 0.3 older.
 * region_fit         = 1.0 if funder has gave_in_region; 0.5 if same state
 *                      via metadata; 0 otherwise.
 * size_fit           = 1.0 if funder's median grant within org's ask band
 *                      [0.5x, 2.0x]; 0.6 if within [0.25x, 4x]; 0 otherwise.
 *                      When org ask is unknown, defaults to 0.6 (neutral).
 * total_disclosure   = clamp01(log10(total_$_to_peers + 10) / 7) — a
 *                      gentle boost rewarding funders with bigger disclosed
 *                      commitments (saturates around $10M).
 *
 * Output: number of funder_intel rows upserted + per-funder score breakdown
 * for the audit log.
 */

import { createServerClient } from '@/lib/supabase';

const CURRENT_YEAR = new Date().getFullYear();

export interface ScoreFunderIntelResult {
  org_id:          string;
  org_code:        string;
  funders_seen:    number;
  rows_upserted:   number;
  warnings:        string[];
}

export async function scoreFunderIntelForOrg(orgCode: string): Promise<ScoreFunderIntelResult> {
  const warnings: string[] = [];
  const db = createServerClient();

  // 1. Resolve org.
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, org_code, financial_data')
    .eq('org_code', orgCode)
    .maybeSingle();
  if (orgErr || !org) {
    return { org_id: '', org_code: orgCode, funders_seen: 0, rows_upserted: 0, warnings: [`org not found: ${orgErr?.message ?? 'no row'}`] };
  }

  // 2. Resolve org's peers + their ids.
  const { data: peers } = await db.from('peer_orgs')
    .select('peer_recipient_id').eq('organization_id', org.id);
  const peerIds = (peers ?? []).map(p => p.peer_recipient_id as string);
  const peerTotal = Math.max(peerIds.length, 4);

  if (peerIds.length === 0) {
    return { org_id: org.id, org_code: orgCode, funders_seen: 0, rows_upserted: 0, warnings: ['org has no peer_orgs; no prospects to score'] };
  }

  // 3. Pull every edge from any funder to any of these peers.
  const { data: edges } = await db.from('grants_made')
    .select('funder_id, recipient_id, amount, fiscal_year, confidence')
    .in('recipient_id', peerIds);

  // 4. Roll up per funder: {peer_set, edge_total, max_fy, max_conf}.
  type Rollup = {
    peer_ids:        Set<string>;
    total_amount:    number;
    most_recent_fy:  number;
    edge_count:      number;
  };
  const byFunder = new Map<string, Rollup>();
  for (const e of (edges ?? [])) {
    const fid = e.funder_id as string;
    const r = byFunder.get(fid) ?? {
      peer_ids: new Set<string>(), total_amount: 0, most_recent_fy: 0, edge_count: 0,
    };
    r.peer_ids.add(e.recipient_id as string);
    r.total_amount   += Number(e.amount ?? 0);
    r.most_recent_fy  = Math.max(r.most_recent_fy, Number(e.fiscal_year ?? 0));
    r.edge_count     += 1;
    byFunder.set(fid, r);
  }

  if (byFunder.size === 0) {
    return { org_id: org.id, org_code: orgCode, funders_seen: 0, rows_upserted: 0, warnings: ['no funders fund any peer; nothing to score'] };
  }

  // 5. Determine the org's typical ask band from financial_data (if known).
  //    Best-effort: 25-75th percentile of grant_revenue / num_grants if both
  //    are present in self-reported financial_data; otherwise neutral.
  const financial = (org.financial_data ?? {}) as { typical_ask_min?: number; typical_ask_max?: number };
  const askMin = typeof financial.typical_ask_min === 'number' ? financial.typical_ask_min : null;
  const askMax = typeof financial.typical_ask_max === 'number' ? financial.typical_ask_max : null;
  const askKnown = askMin != null && askMax != null;

  // 6. Resolve funder metadata for region + size fit checks.
  const funderIds = [...byFunder.keys()];
  const { data: funders } = await db.from('funders')
    .select('id, metadata, funder_type').in('id', funderIds);
  const funderMetaById = new Map<string, { metadata: Record<string, unknown>; type: string }>();
  for (const f of (funders ?? [])) {
    funderMetaById.set(f.id as string, {
      metadata: (f.metadata ?? {}) as Record<string, unknown>,
      type:     (f.funder_type as string) ?? '',
    });
  }

  // 7. Score and UPSERT.
  let rows_upserted = 0;
  for (const [funder_id, r] of byFunder.entries()) {
    const peer_overlap_share = Math.min(1, r.peer_ids.size / peerTotal);
    const recency_score = r.most_recent_fy >= CURRENT_YEAR - 3 ? 1.0
                        : r.most_recent_fy >= CURRENT_YEAR - 5 ? 0.6
                        : r.most_recent_fy > 0                 ? 0.3
                                                              : 0.0;
    const meta = funderMetaById.get(funder_id)?.metadata ?? {};
    const funderStates = Array.isArray(meta.geographic_focus) ? meta.geographic_focus.filter((x): x is string => typeof x === 'string') : [];
    const orgStates    = ['IL'];  // CYC region — TODO read from orgConfig when generalizing
    const region_fit = funderStates.some(s => orgStates.includes(s.toUpperCase()))
                       || (typeof meta.state === 'string' && orgStates.includes(meta.state.toUpperCase()))
      ? 1.0 : 0.5;
    const avgGrantAmount = typeof meta.avg_grant_amount === 'number' ? meta.avg_grant_amount : null;
    let size_fit = 0.6;  // neutral default
    if (askKnown && avgGrantAmount != null) {
      if (avgGrantAmount >= askMin! * 0.5 && avgGrantAmount <= askMax! * 2) size_fit = 1.0;
      else if (avgGrantAmount >= askMin! * 0.25 && avgGrantAmount <= askMax! * 4) size_fit = 0.6;
      else size_fit = 0.2;
    }
    const total_disclosure = Math.min(1, Math.log10(r.total_amount + 10) / 7);

    const composite = Math.min(1,
        0.45 * peer_overlap_share
      + 0.20 * recency_score
      + 0.15 * region_fit
      + 0.10 * size_fit
      + 0.10 * total_disclosure,
    );

    const { error: upErr } = await db.from('funder_intel').upsert({
      organization_id:    org.id,
      funder_id,
      prospect_score:     composite,
      lookalike_score:    null,
      peer_overlap_count: r.peer_ids.size,
      refreshed_at:       new Date().toISOString(),
    }, { onConflict: 'organization_id,funder_id' });

    if (upErr) {
      warnings.push(`funder_intel upsert ${funder_id}: ${upErr.message}`);
      continue;
    }
    rows_upserted += 1;
  }

  return { org_id: org.id, org_code: orgCode, funders_seen: byFunder.size, rows_upserted, warnings };
}
