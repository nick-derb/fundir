// Peer Network page data: the people found at CYC's peer organizations, each
// with every reason they might matter to CYC — a documented path to one of
// CYC's own people, a past job at a funder CYC tracks, time at another peer,
// or a CYC past of their own — plus the funders behind their organization,
// classified against CYC's own funding history. All of it is read from the
// graph; nothing here calls a provider.

import { createServerClient } from '@/lib/supabase';
import { PEER_STAFF_KIND, CYC_SIDE_KINDS } from '@/lib/network/peer-staff';

type Db = ReturnType<typeof createServerClient>;

export type FunderRelation = 'funds_cyc' | 'cyc_pursuing' | 'untapped';
export interface PeerFunder { name: string; events: number; lastYear: number | null; relation: FunderRelation }
export interface PeerOrgCard {
  id: string; name: string; similarity: number; funders: PeerFunder[];
  scan: { status: string; scannedAt: string; kept: number; hits: number; note: string | null } | null;
  staff: number; withPath: number;
}
export interface PeerPath { type: string; label: string; verification: string; person: { id: string; name: string; kind: string; kindLabel: string; title: string | null }; summary: string | null }
export interface PeerPerson {
  id: string; name: string; title: string | null; headline: string | null; org: string; orgId: string | null; location: string | null;
  linkedinUrl: string | null; enrichedAt: string | null; verification: string; tier: 'development' | 'executive' | 'other';
  career: Array<{ org: string; title: string | null; start: number | null; end: number | null; current: boolean }>;
  education: Array<{ school: string; degree: string | null; field: string | null }>;
  paths: PeerPath[];
  funderPast: Array<{ org: string; relation: FunderRelation | 'peer_funder' }>;
  peerPast: string[];
  cycAlumni: boolean;
  score: number;
  why: string[];
  move: string;
}
export interface PeerNetwork { peers: PeerOrgCard[]; people: PeerPerson[] }

const KIND_LABEL: Record<string, string> = { board: 'CYC board', auxiliary: 'CYC auxiliary board', council: 'CYC council', staff: 'CYC staff', trustee: 'funder trustee', executive: 'funder executive' };
const REL_LABEL: Record<string, string> = { former_colleague: 'former colleagues', current_colleague: 'current colleagues', shared_employer: 'same employer, different years', shared_board: 'sit on the same board', shared_university: 'same university', existing_cyc_relationship: 'known to CYC', second_degree: 'second degree' };
const TITLE_STRONG = /develop|philanthrop|foundation|grant|giving|advancement|donor|major gift|fundrais|institutional|external (affairs|relations)|partnership/i;
const TITLE_EXEC = /chief|ceo|president|executive director|managing director|founder|vp|vice president|head of|director of/i;

/** A forgiving key for funder / employer names ("The Polk Bros. Foundation, Inc." ≈ "Polk Bros Foundation"). */
export const funderKey = (v: string | null | undefined) => (v ?? '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(the|foundation|inc|incorporated|trust|tr|fund|funds|philanthropies|philanthropy|family|charitable|company|co|llc|corporation|corp|nfp)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

const tierOf = (title: string | null, headline: string | null): PeerPerson['tier'] => {
  const t = `${title ?? ''} ${headline ?? ''}`;
  return TITLE_STRONG.test(t) ? 'development' : TITLE_EXEC.test(t) ? 'executive' : 'other';
};

async function inChunks<T>(ids: string[], size: number, fn: (c: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) { const { data } = await fn(ids.slice(i, i + size)); out.push(...(data ?? [])); }
  return out;
}

export async function getPeerNetwork(db: Db, orgId: string): Promise<PeerNetwork> {
  // ── CYC's own funding context: who funds CYC, who CYC is pursuing ──
  const [{ data: subs }, { data: cult }] = await Promise.all([
    db.from('cyc_grant_submissions').select('funder_name, outcome, stage').eq('org_id', orgId),
    db.from('cyc_cultivation').select('foundation_name').eq('org_id', orgId),
  ]);
  const relation = new Map<string, FunderRelation>();
  for (const s of subs ?? []) { const k = funderKey(s.funder_name as string); if (!k) continue; if (s.outcome === 'awarded') relation.set(k, 'funds_cyc'); else if (!relation.has(k)) relation.set(k, 'cyc_pursuing'); }
  for (const c of cult ?? []) { const k = funderKey(c.foundation_name as string); if (k && !relation.has(k)) relation.set(k, 'cyc_pursuing'); }
  const relationOf = (name: string): FunderRelation => relation.get(funderKey(name)) ?? 'untapped';

  // ── Peers flagged for a scan ──
  const [{ data: peerRows }, { data: scans }] = await Promise.all([
    db.from('network_peer_orgs').select('organization_id, similarity, relevant_funders, staff_scan_name, org:network_organizations!network_peer_orgs_organization_id_fkey(name)').eq('org_id', orgId).eq('staff_scan', true),
    db.from('network_peer_scans').select('peer_organization_id, status, scanned_at, kept, hits, note').eq('org_id', orgId),
  ]);
  const scanBy = new Map((scans ?? []).map(s => [s.peer_organization_id as string, s]));
  const peers: PeerOrgCard[] = ((peerRows ?? []) as unknown as Array<{ organization_id: string; similarity: number | null; relevant_funders: Array<{ name: string; events: number; last_year: number | null }> | null; staff_scan_name: string | null; org: { name: string } | null }>).map(p => {
    const s = scanBy.get(p.organization_id);
    return {
      id: p.organization_id, name: p.staff_scan_name ?? p.org?.name ?? 'Peer', similarity: Number(p.similarity ?? 0),
      funders: (p.relevant_funders ?? []).map(f => ({ name: f.name, events: Number(f.events ?? 0), lastYear: f.last_year ?? null, relation: relationOf(f.name) })),
      scan: s ? { status: s.status as string, scannedAt: s.scanned_at as string, kept: Number(s.kept ?? 0), hits: Number(s.hits ?? 0), note: (s.note as string | null) ?? null } : null,
      staff: 0, withPath: 0,
    };
  });
  const peerById = new Map(peers.map(p => [p.id, p]));
  const peerKeys = new Map(peers.map(p => [funderKey(p.name), p.name]));
  const peerFunderKeys = new Map<string, string>();
  for (const p of peers) for (const f of p.funders) peerFunderKeys.set(funderKey(f.name), f.name);

  // ── The people, their careers, schools and edges ──
  const { data: rows } = await db.from('network_people').select('id, name, current_title, headline, current_org, organization_id, location, linkedin_url, enriched_at, verification').eq('org_id', orgId).eq('kind', PEER_STAFF_KIND).order('name').limit(2000);
  const ids = (rows ?? []).map(r => r.id as string);
  type Emp = { person_id: string; org_name: string; title: string | null; start_year: number | null; end_year: number | null; is_current: boolean };
  type Edu = { person_id: string; school_name: string; degree: string | null; field: string | null };
  type Edge = { source_person_id: string | null; target_person_id: string | null; relationship_type: string; verification: string; evidence: { summary?: string } | null };
  const [emps, edus, e1, e2] = await Promise.all([
    inChunks<Emp>(ids, 200, c => db.from('network_employments').select('person_id, org_name, title, start_year, end_year, is_current').in('person_id', c)),
    inChunks<Edu>(ids, 200, c => db.from('network_educations').select('person_id, school_name, degree, field').in('person_id', c)),
    inChunks<Edge>(ids, 200, c => db.from('network_relationships').select('source_person_id, target_person_id, relationship_type, verification, evidence').eq('org_id', orgId).in('source_person_id', c).not('target_person_id', 'is', null)),
    inChunks<Edge>(ids, 200, c => db.from('network_relationships').select('source_person_id, target_person_id, relationship_type, verification, evidence').eq('org_id', orgId).in('target_person_id', c).not('source_person_id', 'is', null)),
  ]);
  const otherIds = [...new Set([...e1, ...e2].flatMap(e => [e.source_person_id, e.target_person_id]).filter((x): x is string => !!x && !ids.includes(x)))];
  const others = new Map((await inChunks<{ id: string; name: string; kind: string; current_title: string | null }>(otherIds, 200, c => db.from('network_people').select('id, name, kind, current_title').in('id', c))).map(o => [o.id, o]));

  const empBy = new Map<string, Emp[]>(); for (const e of emps) { const a = empBy.get(e.person_id) ?? []; a.push(e); empBy.set(e.person_id, a); }
  const eduBy = new Map<string, Edu[]>(); for (const e of edus) { const a = eduBy.get(e.person_id) ?? []; a.push(e); eduBy.set(e.person_id, a); }
  const edgeBy = new Map<string, Edge[]>();
  for (const e of [...e1, ...e2]) for (const pid of [e.source_person_id, e.target_person_id]) if (pid && ids.includes(pid)) { const a = edgeBy.get(pid) ?? []; a.push(e); edgeBy.set(pid, a); }

  const people: PeerPerson[] = (rows ?? []).map(r => {
    const id = r.id as string;
    const peer = r.organization_id ? peerById.get(r.organization_id as string) : undefined;
    const orgName = peer?.name ?? (r.current_org as string | null) ?? 'Peer organization';
    const career = (empBy.get(id) ?? []).sort((a, b) => Number(b.is_current) - Number(a.is_current) || (b.start_year ?? 0) - (a.start_year ?? 0))
      .map(e => ({ org: e.org_name, title: e.title, start: e.start_year, end: e.is_current ? null : e.end_year, current: !!e.is_current }));
    const seenPath = new Set<string>();
    const paths: PeerPath[] = [];
    for (const e of edgeBy.get(id) ?? []) {
      const oid = e.source_person_id === id ? e.target_person_id : e.source_person_id;
      const o = oid ? others.get(oid) : undefined;
      if (!o || !CYC_SIDE_KINDS.has(o.kind) || seenPath.has(`${oid}|${e.relationship_type}`)) continue;
      seenPath.add(`${oid}|${e.relationship_type}`);
      paths.push({ type: e.relationship_type, label: REL_LABEL[e.relationship_type] ?? e.relationship_type.replace(/_/g, ' '), verification: e.verification, person: { id: o.id, name: o.name, kind: o.kind, kindLabel: KIND_LABEL[o.kind] ?? o.kind, title: o.current_title }, summary: e.evidence?.summary ?? null });
    }
    paths.sort((a, b) => rank(b.verification) - rank(a.verification));
    const funderPast: PeerPerson['funderPast'] = [];
    const peerPast: string[] = [];
    let cycAlumni = false;
    for (const c of career) {
      if (c.current) continue;
      const k = funderKey(c.org);
      if (!k) continue;
      if (/chicago youth centers/i.test(c.org)) { cycAlumni = true; continue; }
      const rel = relation.get(k);
      if (rel) { if (!funderPast.some(f => funderKey(f.org) === k)) funderPast.push({ org: c.org, relation: rel }); continue; }
      if (peerFunderKeys.has(k)) { if (!funderPast.some(f => funderKey(f.org) === k)) funderPast.push({ org: c.org, relation: 'peer_funder' }); continue; }
      const pk = peerKeys.get(k);
      if (pk && pk !== orgName && !peerPast.includes(pk)) peerPast.push(pk);
    }
    const tier = tierOf(r.current_title as string | null, r.headline as string | null);
    const chicago = /chicago|illinois|\bil\b/i.test((r.location as string | null) ?? '');
    let score = 0;
    score += Math.min(60, paths.reduce((n, p) => n + (p.verification === 'verified' ? 30 : p.verification === 'probable' ? 20 : 10), 0));
    score += Math.min(30, funderPast.reduce((n, f) => n + (f.relation === 'funds_cyc' ? 20 : 15), 0));
    score += Math.min(10, peerPast.length * 5);
    if (cycAlumni) score += 25;
    score += tier === 'development' ? 15 : tier === 'executive' ? 8 : 0;
    if (chicago) score += 5;
    score = Math.min(100, score);

    const why: string[] = [];
    for (const p of paths.slice(0, 3)) why.push(p.summary ? `${p.summary} (${p.person.kindLabel}${p.verification === 'verified' ? '' : `, ${p.verification}`}).` : `${p.label} with ${p.person.name}, ${p.person.kindLabel}.`);
    if (cycAlumni) why.push('Worked at Chicago Youth Centers before this role.');
    for (const f of funderPast.slice(0, 2)) why.push(f.relation === 'funds_cyc' ? `Previously at ${f.org}, which funds CYC.` : f.relation === 'cyc_pursuing' ? `Previously at ${f.org}, a funder CYC is pursuing.` : `Previously at ${f.org}, which funds one of CYC's peers.`);
    for (const p of peerPast.slice(0, 2)) why.push(`Also worked at ${p}, another CYC peer.`);
    const orgFunders = (peer?.funders ?? []).filter(f => f.relation !== 'untapped').slice(0, 3);
    if (orgFunders.length) why.push(`${orgName} is funded by ${orgFunders.map(f => f.name).join(', ')}${orgFunders.some(f => f.relation === 'cyc_pursuing') ? ', which CYC is pursuing' : ', which also funds CYC'}.`);
    if (!why.length) why.push(tier === 'development' ? `Runs fundraising at ${orgName}, a close CYC peer: sees the same program officers CYC does.` : tier === 'executive' ? `Leads ${orgName}, a close CYC peer.` : `Staff at ${orgName}, a close CYC peer.`);

    const best = paths[0];
    const move = best
      ? `Ask ${best.person.name} (${best.person.kindLabel}) for an introduction; they were ${best.label}.`
      : cycAlumni ? 'A CYC alum: a direct, friendly reach-out from Tina or Elle is appropriate.'
      : funderPast[0] ? `Reference their time at ${funderPast[0].org} when approaching that funder's program officer, or ask them how the foundation thinks.`
      : orgFunders.length ? `Peer-to-peer outreach: ask how ${orgName} got in with ${orgFunders[0].name}.`
      : 'Peer-to-peer outreach: development leads at similar organizations trade program-officer intel freely.';

    return {
      id, name: r.name as string, title: (r.current_title as string | null) ?? null, headline: (r.headline as string | null) ?? null, org: orgName, orgId: (r.organization_id as string | null) ?? null,
      location: (r.location as string | null) ?? null, linkedinUrl: (r.linkedin_url as string | null) ?? null, enrichedAt: (r.enriched_at as string | null) ?? null, verification: (r.verification as string) ?? 'probable', tier,
      career: career.slice(0, 8), education: (eduBy.get(id) ?? []).map(e => ({ school: e.school_name, degree: e.degree, field: e.field })).slice(0, 4),
      paths, funderPast, peerPast, cycAlumni, score, why, move,
    };
  });

  for (const p of people) { const peer = p.orgId ? peerById.get(p.orgId) : undefined; if (!peer) continue; peer.staff++; if (p.paths.length) peer.withPath++; }
  people.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  peers.sort((a, b) => b.withPath - a.withPath || b.staff - a.staff || b.funders.length - a.funders.length || a.name.localeCompare(b.name));
  return { peers, people };
}

const rank = (v: string) => (v === 'verified' ? 3 : v === 'probable' ? 2 : 1);
