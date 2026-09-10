// Phase 4 — foundation board cross-reference.
//
// For every foundation that matters to CYC (funds its peers, sits on its
// research queue or cultivation list, or has funded CYC), take the trustee
// roster the graph now holds (990 Part VII, CYC's sheet, public bios), find
// person↔person edges between those trustees and CYC's own people, and turn
// the best ones into warm-path LEADS and INSIGHTS with hedged language.
//
// Two inferences are made explicit rather than hidden:
//   • Officers of a CORPORATE foundation work for the corporation. Stored as
//     an employment whose title starts with "[inferred]" so the edge layer
//     grades it 'inferred', never 'verified'.
//   • A shared employer without dated tenure is a shared employer, not a
//     colleague. The wording says so.

import { createServerClient } from '@/lib/supabase';
import { ensureOrganization } from '@/lib/network/bridge';
import { canonicalEmployer, knownEmployerDisplay, normalizeOrgName, normalizeEin } from '@/lib/network/normalize';
import { OWN_KINDS } from '@/lib/network/edges';

type Db = ReturnType<typeof createServerClient>;
const GENERATOR = 'crossref:v1';

/** Retry transient network failures with backoff; rethrow anything else. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!/fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|502|503|504|timeout/i.test(e instanceof Error ? e.message : String(e))) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1) ** 2));
    }
  }
  throw last;
}
const FOUNDATION_TYPES = new Set(['foundation', 'community_foundation', 'corporate_foundation']);
const PATH_TYPES = new Set(['former_colleague', 'current_colleague', 'shared_employer', 'shared_board', 'shared_university', 'existing_cyc_relationship']);

// ── Corporate foundations → the corporation ─────────────────────────────────

/** "Northern Trust Foundation" → "Northern Trust"; null when nothing is left after stripping. */
export function parentCorporationName(foundationName: string): string | null {
  const clean = (s: string) => s.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  // Pass 1: drop only the philanthropic wrapper words. If the alias table knows
  // what's left ("Northern Trust"), that's the corporation — "Trust" is its name.
  const pass1 = clean(foundationName.replace(/\b(charitable|corporate|community|giving|philanthropic|memorial|family|foundation|fdn)\b\.?/gi, ' '));
  const known = knownEmployerDisplay(pass1);
  if (known) return known;
  // Pass 2: also drop legal forms and generic vehicles. Nothing left → not a corporation.
  const pass2 = clean(pass1.replace(/\b(fund|trust|inc|incorporated|llc|corp|corporation|co)\b\.?/gi, ' '));
  if (!pass2 || pass2.length < 3) return null;
  if (normalizeOrgName(pass2) === normalizeOrgName(foundationName)) return null;
  return canonicalEmployer(pass2)?.display ?? pass2;
}

/**
 * Officers/trustees seated at corporate foundations get an [inferred]
 * employment at the parent corporation, cited to the same filing as the seat.
 */
export async function inferCorporateEmployment(db: Db, orgId: string): Promise<{ inferred: number; corporations: number }> {
  const { data: corpFdns } = await db.from('network_organizations').select('id, name').eq('organization_type', 'corporate_foundation');
  let inferred = 0; const corps = new Set<string>();
  for (const f of corpFdns ?? []) {
    const parent = parentCorporationName(f.name as string);
    if (!parent) continue;
    const { data: seats } = await db.from('network_boards')
      .select('person_id, title, source_id, network_people!inner(id, org_id, kind)')
      .eq('organization_id', f.id);
    const rows = (seats ?? []).filter(s => { const p = s.network_people as unknown as { org_id: string; kind: string }; return p.org_id === orgId && (p.kind === 'trustee' || p.kind === 'executive'); });
    if (!rows.length) continue;
    const corp = await ensureOrganization(db, { name: parent, type: 'corporation', sourceId: rows[0].source_id as string | null, confidence: 0.6 });
    corps.add(corp.id);
    for (const s of rows) {
      const { data: exists } = await db.from('network_employments').select('id').eq('person_id', s.person_id).eq('organization_id', corp.id).maybeSingle();
      if (exists) continue;
      const { error } = await db.from('network_employments').insert({
        person_id: s.person_id, org_name: parent, organization_id: corp.id,
        title: `[inferred] ${s.title ?? 'Officer'} of ${f.name}`, is_current: true, source_id: s.source_id,
      });
      if (!error) inferred++;
    }
  }
  return { inferred, corporations: corps.size };
}

// ── Foundation relevance ────────────────────────────────────────────────────

export interface FoundationRank {
  id: string; name: string; ein: string | null; type: string; website: string | null;
  peerEvents: number; onQueue: boolean; onCultivation: boolean; fundedCyc: boolean; trustees: number;
  relevance: number;
}

/** Rank the foundations the cross-reference should spend effort on. */
export async function rankFoundations(db: Db, orgId: string, limit = 40): Promise<FoundationRank[]> {
  const { data: cycNode } = await db.from('network_organizations').select('id').eq('ein', '362344429').maybeSingle();
  const [{ data: queue }, { data: cult }, { data: fundEdges }, { data: cycEdges }] = await Promise.all([
    db.from('cyc_research_queue').select('ein, priority').eq('org_id', orgId),
    db.from('cyc_cultivation').select('bmf_ein').eq('org_id', orgId),
    db.from('network_relationships').select('source_organization_id, evidence').eq('org_id', orgId).eq('relationship_type', 'philanthropic_overlap'),
    db.from('network_relationships').select('target_organization_id').eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_organization_id', cycNode?.id ?? '00000000-0000-0000-0000-000000000000'),
  ]);
  const queueEins = new Map((queue ?? []).map(q => [normalizeEin(q.ein), Number(q.priority) || 99]));
  const cultEins = new Set((cult ?? []).map(c => normalizeEin(c.bmf_ein)));
  const peerEvents = new Map<string, number>();
  for (const e of fundEdges ?? []) peerEvents.set(e.source_organization_id as string, (peerEvents.get(e.source_organization_id as string) ?? 0) + (Number((e.evidence as Record<string, unknown>)?.events) || 1));
  const funded = new Set((cycEdges ?? []).map(e => e.target_organization_id as string));

  // Candidate set: any foundation with peer events, queue/cultivation presence, CYC funding, or a roster.
  const { data: seatCounts } = await db.from('network_boards').select('organization_id');
  const trusteesBy = new Map<string, number>();
  for (const s of seatCounts ?? []) trusteesBy.set(s.organization_id as string, (trusteesBy.get(s.organization_id as string) ?? 0) + 1);
  const ids = new Set<string>([...peerEvents.keys(), ...funded, ...trusteesBy.keys()]);
  const out: FoundationRank[] = [];
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 300) {
    const { data: orgs } = await db.from('network_organizations').select('id, name, ein, organization_type, website').in('id', idList.slice(i, i + 300));
    for (const o of orgs ?? []) {
      if (!FOUNDATION_TYPES.has(o.organization_type as string)) continue;
      const ein = normalizeEin(o.ein);
      const onQueue = !!ein && queueEins.has(ein);
      const onCultivation = !!ein && cultEins.has(ein);
      const pe = peerEvents.get(o.id as string) ?? 0;
      const fundedCyc = funded.has(o.id as string);
      const trustees = trusteesBy.get(o.id as string) ?? 0;
      const relevance = Math.min(100, pe * 6 + (onQueue ? 25 - Math.min(20, (queueEins.get(ein!) ?? 99)) : 0) + (onCultivation ? 20 : 0) + (fundedCyc ? 15 : 0) + Math.min(10, trustees));
      if (relevance <= 0) continue;
      out.push({ id: o.id as string, name: o.name as string, ein, type: o.organization_type as string, website: o.website as string | null, peerEvents: pe, onQueue, onCultivation, fundedCyc, trustees, relevance });
    }
  }
  return out.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
}

// ── Warm paths ──────────────────────────────────────────────────────────────

export interface PathEdge {
  id: string; relationship_type: string; relationship_strength: number; confidence: number; verification: string;
  evidence: Record<string, unknown>; source_id: string | null;
}
export interface WarmPath {
  cycPerson: { id: string; name: string; kind: string; board_role: string | null };
  trustee: { id: string; name: string; title: string | null };
  foundation: { id: string; name: string };
  sharedOrg: string;
  edge: PathEdge;
  strength: number;       // 0–100
  confidence: 'Low' | 'Medium' | 'High';
  wording: string;
}

const REL_PHRASE: Record<string, (org: string, ev: Record<string, unknown>) => string> = {
  former_colleague: (org, ev) => {
    const t = (ev.tenures as Array<{ start?: number | null; end?: unknown }> | undefined) ?? [];
    const yrs = t.map(x => [x.start, x.end === 'present' ? 'present' : x.end].filter(v => v != null).join('–')).filter(Boolean).join(' / ');
    return `overlapped at ${org}${yrs ? ` (${yrs})` : ''}`;
  },
  current_colleague: org => `are both currently at ${org}`,
  shared_employer: org => `both worked at ${org} — tenure dates are not available, so the overlap is unverified`,
  shared_board: org => `both sit on the ${org} board`,
  shared_university: org => `both attended ${org}`,
  existing_cyc_relationship: (_org, ev) => `are connected in CYC's own records${ev.connection_type ? ` (${ev.connection_type})` : ''}`,
};

const SOURCE_LABEL: Record<string, string> = {
  irs_990_xml: 'IRS filing', public_bio: 'public bio', linkedin_api: 'LinkedIn profile', cyc_site: "CYC's public board page",
  cyc_workbook: "CYC's cultivation sheet", seed: 'seed data', manual: 'manual entry',
};

/** Hedged, evidence-bound sentence for one path. Never asserts a personal relationship. */
export function describePath(p: Omit<WarmPath, 'wording' | 'strength' | 'confidence'>, sourceType: string | null): string {
  const rel = REL_PHRASE[p.edge.relationship_type]?.(p.sharedOrg, p.edge.evidence) ?? `share ${p.sharedOrg}`;
  const src = sourceType ? SOURCE_LABEL[sourceType] ?? sourceType : 'available records';
  const seat = p.trustee.title ? `${p.trustee.title} at` : 'on the board of';
  const inferred = p.edge.verification === 'inferred' ? ' This link is inferred, not documented.' : '';
  return `${p.cycPerson.name}${p.cycPerson.board_role ? ` (CYC ${p.cycPerson.board_role})` : ''} and ${p.trustee.name} ${rel}, per ${src}. ${p.trustee.name} is ${seat} ${p.foundation.name}. Potential warm introduction through ${p.cycPerson.name}; no personal relationship is asserted.${inferred}`;
}

export function pathStrength(edge: PathEdge, f: { peerEvents: number; onQueue: boolean; onCultivation: boolean; fundedCyc: boolean }): number {
  const base = edge.relationship_strength * Math.max(0.3, edge.confidence);
  const fit = Math.min(20, f.peerEvents * 3) + (f.onQueue ? 8 : 0) + (f.onCultivation ? 8 : 0) + (f.fundedCyc ? 5 : 0);
  return Math.round(Math.min(100, base * 2.4 + fit));
}

export function pathConfidence(edge: PathEdge): WarmPath['confidence'] {
  if (edge.verification === 'verified' && edge.confidence >= 0.75) return 'High';
  if (edge.verification === 'inferred' || edge.confidence < 0.5) return 'Low';
  return 'Medium';
}

export interface CrossrefReport { foundations: number; pathsFound: number; leads: number; insights: number; top: WarmPath[]; debug?: { trustees: number; own: number; edges: number } }

/** Compute, persist (idempotently) and return the warm paths for the ranked foundations. */
export async function computeWarmPaths(db: Db, orgId: string, foundations: FoundationRank[]): Promise<CrossrefReport> {
  const fById = new Map(foundations.map(f => [f.id, f]));
  // Trustees seated at the ranked foundations.
  const seatRows: Array<{ person_id: string; organization_id: string; title: string | null; network_people: unknown }> = [];
  const fIds = foundations.map(f => f.id);
  for (let i = 0; i < fIds.length; i += 100) {
    const { data: seats, error } = await db.from('network_boards')
      .select('person_id, organization_id, title, network_people!inner(id, name, kind, org_id, current_title)')
      .in('organization_id', fIds.slice(i, i + 100));
    if (error) throw new Error(`seats query: ${error.message}`);
    seatRows.push(...(seats ?? []));
  }
  const trusteeSeats = seatRows.map(s => ({ ...s, p: s.network_people as unknown as { id: string; name: string; kind: string; org_id: string; current_title: string | null } }))
    .filter(s => s.p.org_id === orgId && !OWN_KINDS.has(s.p.kind));
  const trusteeIds = [...new Set(trusteeSeats.map(s => s.p.id))];
  if (!trusteeIds.length) return { foundations: foundations.length, pathsFound: 0, leads: 0, insights: 0, top: [], debug: { trustees: 0, own: 0, edges: 0 } };

  // CYC's own people.
  const { data: own, error: ownErr } = await db.from('network_people').select('id, name, kind, board_role').eq('org_id', orgId);
  if (ownErr) throw new Error(`people query: ${ownErr.message}`);
  const ownById = new Map((own ?? []).filter(p => OWN_KINDS.has(p.kind as string)).map(p => [p.id as string, p]));

  // Person↔person edges touching a trustee and a CYC person.
  // Two short .in() queries per chunk instead of one long .or() URL, each
  // retried on transient network errors (these runs share the wire with the
  // ingester).
  const edgeMap = new Map<string, PathEdge & { source_person_id: string; target_person_id: string; source_type: string | null }>();
  const SEL = 'id, relationship_type, relationship_strength, confidence, verification, evidence, source_id, source_type, source_person_id, target_person_id, src:network_sources(source_type)';
  for (let i = 0; i < trusteeIds.length; i += 60) {
    const chunk = trusteeIds.slice(i, i + 60);
    for (const col of ['source_person_id', 'target_person_id'] as const) {
      const data = await withRetry(async () => {
        const { data, error } = await db.from('network_relationships').select(SEL)
          .eq('org_id', orgId).in('relationship_type', [...PATH_TYPES]).in(col, chunk);
        if (error) throw new Error(`edges query: ${error.message}`);
        return data ?? [];
      });
      for (const e of data) {
        const s = e.src as unknown as { source_type: string } | null;
        edgeMap.set(e.id as string, { id: e.id as string, relationship_type: e.relationship_type as string, relationship_strength: Number(e.relationship_strength), confidence: Number(e.confidence), verification: e.verification as string, evidence: (e.evidence ?? {}) as Record<string, unknown>, source_id: e.source_id as string | null, source_person_id: e.source_person_id as string, target_person_id: e.target_person_id as string, source_type: s?.source_type ?? null });
      }
    }
  }
  const edges = [...edgeMap.values()];

  const paths: WarmPath[] = [];
  for (const e of edges) {
    const a = e.source_person_id, b = e.target_person_id;
    const ownP = ownById.get(a) ?? ownById.get(b); if (!ownP) continue;
    const trusteeId = ownById.has(a) ? b : a;
    for (const s of trusteeSeats.filter(x => x.p.id === trusteeId)) {
      const f = fById.get(s.organization_id as string); if (!f) continue;
      const sharedOrg = String((e.evidence.summary as string | undefined)?.match(/ at (.+?)(?:\s*\(|$)| on the (.+?) board| attended (.+?)(?:\s+in|$)/)?.slice(1).find(Boolean) ?? e.evidence.school ?? e.evidence.via_org ?? 'a shared organization');
      const partial = { cycPerson: { id: ownP.id as string, name: ownP.name as string, kind: ownP.kind as string, board_role: ownP.board_role as string | null }, trustee: { id: s.p.id, name: s.p.name, title: s.title as string | null ?? s.p.current_title }, foundation: { id: f.id, name: f.name }, sharedOrg, edge: e };
      paths.push({ ...partial, strength: pathStrength(e, f), confidence: pathConfidence(e), wording: describePath(partial, e.source_type) });
    }
  }
  // One path per (foundation, trustee, CYC person) — a trustee seated twice
  // under two title spellings is still one path. Keep the strongest.
  const byKey = new Map<string, WarmPath>();
  for (const p of paths) {
    const key = `${p.foundation.id}|${p.trustee.id}|${p.cycPerson.id}`;
    const cur = byKey.get(key);
    if (!cur || p.strength > cur.strength) byKey.set(key, p);
  }
  paths.length = 0; paths.push(...byKey.values());
  paths.sort((x, y) => y.strength - x.strength);

  // Persist: one lead per path; insights regenerated wholesale.
  await db.from('network_insights').delete().eq('org_id', orgId).filter('evidence->>generator', 'eq', GENERATOR);
  let leads = 0, insights = 0;
  for (const p of paths) {
    const viaOrg = p.sharedOrg.slice(0, 120);
    const { data: existing } = await db.from('network_leads').select('id')
      .eq('org_id', orgId).eq('via_org', viaOrg).eq('person_id', p.trustee.id).eq('target_org_id', p.foundation.id).maybeSingle();
    const leadRow = {
      org_id: orgId, lead_type: 'organization', person_id: p.trustee.id, via_person_id: p.cycPerson.id, target_org_id: p.foundation.id,
      via_org: viaOrg, reason: p.wording, score: p.strength, evidence_confidence: p.confidence, insight_type: insightType(p.edge.relationship_type),
      score_breakdown: { generator: GENERATOR, edge_id: p.edge.id, relationship_type: p.edge.relationship_type, edge_strength: p.edge.relationship_strength, edge_confidence: p.edge.confidence, verification: p.edge.verification },
      updated_at: new Date().toISOString(),
    };
    let leadId = existing?.id as string | undefined;
    if (leadId) await db.from('network_leads').update(leadRow).eq('id', leadId);
    else { const { data: ins } = await db.from('network_leads').insert(leadRow).select('id').single(); leadId = ins?.id as string | undefined; }
    if (leadId) leads++;
    const { error } = await db.from('network_insights').insert({
      org_id: orgId, insight_type: insightType(p.edge.relationship_type),
      title: `${p.foundation.name}: potential introduction through ${p.cycPerson.name}`,
      summary: p.wording,
      path: [
        { kind: 'org', id: null, label: 'CYC' }, { kind: 'person', id: p.cycPerson.id, label: p.cycPerson.name },
        { kind: 'org', id: null, label: p.sharedOrg }, { kind: 'person', id: p.trustee.id, label: p.trustee.name },
        { kind: 'org', id: p.foundation.id, label: p.foundation.name },
      ],
      score: p.strength, confidence: p.confidence,
      evidence: { generator: GENERATOR, edge_id: p.edge.id, source_id: p.edge.source_id, verification: p.edge.verification },
      lead_id: leadId ?? null,
    });
    if (!error) insights++;
  }
  return { foundations: foundations.length, pathsFound: paths.length, leads, insights, top: paths.slice(0, 15), debug: { trustees: trusteeIds.length, own: ownById.size, edges: edges.length } };
}

function insightType(rel: string): string {
  if (rel === 'shared_board') return 'Shared Board';
  if (rel === 'shared_employer' || rel === 'current_colleague' || rel === 'former_colleague') return rel === 'shared_employer' ? 'Shared Employer' : 'Warm Introduction';
  if (rel === 'existing_cyc_relationship') return 'Warm Introduction';
  return 'High-Confidence Path';
}
