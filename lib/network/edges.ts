// Relationship derivation — the graph's edges, computed deterministically from
// rows that already exist. `computeEdges` is a pure function over in-memory
// rows (unit-tested); `deriveRelationships` loads the rows, adds the edges that
// need other tables (CYC's recorded relationships, CRA geography, peer
// funding, second-degree leads) and replaces the org's derived edges.
//
// Strengths follow the brief's rubric. Verification is earned, never assumed:
//   verified  — both facts cited (source_id) and, for tenure edges, dated overlap
//   probable  — both facts cited, no dates to prove overlap
//   inferred  — at least one uncited fact, or a name-based link

import { createServerClient } from '@/lib/supabase';
import { normalizeOrgName, yearsOverlap } from '@/lib/network/normalize';

export type Verification = 'verified' | 'probable' | 'inferred';

export interface EdgePerson { id: string; kind: string; name: string; organization_id: string | null; source_id: string | null }
export interface EdgeEmployment { person_id: string; organization_id: string | null; org_name: string; start_year: number | null; end_year: number | null; is_current: boolean; source_id: string | null }
export interface EdgeEducation { person_id: string; organization_id: string | null; school_name: string; start_year: number | null; end_year: number | null; source_id: string | null }
export interface EdgeBoard { person_id: string; organization_id: string; title: string | null; is_current: boolean; source_id: string | null; confidence: number }
export interface EdgeOrg { id: string; name: string; organization_type: string }

export interface GraphInput {
  cycOrgId: string | null;
  people: EdgePerson[];
  employments: EdgeEmployment[];
  educations: EdgeEducation[];
  boards: EdgeBoard[];
  orgs: Map<string, EdgeOrg>;
}

export interface DerivedEdge {
  relationship_type: string;
  source_person_id?: string; target_person_id?: string;
  source_organization_id?: string; target_organization_id?: string;
  relationship_strength: number;
  confidence: number;
  verification: Verification;
  evidence: Record<string, unknown>;
  source_id?: string | null;
  source_type: string;
}

/** Kinds that count as "CYC's own people" — every person↔person edge must touch one of these or a trustee. */
export const OWN_KINDS = new Set(['board', 'staff', 'auxiliary', 'council']);
const ANCHOR_KINDS = new Set([...OWN_KINDS, 'trustee', 'executive']);
const FOUNDATION_TYPES = new Set(['foundation', 'community_foundation', 'corporate_foundation']);
const CORPORATE_TYPES = new Set(['corporation', 'bank', 'corporate_foundation']);
const MAX_PEOPLE_PER_ORG = 40; // mega-employers produce noise, not relationships

const DERIVED = 'derived:v1';

interface Span { personId: string; orgId: string; start: number | null; end: number | null; current: boolean; sourceId: string | null; title: string | null }

/** Order a person pair deterministically so the unique index sees one edge. */
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export function computeEdges(g: GraphInput): DerivedEdge[] {
  const edges: DerivedEdge[] = [];
  const person = new Map(g.people.map(p => [p.id, p]));
  const anchor = (id: string) => ANCHOR_KINDS.has(person.get(id)?.kind ?? '');

  // ── Employment spans per org (dated history + the page's current affiliation) ──
  const spans: Span[] = [];
  const covered = new Set<string>();
  for (const e of g.employments) {
    if (!e.organization_id) continue;
    spans.push({ personId: e.person_id, orgId: e.organization_id, start: e.start_year, end: e.is_current ? null : e.end_year, current: e.is_current, sourceId: e.source_id, title: null });
    covered.add(`${e.person_id}|${e.organization_id}`);
  }
  for (const p of g.people) {
    // A trustee's "current org" is the foundation they sit on — that's a board
    // seat (shared_board / foundation_connection), not an employment span.
    if (p.kind === 'trustee') continue;
    if (p.organization_id && !covered.has(`${p.id}|${p.organization_id}`)) {
      spans.push({ personId: p.id, orgId: p.organization_id, start: null, end: null, current: true, sourceId: p.source_id, title: null });
    }
  }
  const byOrg = new Map<string, Span[]>();
  for (const s of spans) { const arr = byOrg.get(s.orgId) ?? []; arr.push(s); byOrg.set(s.orgId, arr); }

  // ── Colleague / shared-employer edges ──
  for (const [orgId, list] of byOrg) {
    if (orgId === g.cycOrgId) continue;                       // CYC itself is everyone's shared org
    const org = g.orgs.get(orgId);
    const byPerson = new Map<string, Span[]>();
    for (const s of list) { const arr = byPerson.get(s.personId) ?? []; arr.push(s); byPerson.set(s.personId, arr); }
    const ids = [...byPerson.keys()];
    if (ids.length < 2 || ids.length > MAX_PEOPLE_PER_ORG) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (!anchor(a) && !anchor(b)) continue;
      const A = byPerson.get(a)!, B = byPerson.get(b)!;
      type Cand = { type: string; strength: number; conf: number; ver: Verification; sa: Span; sb: Span };
      let best: Cand | null = null;
      for (const sa of A) for (const sb of B) {
        const cited = !!sa.sourceId && !!sb.sourceId;
        let cand: Cand;
        if (sa.current && sb.current) cand = { type: 'current_colleague', strength: 25, conf: cited ? 0.85 : 0.6, ver: cited ? 'verified' : 'probable', sa, sb };
        else if (yearsOverlap(sa.start, sa.end, sb.start, sb.end)) cand = { type: 'former_colleague', strength: 25, conf: cited ? 0.8 : 0.55, ver: cited ? 'verified' : 'probable', sa, sb };
        else cand = { type: 'shared_employer', strength: 18, conf: cited ? 0.6 : 0.4, ver: cited ? 'probable' : 'inferred', sa, sb };
        if (!best || cand.strength > best.strength || (cand.strength === best.strength && cand.conf > best.conf)) best = cand;
      }
      if (!best) continue;
      const [s, t] = pair(a, b);
      const fmt = (x: Span) => ({ person: person.get(x.personId)?.name, org: org?.name, start: x.start, end: x.current ? 'present' : x.end, source_id: x.sourceId });
      edges.push({
        relationship_type: best.type, source_person_id: s, target_person_id: t,
        relationship_strength: best.strength, confidence: best.conf, verification: best.ver,
        evidence: { summary: `${person.get(a)?.name} and ${person.get(b)?.name} ${best.type === 'current_colleague' ? 'both currently at' : best.type === 'former_colleague' ? 'overlapped at' : 'both worked at'} ${org?.name ?? 'the same organization'}`,
                    organization_id: orgId, tenures: [fmt(best.sa), fmt(best.sb)] },
        source_id: best.sa.sourceId ?? best.sb.sourceId ?? null, source_type: DERIVED,
      });
    }
  }

  // ── Shared external boards ──
  const boardsByOrg = new Map<string, EdgeBoard[]>();
  for (const b of g.boards) { if (b.organization_id === g.cycOrgId) continue; const arr = boardsByOrg.get(b.organization_id) ?? []; arr.push(b); boardsByOrg.set(b.organization_id, arr); }
  for (const [orgId, seats] of boardsByOrg) {
    const org = g.orgs.get(orgId);
    const ids = [...new Set(seats.map(s => s.person_id))];
    if (ids.length > MAX_PEOPLE_PER_ORG) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (!anchor(a) && !anchor(b)) continue;
      const sa = seats.find(s => s.person_id === a)!, sb = seats.find(s => s.person_id === b)!;
      const cited = !!sa.source_id && !!sb.source_id;
      const [s, t] = pair(a, b);
      edges.push({
        relationship_type: 'shared_board', source_person_id: s, target_person_id: t,
        relationship_strength: 15, confidence: Math.min(sa.confidence, sb.confidence) * (cited ? 1 : 0.7),
        verification: cited ? 'verified' : 'probable',
        evidence: { summary: `${person.get(a)?.name} and ${person.get(b)?.name} both sit on the ${org?.name ?? ''} board`, organization_id: orgId, seats: [sa.title, sb.title] },
        source_id: sa.source_id ?? sb.source_id ?? null, source_type: DERIVED,
      });
    }
  }

  // ── Shared university ──
  const eduKey = (e: EdgeEducation) => e.organization_id ?? `name:${normalizeOrgName(e.school_name)}`;
  const eduBy = new Map<string, EdgeEducation[]>();
  for (const e of g.educations) { const k = eduKey(e); if (!k || k === 'name:') continue; const arr = eduBy.get(k) ?? []; arr.push(e); eduBy.set(k, arr); }
  for (const [key, list] of eduBy) {
    const ids = [...new Set(list.map(e => e.person_id))];
    if (ids.length < 2 || ids.length > MAX_PEOPLE_PER_ORG) continue;
    const school = list[0].school_name;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (!anchor(a) && !anchor(b)) continue;
      const ea = list.find(e => e.person_id === a)!, eb = list.find(e => e.person_id === b)!;
      const overlap = yearsOverlap(ea.start_year, ea.end_year, eb.start_year, eb.end_year);
      const cited = !!ea.source_id && !!eb.source_id;
      const [s, t] = pair(a, b);
      edges.push({
        relationship_type: 'shared_university', source_person_id: s, target_person_id: t,
        relationship_strength: 12, confidence: (overlap ? 0.7 : 0.5) * (cited ? 1 : 0.8),
        verification: overlap && cited ? 'verified' : cited ? 'probable' : 'inferred',
        evidence: { summary: `${person.get(a)?.name} and ${person.get(b)?.name} both attended ${school}${overlap ? ' in overlapping years' : ''}`, school, key, years: [[ea.start_year, ea.end_year], [eb.start_year, eb.end_year]] },
        source_id: ea.source_id ?? eb.source_id ?? null, source_type: DERIVED,
      });
    }
  }

  // ── Person → organization: foundation seats and corporate employers ──
  for (const b of g.boards) {
    const org = g.orgs.get(b.organization_id);
    if (!org || b.organization_id === g.cycOrgId || !FOUNDATION_TYPES.has(org.organization_type)) continue;
    edges.push({
      relationship_type: 'foundation_connection', source_person_id: b.person_id, target_organization_id: b.organization_id,
      relationship_strength: 15, confidence: b.confidence, verification: b.source_id ? 'verified' : 'probable',
      evidence: { summary: `${person.get(b.person_id)?.name} — ${b.title ?? 'board'} at ${org.name}`, title: b.title, is_current: b.is_current },
      source_id: b.source_id, source_type: DERIVED,
    });
  }
  const corpSeen = new Set<string>();
  for (const s of spans) {
    const org = g.orgs.get(s.orgId);
    if (!org || !CORPORATE_TYPES.has(org.organization_type) || !anchor(s.personId)) continue;
    const k = `${s.personId}|${s.orgId}`; if (corpSeen.has(k)) continue; corpSeen.add(k);
    edges.push({
      relationship_type: 'corporate_connection', source_person_id: s.personId, target_organization_id: s.orgId,
      relationship_strength: s.current ? 10 : 8, confidence: s.sourceId ? 0.75 : 0.5, verification: s.sourceId ? 'verified' : 'probable',
      evidence: { summary: `${person.get(s.personId)?.name} ${s.current ? 'works at' : 'previously worked at'} ${org.name}`, start: s.start, end: s.current ? 'present' : s.end },
      source_id: s.sourceId, source_type: DERIVED,
    });
  }

  return edges;
}

// ── DB wrapper ──────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createServerClient>;

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function loadGraphInput(db: Db, orgId: string): Promise<GraphInput> {
  const people = await pageAll<EdgePerson>((a, b) => db.from('network_people').select('id, kind, name, organization_id, source_id').eq('org_id', orgId).order('id').range(a, b));
  const ids = people.map(p => p.id);
  const inChunks = async <T>(sel: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 300) { const { data, error } = await sel(ids.slice(i, i + 300)); if (error) throw new Error(error.message); out.push(...(data ?? [])); }
    return out;
  };
  const employments = await inChunks<EdgeEmployment>(c => db.from('network_employments').select('person_id, organization_id, org_name, start_year, end_year, is_current, source_id').in('person_id', c));
  const educations  = await inChunks<EdgeEducation>(c => db.from('network_educations').select('person_id, organization_id, school_name, start_year, end_year, source_id').in('person_id', c));
  const boards      = await inChunks<EdgeBoard>(c => db.from('network_boards').select('person_id, organization_id, title, is_current, source_id, confidence').in('person_id', c));

  const orgIds = new Set<string>();
  for (const p of people) if (p.organization_id) orgIds.add(p.organization_id);
  for (const e of employments) if (e.organization_id) orgIds.add(e.organization_id);
  for (const e of educations) if (e.organization_id) orgIds.add(e.organization_id);
  for (const b of boards) orgIds.add(b.organization_id);
  const orgs = new Map<string, EdgeOrg>();
  const list = [...orgIds];
  for (let i = 0; i < list.length; i += 300) {
    const { data } = await db.from('network_organizations').select('id, name, organization_type').in('id', list.slice(i, i + 300));
    for (const o of data ?? []) orgs.set(o.id as string, o as EdgeOrg);
  }
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', '362344429').maybeSingle();
  return { cycOrgId: cyc?.id ?? null, people, employments, educations, boards, orgs };
}

/** Edges that need other tables: CYC's recorded relationships, CRA geography, peer funding, second-degree leads. */
async function crossTableEdges(db: Db, orgId: string, cycOrgId: string | null): Promise<DerivedEdge[]> {
  const edges: DerivedEdge[] = [];
  if (!cycOrgId) return edges;

  // existing_cyc_relationship — self-reported funder relationships (banks) + awarded Instrumentl funders.
  const { data: rels } = await db.from('org_funder_relationships').select('funder_id, status, source, notes').eq('organization_id', orgId);
  for (const r of rels ?? []) {
    const { data: o } = await db.from('network_organizations').select('id, name').eq('funder_id', r.funder_id).maybeSingle();
    if (!o) continue;
    edges.push({
      relationship_type: 'existing_cyc_relationship', source_organization_id: cycOrgId, target_organization_id: o.id as string,
      relationship_strength: 10, confidence: r.source === 'self_reported' ? 0.9 : 0.7, verification: 'verified',
      evidence: { summary: `CYC has an ${r.status} relationship with ${o.name} (${r.source})`, status: r.status, notes: r.notes }, source_type: DERIVED,
    });
  }
  const { data: subs } = await db.from('cyc_grant_submissions').select('funder_name, outcome, amount_awarded, status').eq('org_id', orgId).eq('outcome', 'awarded');
  const awarded = new Map<string, { n: number; amount: number; name: string }>();
  for (const s of subs ?? []) {
    const k = normalizeOrgName(s.funder_name); if (!k) continue;
    const cur = awarded.get(k) ?? { n: 0, amount: 0, name: s.funder_name as string };
    cur.n++; cur.amount += Number(s.amount_awarded) || 0; awarded.set(k, cur);
  }
  for (const [k, v] of awarded) {
    const { data: hits } = await db.from('network_organizations').select('id, name').eq('normalized_name', k).limit(2);
    if (!hits || hits.length !== 1) continue;                  // ambiguous name → no link, no guess
    edges.push({
      relationship_type: 'existing_cyc_relationship', source_organization_id: cycOrgId, target_organization_id: hits[0].id as string,
      relationship_strength: 10, confidence: 0.9, verification: 'verified',
      evidence: { summary: `${hits[0].name} has funded CYC (${v.n} award${v.n === 1 ? '' : 's'}${v.amount ? `, $${Math.round(v.amount).toLocaleString('en-US')}` : ''}) per Instrumentl`, awards: v.n, amount: v.amount }, source_type: DERIVED,
    });
  }

  // geographic_overlap — banks whose CRA assessment areas cover CYC's tract.
  const { data: orgRow } = await db.from('organizations').select('census_tract').eq('id', orgId).maybeSingle();
  if (orgRow?.census_tract) {
    const { data: aas } = await db.from('bank_assessment_areas').select('funder_id, source').eq('tract_id', orgRow.census_tract);
    for (const a of aas ?? []) {
      const { data: o } = await db.from('network_organizations').select('id, name').eq('funder_id', a.funder_id).maybeSingle();
      if (!o) continue;
      const conf = a.source === 'ffiec_aa' ? 0.95 : a.source === 'cra_pe_pdf' ? 0.85 : 0.7;
      edges.push({
        relationship_type: 'geographic_overlap', source_organization_id: cycOrgId, target_organization_id: o.id as string,
        relationship_strength: 8, confidence: conf, verification: a.source === 'manual_seed' ? 'probable' : 'verified',
        evidence: { summary: `${o.name}'s CRA assessment area covers CYC's census tract ${orgRow.census_tract}`, tract: orgRow.census_tract, aa_source: a.source }, source_type: DERIVED,
      });
    }
  }

  // philanthropic_overlap — funders that fund CYC's peers.
  const { data: peers } = await db.from('network_peer_orgs').select('organization_id').eq('org_id', orgId);
  const peerIds = new Set((peers ?? []).map(p => p.organization_id as string));
  if (peerIds.size) {
    const grants = await pageAll<{ funder_org_id: string; recipient_org_id: string; fiscal_year: number; amount: number | null; confidence: number; source_url: string | null; source_id: string | null }>(
      // Ordered pagination — the ingester may be appending while we read.
      (a, b) => db.from('grants_made').select('funder_org_id, recipient_org_id, fiscal_year, amount, confidence, source_url, source_id').not('funder_org_id', 'is', null).not('recipient_org_id', 'is', null).order('id').range(a, b));
    const agg = new Map<string, { funder: string; peer: string; events: number; amount: number; last: number; conf: number; cited: boolean; source_id: string | null }>();
    for (const g of grants) {
      if (!peerIds.has(g.recipient_org_id)) continue;
      const k = `${g.funder_org_id}|${g.recipient_org_id}`;
      const cur = agg.get(k) ?? { funder: g.funder_org_id, peer: g.recipient_org_id, events: 0, amount: 0, last: 0, conf: 0, cited: false, source_id: g.source_id };
      cur.events++; cur.amount += Number(g.amount) || 0; cur.last = Math.max(cur.last, g.fiscal_year); cur.conf = Math.max(cur.conf, Number(g.confidence) || 0); cur.cited = cur.cited || !!g.source_url;
      agg.set(k, cur);
    }
    for (const v of agg.values()) {
      edges.push({
        relationship_type: 'philanthropic_overlap', source_organization_id: v.funder, target_organization_id: v.peer,
        relationship_strength: 20, confidence: v.conf, verification: v.cited ? 'verified' : 'inferred',
        evidence: { summary: `${v.events} grant${v.events === 1 ? '' : 's'} to a CYC peer, most recent FY${v.last}${v.amount ? `, $${Math.round(v.amount).toLocaleString('en-US')}` : ''}`, events: v.events, amount: v.amount, last_year: v.last },
        source_id: v.source_id, source_type: DERIVED,
      });
    }
  }

  // second_degree — warm-path leads already discovered via a CYC person.
  const { data: leads } = await db.from('network_leads').select('person_id, via_person_id, via_org, score, reason').eq('org_id', orgId).not('person_id', 'is', null).not('via_person_id', 'is', null);
  for (const l of leads ?? []) {
    edges.push({
      relationship_type: 'second_degree', source_person_id: l.via_person_id as string, target_person_id: l.person_id as string,
      relationship_strength: 10, confidence: Math.min(0.6, (Number(l.score) || 0) / 100), verification: 'inferred',
      evidence: { summary: l.reason, via_org: l.via_org }, source_type: DERIVED,
    });
  }
  return edges;
}

/**
 * Collapse edges that share the unique-index key (type + endpoints + source
 * type): a trustee with two seats at one foundation, a funder that is both
 * self-reported and Instrumentl-awarded, a lead reachable via two employers.
 * Keeps the strongest / most confident edge and folds the others' evidence in.
 */
export function dedupeEdges(edges: DerivedEdge[]): DerivedEdge[] {
  const byKey = new Map<string, DerivedEdge>();
  for (const e of edges) {
    const k = [e.relationship_type, e.source_person_id ?? '', e.target_person_id ?? '', e.source_organization_id ?? '', e.target_organization_id ?? '', e.source_type].join('|');
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, { ...e, evidence: { ...e.evidence } }); continue; }
    const better = e.relationship_strength > cur.relationship_strength || (e.relationship_strength === cur.relationship_strength && e.confidence > cur.confidence);
    const keep = better ? { ...e, evidence: { ...e.evidence } } : cur;
    const other = better ? cur : e;
    const also = Array.isArray(keep.evidence.also) ? (keep.evidence.also as unknown[]) : [];
    keep.evidence.also = [...also, other.evidence.summary ?? other.evidence].slice(0, 6);
    if (!keep.source_id && other.source_id) keep.source_id = other.source_id;
    byKey.set(k, keep);
  }
  return [...byKey.values()];
}

export interface DeriveReport { computed: number; crossTable: number; written: number; byType: Record<string, number> }

/** Replace the org's derived edges with a fresh derivation. Idempotent. */
export async function deriveRelationships(orgId: string): Promise<DeriveReport> {
  const db = createServerClient();
  const input = await loadGraphInput(db, orgId);
  const computed = computeEdges(input);
  const cross = await crossTableEdges(db, orgId, input.cycOrgId);
  const all = dedupeEdges([...computed, ...cross]);

  await db.from('network_relationships').delete().eq('org_id', orgId).like('source_type', 'derived:%');
  let written = 0;
  const byType: Record<string, number> = {};
  for (let i = 0; i < all.length; i += 400) {
    const chunk = all.slice(i, i + 400).map(e => ({ org_id: orgId, ...e, relationship_strength: Math.round(e.relationship_strength), confidence: Math.round(e.confidence * 100) / 100 }));
    const { error, count } = await db.from('network_relationships').insert(chunk, { count: 'exact' });
    if (error) throw new Error(`edge insert failed: ${error.message}`);
    written += count ?? chunk.length;
  }
  for (const e of all) byType[e.relationship_type] = (byType[e.relationship_type] ?? 0) + 1;
  return { computed: computed.length, crossTable: cross.length, written, byType };
}
