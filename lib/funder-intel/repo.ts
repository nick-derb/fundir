/**
 * funder_intel repo — Workstream B8.
 *
 * Read helper that joins funder_intel + funders + per-funder peer-edge
 * rollup into the shape the panel renders. Single round-trip; cached
 * one layer up by the dashboard data loader.
 */

import { createServerClient } from '@/lib/supabase';

export interface FunderIntelRow {
  funder_id:          string;
  funder_name:        string;
  funder_ein:         string | null;
  funder_type:        string;
  prospect_score:     number;
  peer_overlap_count: number;
  has_brief:          boolean;
  brief:              unknown | null;       // BriefShape (component-side type)
  brief_generated_at: string | null;
  tracked_status:    'new' | 'pursuing' | 'passed' | 'contacted' | 'meeting' | null;
  /** Top 3 peer names this funder gave to (for the row preview). */
  top_peers:          string[];
  /** Total $ disclosed across all peer edges. */
  total_peer_amount:  number;
  /** Most recent fiscal year across all peer edges. */
  most_recent_fy:     number | null;
}

export async function loadFunderIntelligence(orgId: string, limit = 30): Promise<FunderIntelRow[]> {
  const db = createServerClient();

  // 1. Top N funder_intel rows by prospect_score.
  const { data: intel } = await db.from('funder_intel')
    .select('funder_id, prospect_score, peer_overlap_count, brief, brief_generated_at, tracked_status')
    .eq('organization_id', orgId)
    .order('prospect_score', { ascending: false })
    .limit(limit);
  if (!intel || intel.length === 0) return [];

  const funderIds = intel.map(r => r.funder_id as string);

  // 2. Funder metadata.
  const { data: funders } = await db.from('funders')
    .select('id, name, ein, funder_type').in('id', funderIds);
  const funderById = new Map((funders ?? []).map(f => [f.id as string, f]));

  // 3. Peer edges from these funders to the org's peers (for the preview).
  const { data: peers } = await db.from('peer_orgs')
    .select('peer_recipient_id').eq('organization_id', orgId);
  const peerIds = (peers ?? []).map(p => p.peer_recipient_id as string);

  const peerNameById = new Map<string, string>();
  if (peerIds.length > 0) {
    const { data: recs } = await db.from('recipients')
      .select('id, name').in('id', peerIds);
    for (const r of (recs ?? [])) peerNameById.set(r.id as string, r.name as string);
  }

  const { data: edges } = peerIds.length === 0 ? { data: [] as Array<{ funder_id: string; recipient_id: string; amount: number | string; fiscal_year: number }> } : await db.from('grants_made')
    .select('funder_id, recipient_id, amount, fiscal_year')
    .in('funder_id', funderIds)
    .in('recipient_id', peerIds);

  // 4. Roll up per funder.
  type Rollup = { peers: Map<string, number>; total: number; mostRecentFy: number };
  const rollupByFunder = new Map<string, Rollup>();
  for (const e of (edges ?? [])) {
    const fid = e.funder_id as string;
    const r = rollupByFunder.get(fid) ?? { peers: new Map(), total: 0, mostRecentFy: 0 };
    const pname = peerNameById.get(e.recipient_id as string) ?? '(unknown)';
    r.peers.set(pname, (r.peers.get(pname) ?? 0) + Number(e.amount));
    r.total += Number(e.amount);
    r.mostRecentFy = Math.max(r.mostRecentFy, Number(e.fiscal_year));
    rollupByFunder.set(fid, r);
  }

  // 5. Assemble.
  return intel.map(i => {
    const f = funderById.get(i.funder_id as string);
    const r = rollupByFunder.get(i.funder_id as string);
    const topPeers = r
      ? [...r.peers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n)
      : [];
    return {
      funder_id:          i.funder_id as string,
      funder_name:        (f?.name as string) ?? '(unknown funder)',
      funder_ein:         (f?.ein as string | null) ?? null,
      funder_type:        (f?.funder_type as string) ?? '',
      prospect_score:     Number(i.prospect_score),
      peer_overlap_count: Number(i.peer_overlap_count),
      has_brief:          !!i.brief,
      brief:              (i.brief as unknown) ?? null,
      brief_generated_at: (i.brief_generated_at as string | null) ?? null,
      tracked_status:    (i.tracked_status as FunderIntelRow['tracked_status']) ?? null,
      top_peers:          topPeers,
      total_peer_amount:  r?.total ?? 0,
      most_recent_fy:     r?.mostRecentFy && r.mostRecentFy > 0 ? r.mostRecentFy : null,
    };
  });
}

// Brief read for the per-row expander. Lazy-loaded on click.
export async function loadFunderBrief(orgId: string, funderId: string): Promise<unknown | null> {
  const db = createServerClient();
  const { data } = await db.from('funder_intel')
    .select('brief').eq('organization_id', orgId).eq('funder_id', funderId).maybeSingle();
  return data?.brief ?? null;
}
