// Phase 7 — Network Insights: multi-hop patterns the lead list cannot show.
//
// A lead is one target. An insight is a pattern across several — funders that
// co-fund the same peers, a funder that keeps coming back to one peer, a new
// entrant, a lapsed CYC funder, a CYC person whose board service touches
// several funders' trustees. All deterministic, all evidence-bound, all
// regenerated wholesale under generator 'insights:v1'.

import { createServerClient } from '@/lib/supabase';
import { OWN_KINDS } from '@/lib/network/edges';
import { NO_CYC_FUNDING } from '@/lib/network/scoring';

type Db = ReturnType<typeof createServerClient>;
export const GENERATOR = 'insights:v1';
const CYC_EIN = '362344429';

interface Grant { id: string; funder_org_id: string; recipient_org_id: string; fiscal_year: number | null; amount: number | null; source_id: string | null }

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const chunks = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** "A", "A and B", "A, B and C". */
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** listJoin with truncation: "A, B, C and 24 more". */
const nameList = (xs: string[], max: number) => (xs.length <= max ? listJoin(xs) : `${xs.slice(0, max - 1).join(', ')} and ${xs.length - (max - 1)} more`);
/** End a sentence without doubling a period after "N.A." or "Inc.". */
const sentence = (s: string) => (s.endsWith('.') ? s : `${s}.`);

export interface InsightRow {
  insight_type: string; title: string; summary: string;
  path: Array<{ kind: 'org' | 'person' | 'edge'; id: string | null; label: string }>;
  score: number; confidence: 'Low' | 'Medium' | 'High';
  evidence: Record<string, unknown>; lead_id: string | null;
}

export interface InsightsReport { counts: Record<string, number>; written: number; sample: string[] }

export async function generateInsights(db: Db, orgId: string): Promise<InsightsReport> {
  const asOf = new Date().getFullYear();
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', CYC_EIN).maybeSingle();
  const cycId = (cyc?.id as string | undefined) ?? null;

  const peers = await pageAll<{ organization_id: string; similarity: number }>((a, b) => db.from('network_peer_orgs').select('organization_id, similarity').eq('org_id', orgId).order('id').range(a, b));
  const peerSim = new Map(peers.map(p => [p.organization_id, Number(p.similarity)]));

  const grants: Grant[] = [];
  for (const c of chunks([...peerSim.keys(), ...(cycId ? [cycId] : [])], 100)) {
    grants.push(...await pageAll<Grant>((a, b) => db.from('grants_made').select('id, funder_org_id, recipient_org_id, fiscal_year, amount, source_id').in('recipient_org_id', c).not('funder_org_id', 'is', null).order('id').range(a, b)));
  }
  const names = new Map<string, string>();
  const nameIds = [...new Set([...grants.map(g => g.funder_org_id), ...grants.map(g => g.recipient_org_id)])];
  for (const c of chunks(nameIds, 200)) { const { data } = await db.from('network_organizations').select('id, name').in('id', c); for (const o of data ?? []) names.set(o.id as string, o.name as string); }
  const nm = (id: string) => names.get(id) ?? 'an organization';

  // Leads by target, so insights can link to the lead a reader will act on.
  const { data: leadRows } = await db.from('network_leads').select('id, target_org_id, opportunity_score').eq('org_id', orgId).not('target_org_id', 'is', null).order('opportunity_score', { ascending: false, nullsFirst: false });
  const leadFor = new Map<string, string>();
  for (const l of leadRows ?? []) if (!leadFor.has(l.target_org_id as string)) leadFor.set(l.target_org_id as string, l.id as string);

  const fundersToCyc = new Set(cycId ? grants.filter(g => g.recipient_org_id === cycId).map(g => g.funder_org_id) : []);
  const { data: rel } = cycId ? await db.from('network_relationships').select('target_organization_id').eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_organization_id', cycId) : { data: [] };
  const knownToCyc = new Set([...fundersToCyc, ...(rel ?? []).map(r => r.target_organization_id as string)]);
  const hedge = (funderId: string) => (knownToCyc.has(funderId) ? '' : ` ${NO_CYC_FUNDING}`);

  const peerGrants = grants.filter(g => peerSim.has(g.recipient_org_id));
  const byFunder = new Map<string, Grant[]>();
  for (const g of peerGrants) { const a = byFunder.get(g.funder_org_id) ?? []; a.push(g); byFunder.set(g.funder_org_id, a); }
  const recipientsOf = new Map([...byFunder].map(([f, gs]) => [f, new Set(gs.map(g => g.recipient_org_id))]));
  const rows: InsightRow[] = [];

  // ── Funder Cluster: "who else funds what this funder funds?" ──
  // One insight per anchor funder (those CYC has a lead on, strongest first):
  // its top co-funders ranked by how many of the same CYC peers they support.
  // Anchored clusters read as a recommendation ("if X fits, so do these");
  // graph components would merge everything into one uninformative blob.
  const funders = [...byFunder.keys()].filter(f => (recipientsOf.get(f)?.size ?? 0) >= 3);
  const anchors = funders.filter(f => leadFor.has(f)).sort((a, b) => recipientsOf.get(b)!.size - recipientsOf.get(a)!.size).slice(0, 8);
  const seenCluster = new Set<string>();
  for (const f of anchors) {
    const mine = recipientsOf.get(f)!;
    const co = funders.filter(o => o !== f)
      .map(o => ({ id: o, shared: [...mine].filter(r => recipientsOf.get(o)!.has(r)) }))
      .filter(x => x.shared.length >= 3)
      .sort((a, b) => b.shared.length - a.shared.length).slice(0, 5);
    if (co.length < 2) continue;
    const members = [f, ...co.map(x => x.id)];
    const key = [...members].sort().join('|'); if (seenCluster.has(key)) continue; seenCluster.add(key);
    const sharedPeers = [...new Set(co.flatMap(x => x.shared))].sort((a, b) => co.filter(x => x.shared.includes(b)).length - co.filter(x => x.shared.includes(a)).length);
    const ids = members.flatMap(m => byFunder.get(m)!.filter(g => sharedPeers.includes(g.recipient_org_id)).map(g => g.id));
    const untapped = members.filter(m => !knownToCyc.has(m));
    rows.push({
      insight_type: 'Funder Cluster',
      title: `Co-funders of ${nm(f)}'s peer grantees: ${listJoin(co.map(x => nm(x.id)))}`,
      summary: `${listJoin(co.map(x => `${nm(x.id)} (${x.shared.length})`))} each fund at least three of the same organizations in CYC's peer set that ${nm(f)} funds — among them ${nameList(sharedPeers.map(nm), 4)} — per IRS filings. Funders that co-fund the same peers tend to share program priorities.${untapped.length ? ` ${sentence(`${NO_CYC_FUNDING.replace(/\.$/, '')} for ${untapped.length === members.length ? 'any of them' : listJoin(untapped.map(nm))}`)}` : ''}`,
      path: [...members.map(m => ({ kind: 'org' as const, id: m, label: nm(m) })), ...sharedPeers.slice(0, 4).map(r => ({ kind: 'org' as const, id: r, label: nm(r) }))],
      score: Math.min(100, 30 + 6 * co.length + 4 * Math.min(sharedPeers.length, 8)), confidence: 'High',
      evidence: { generator: GENERATOR, grant_ids: ids.slice(0, 80), anchor: f, co_funders: co.map(x => ({ id: x.id, shared_peers: x.shared })), members }, lead_id: leadFor.get(f) ?? null,
    });
  }

  // ── Repeated Peer Funder: same peer funded in ≥2 fiscal years ──
  for (const [f, gs] of byFunder) {
    const byRecip = new Map<string, Grant[]>();
    for (const g of gs) { const a = byRecip.get(g.recipient_org_id) ?? []; a.push(g); byRecip.set(g.recipient_org_id, a); }
    const repeats = [...byRecip].filter(([, x]) => new Set(x.map(g => g.fiscal_year).filter(Boolean)).size >= 2).sort((a, b) => b[1].length - a[1].length);
    if (!repeats.length) continue;
    const [r, x] = repeats[0];
    const years = [...new Set(x.map(g => g.fiscal_year).filter(Boolean))].sort();
    const total = x.reduce((n, g) => n + (Number(g.amount) || 0), 0);
    rows.push({
      insight_type: 'Repeated Peer Funder',
      title: `${nm(f)} funds ${nm(r)} year after year`,
      summary: `${nm(f)} made ${x.length} grants to ${nm(r)} across ${years.join(', ')}${total ? ` (${money(total)} in total)` : ''}${repeats.length > 1 ? `, and repeats with ${repeats.length - 1} other CYC peer${repeats.length > 2 ? 's' : ''}` : ''}, per IRS filings. Multi-year support of a comparable organization signals a program priority rather than a one-off gift.${hedge(f)}`,
      path: [{ kind: 'org', id: f, label: nm(f) }, { kind: 'org', id: r, label: nm(r) }, { kind: 'org', id: cycId, label: 'CYC' }],
      score: Math.min(100, 35 + 10 * Math.min(x.length, 4) + 5 * Math.min(repeats.length - 1, 4)), confidence: 'High',
      evidence: { generator: GENERATOR, grant_ids: repeats.flatMap(([, g]) => g.map(z => z.id)).slice(0, 60), recipient_id: r, years }, lead_id: leadFor.get(f) ?? null,
    });
  }

  // ── Emerging Funder: first peer grant in the latest filing year on record ──
  const latestYear = Math.max(...peerGrants.map(g => g.fiscal_year ?? 0));
  for (const [f, gs] of byFunder) {
    const years = gs.map(g => g.fiscal_year).filter((y): y is number => typeof y === 'number');
    if (!years.length || Math.min(...years) !== latestYear || gs.length < 2 || knownToCyc.has(f)) continue;
    const recips = [...new Set(gs.map(g => g.recipient_org_id))];
    rows.push({
      insight_type: 'Emerging Funder',
      title: `${nm(f)}: new to CYC's peer set in ${latestYear}`,
      summary: `${nm(f)}'s first grants to organizations in CYC's peer set appear in the ${latestYear} filing year: ${gs.length} grants to ${nameList(recips.map(nm), 4)}, per IRS filings. New entrants are often still forming their portfolio.${hedge(f)}`,
      path: [{ kind: 'org', id: f, label: nm(f) }, ...recips.slice(0, 3).map(r => ({ kind: 'org' as const, id: r, label: nm(r) }))],
      score: Math.min(100, 35 + 6 * Math.min(recips.length, 5)), confidence: 'Medium',
      evidence: { generator: GENERATOR, grant_ids: gs.map(g => g.id).slice(0, 60), first_year: latestYear }, lead_id: leadFor.get(f) ?? null,
    });
  }

  // ── Dormant Relationship: funded CYC, nothing after asOf−3 in available data ──
  if (cycId) {
    const toCyc = new Map<string, Grant[]>();
    for (const g of grants.filter(g => g.recipient_org_id === cycId)) { const a = toCyc.get(g.funder_org_id) ?? []; a.push(g); toCyc.set(g.funder_org_id, a); }
    for (const [f, gs] of toCyc) {
      const years = gs.map(g => g.fiscal_year).filter((y): y is number => typeof y === 'number');
      if (!years.length) continue;
      const last = Math.max(...years);
      if (asOf - last < 3) continue;
      const stillPeers = byFunder.get(f)?.filter(g => (g.fiscal_year ?? 0) > last) ?? [];
      rows.push({
        insight_type: 'Dormant Relationship',
        title: `${nm(f)}: last CYC grant on record ${last}`,
        summary: `${nm(f)} funded CYC ${gs.length === 1 ? 'once' : `${gs.length} times`}, most recently in ${last}; no later CYC grant appears in available data${stillPeers.length ? `, while it made ${stillPeers.length} grant${stillPeers.length === 1 ? '' : 's'} to CYC peers after ${last}` : ''}. A lapsed funder that still gives to comparable organizations is usually the easiest re-engagement.`,
        path: [{ kind: 'org', id: f, label: nm(f) }, { kind: 'org', id: cycId, label: 'CYC' }],
        score: Math.min(100, 40 + 10 * Math.min(stillPeers.length, 4)), confidence: gs.some(g => g.source_id) ? 'High' : 'Medium',
        evidence: { generator: GENERATOR, grant_ids: [...gs, ...stillPeers].map(g => g.id).slice(0, 60), last_year: last }, lead_id: leadFor.get(f) ?? null,
      });
    }
  }

  // ── Shared Board hubs: a CYC person whose board service touches trustees of ≥2 funders ──
  const { data: own } = await db.from('network_people').select('id, name, kind, board_role').eq('org_id', orgId);
  const ownIds = new Set((own ?? []).filter(p => OWN_KINDS.has(p.kind as string)).map(p => p.id as string));
  const ownName = new Map((own ?? []).map(p => [p.id as string, { name: p.name as string, role: p.board_role as string | null }]));
  const edges: Array<{ id: string; source_person_id: string; target_person_id: string; evidence: { summary?: string } | null }> = [];
  for (const c of chunks([...ownIds], 60)) {
    for (const col of ['source_person_id', 'target_person_id'] as const) {
      edges.push(...await pageAll<typeof edges[number]>((a, b) => db.from('network_relationships').select('id, source_person_id, target_person_id, evidence').eq('org_id', orgId).eq('relationship_type', 'shared_board').in(col, c).order('id').range(a, b)));
    }
  }
  const trusteeIds = [...new Set(edges.flatMap(e => [e.source_person_id, e.target_person_id]).filter(p => !ownIds.has(p)))];
  const seatsOf = new Map<string, Set<string>>();
  for (const c of chunks(trusteeIds, 100)) {
    const seats = await pageAll<{ person_id: string; organization_id: string }>((a, b) => db.from('network_boards').select('person_id, organization_id').in('person_id', c).order('id').range(a, b));
    for (const s of seats) if (byFunder.has(s.organization_id) || leadFor.has(s.organization_id)) { const st = seatsOf.get(s.person_id) ?? new Set<string>(); st.add(s.organization_id); seatsOf.set(s.person_id, st); }
  }
  const fundersByOwn = new Map<string, Map<string, { trustee: string; edge: string }[]>>();
  for (const e of edges) {
    const me = ownIds.has(e.source_person_id) ? e.source_person_id : e.target_person_id;
    const other = me === e.source_person_id ? e.target_person_id : e.source_person_id;
    for (const f of seatsOf.get(other) ?? []) { const m = fundersByOwn.get(me) ?? new Map(); const a = m.get(f) ?? []; a.push({ trustee: other, edge: e.id }); m.set(f, a); fundersByOwn.set(me, m); }
  }
  for (const c of chunks([...new Set(edges.flatMap(e => [e.source_person_id, e.target_person_id]))], 200)) { const { data } = await db.from('network_people').select('id, name').in('id', c); for (const p of data ?? []) if (!ownName.has(p.id as string)) ownName.set(p.id as string, { name: p.name as string, role: null }); }
  for (const c of chunks([...new Set([...seatsOf.values()].flatMap(s => [...s]))], 200)) { const { data } = await db.from('network_organizations').select('id, name').in('id', c); for (const o of data ?? []) names.set(o.id as string, o.name as string); }
  for (const [me, m] of fundersByOwn) {
    if (m.size < 2) continue;
    const who = ownName.get(me);
    const list = [...m].sort((a, b) => b[1].length - a[1].length);
    rows.push({
      insight_type: 'Shared Board',
      title: `${who?.name ?? 'A CYC person'} shares board service with trustees of ${m.size} funders`,
      summary: `CYC ${who?.role ? who.role.toLowerCase() : 'board member'} ${who?.name ?? ''} sits on boards alongside trustees of ${list.slice(0, 4).map(([f, t]) => `${nm(f)} (${[...new Set(t.map(x => ownName.get(x.trustee)?.name).filter(Boolean))].slice(0, 2).join(', ')})`).join('; ')}${m.size > 4 ? ` and ${m.size - 4} more` : ''}, per documented board rosters. Shared board service is an introduction path; no personal relationship is asserted.`,
      path: [{ kind: 'person', id: me, label: who?.name ?? 'CYC person' }, ...list.slice(0, 4).map(([f]) => ({ kind: 'org' as const, id: f, label: nm(f) }))],
      score: Math.min(100, 30 + 12 * Math.min(m.size, 5)), confidence: 'High',
      evidence: { generator: GENERATOR, edge_ids: list.flatMap(([, t]) => t.map(x => x.edge)).slice(0, 60), funders: list.map(([f]) => f) }, lead_id: leadFor.get(list[0][0]) ?? null,
    });
  }

  // ── Persist: wipe this generator's rows, insert fresh ──
  await db.from('network_insights').delete().eq('org_id', orgId).filter('evidence->>generator', 'eq', GENERATOR);
  let written = 0;
  const counts: Record<string, number> = {};
  for (const c of chunks(rows, 100)) {
    const { error } = await db.from('network_insights').insert(c.map(r => ({ org_id: orgId, ...r })));
    if (error) throw new Error(`insights insert: ${error.message}`);
    written += c.length;
    for (const r of c) counts[r.insight_type] = (counts[r.insight_type] ?? 0) + 1;
  }
  return { counts, written, sample: rows.sort((a, b) => b.score - a.score).slice(0, 8).map(r => `[${r.insight_type} ${r.score}] ${r.summary}`) };
}
