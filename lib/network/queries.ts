// Phase 8 — read models for the Connections console.
//
// Everything the UI shows comes through here, shaped for the screen rather
// than the tables: a lead row carries its target, path and one-line thesis; a
// graph payload is a focused neighbourhood, never the whole graph. All
// functions are org-scoped and read-only.

import { createServerClient } from '@/lib/supabase';
import { OWN_KINDS } from '@/lib/network/edges';
import { normalizeOrgName } from '@/lib/network/normalize';
import type { Explanation } from '@/lib/network/explain';

type Db = ReturnType<typeof createServerClient>;
const CYC_EIN = '362344429';

export const PIPELINE_STATES = ['NEW', 'RESEARCHING', 'INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'AWAITING_DECISION', 'WON', 'LOST', 'DEFERRED', 'NOT_A_FIT'] as const;
export type PipelineState = typeof PIPELINE_STATES[number];

const chunks = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const stripCites = (s: string) => s.replace(/\s*\[\s*E\d+(?:\s*,\s*E\d+)*\s*\]/g, '').replace(/\s+([.,;])/g, '$1').replace(/\s+/g, ' ').trim();
/** First sentence, without tripping on "Robert R. McCormick", "Inc." or "N.A.". */
const ABBREV = /(?:\b[A-Z]|\b(?:Inc|Jr|Sr|Dr|Mr|Mrs|Ms|St|Co|Corp|Ltd|No|vs|approx)|\bN\.A)$/;
const firstSentence = (s: string, max = 220) => {
  let end = s.length;
  for (const m of s.matchAll(/[.!?](?=\s|$)/g)) { const before = s.slice(0, m.index); if (ABBREV.test(before)) continue; end = m.index! + 1; break; }
  const t = s.slice(0, end).trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

// ── Leads ───────────────────────────────────────────────────────────────────
export interface PathNode { kind: 'org' | 'person'; id: string | null; label: string; sub?: string | null; own?: boolean }
export interface LeadRow {
  id: string; lead_type: string; insight_type: string | null; pipeline_status: PipelineState;
  score: number; confidence: 'Low' | 'Medium' | 'High' | null;
  subtotals: { relationship: number; funding_fit: number; accessibility: number; recency: number; penalties: number } | null;
  target: { id: string; name: string; type: string | null; city: string | null; state: string | null } | null;
  via: { id: string; name: string; role: string | null } | null;
  trustee: { id: string; name: string; title: string | null } | null;
  via_org: string | null;
  thesis: string; action: string | null;
  method: 'model' | 'deterministic' | null; claims: { kept: number; total: number } | null; evidence_count: number;
  owner: string | null; next_action: string | null; next_action_date: string | null; outcome: string | null; dismissal_reason: string | null;
  updated_at: string; path: PathNode[];
}

const LEAD_SELECT = 'id, lead_type, insight_type, pipeline_status, opportunity_score, evidence_confidence, score_breakdown, explanation, via_org, owner, next_action, next_action_date, outcome, dismissal_reason, updated_at, reason, target:network_organizations!network_leads_target_org_id_fkey(id, name, organization_type, city, state, website, metadata), via:network_people!network_leads_via_person_id_fkey(id, name, board_role, kind), person:network_people!network_leads_person_id_fkey(id, name, current_title, current_org, kind)';

type RawLead = Record<string, unknown> & {
  target: { id: string; name: string; organization_type: string | null; city: string | null; state: string | null; website?: string | null; metadata?: Record<string, unknown> | null } | null;
  via: { id: string; name: string; board_role: string | null; kind: string } | null;
  person: { id: string; name: string; current_title: string | null; current_org: string | null; kind: string } | null;
};

function shapeLead(l: RawLead): LeadRow {
  const x = (l.explanation ?? null) as Explanation | null;
  const bd = (l.score_breakdown ?? {}) as { subtotals?: LeadRow['subtotals'] };
  const trustee = l.lead_type === 'organization' && l.person && !OWN_KINDS.has(l.person.kind) ? { id: l.person.id, name: l.person.name, title: l.person.current_title } : null;
  const personLead = l.lead_type === 'person' && l.person ? { id: l.person.id, name: l.person.name, title: l.person.current_title } : null;
  const via = l.via ? { id: l.via.id, name: l.via.name, role: l.via.board_role } : null;
  const target = l.target ? { id: l.target.id, name: l.target.name, type: l.target.organization_type, city: l.target.city, state: l.target.state } : null;
  const thesis = x?.thesis ? firstSentence(stripCites(x.thesis)) : firstSentence(String(l.reason ?? ''));
  // The rail: CYC → via → shared org → trustee → target (warm path); CYC → via → target (corporate); target ← peers (white space).
  const path: PathNode[] = [];
  const viaOrg = (l.via_org as string | null) ?? null;
  if (l.insight_type === 'Untapped Funder') {
    if (target) path.push({ kind: 'org', id: target.id, label: target.name, sub: 'funds CYC peers' });
    path.push({ kind: 'org', id: null, label: 'CYC', own: true, sub: 'no funding identified' });
  } else if (personLead) {
    path.push({ kind: 'org', id: null, label: 'CYC', own: true });
    if (via) path.push({ kind: 'person', id: via.id, label: via.name, sub: via.role ?? 'CYC', own: true });
    if (viaOrg) path.push({ kind: 'org', id: target?.id ?? null, label: viaOrg, sub: 'shared employer' });
    path.push({ kind: 'person', id: personLead.id, label: personLead.name, sub: personLead.title });
  } else {
    path.push({ kind: 'org', id: null, label: 'CYC', own: true });
    if (via) path.push({ kind: 'person', id: via.id, label: via.name, sub: via.role ?? 'CYC', own: true });
    if (trustee && viaOrg && target && viaOrg !== target.name) path.push({ kind: 'org', id: null, label: viaOrg, sub: 'shared history' });
    if (trustee) path.push({ kind: 'person', id: trustee.id, label: trustee.name, sub: trustee.title });
    if (target) path.push({ kind: 'org', id: target.id, label: target.name, sub: target.type?.replace(/_/g, ' ') ?? null });
  }
  return {
    id: l.id as string, lead_type: l.lead_type as string, insight_type: (l.insight_type as string | null) ?? null, pipeline_status: (l.pipeline_status as PipelineState) ?? 'NEW',
    score: Math.round(Number(l.opportunity_score ?? 0)), confidence: (l.evidence_confidence as LeadRow['confidence']) ?? null,
    subtotals: bd.subtotals ?? null, target, via, trustee: trustee ?? personLead, via_org: viaOrg,
    thesis, action: x?.recommended_action?.text ?? null,
    method: x?.method ?? null, claims: x ? { kept: x.validation.bullets_kept, total: x.validation.bullets_total } : null, evidence_count: x?.sources?.length ?? 0,
    owner: (l.owner as string | null) ?? null, next_action: (l.next_action as string | null) ?? null, next_action_date: (l.next_action_date as string | null) ?? null,
    outcome: (l.outcome as string | null) ?? null, dismissal_reason: (l.dismissal_reason as string | null) ?? null,
    updated_at: String(l.updated_at ?? ''), path,
  };
}

export async function listLeads(db: Db, orgId: string): Promise<LeadRow[]> {
  const { data, error } = await db.from('network_leads').select(LEAD_SELECT).eq('org_id', orgId).order('opportunity_score', { ascending: false, nullsFirst: false }).limit(500);
  if (error) throw new Error(`leads: ${error.message}`);
  return ((data ?? []) as unknown as RawLead[]).map(shapeLead);
}

export interface LeadDetail extends LeadRow {
  explanation: Explanation | null;
  target_profile: { website: string | null; philanthropy: Record<string, unknown> | null } | null;
  actions: Array<{ id: string; action: string; status: string | null; notes: string | null; actor: string | null; created_at: string }>;
  insights: Array<{ id: string; insight_type: string; title: string; summary: string | null; score: number; confidence: string }>;
}

export async function getLeadDetail(db: Db, orgId: string, id: string): Promise<LeadDetail | null> {
  const { data, error } = await db.from('network_leads').select(LEAD_SELECT).eq('org_id', orgId).eq('id', id).maybeSingle();
  if (error) throw new Error(`lead: ${error.message}`);
  if (!data) return null;
  const raw = data as unknown as RawLead;
  const row = shapeLead(raw);
  const INS = 'id, insight_type, title, summary, score, confidence, lead_id';
  const [{ data: actions }, { data: byLead }, { data: byPath }] = await Promise.all([
    db.from('network_actions').select('id, action, status, notes, actor, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('network_insights').select(INS).eq('org_id', orgId).eq('lead_id', id).is('dismissed_at', null).order('score', { ascending: false }).limit(6),
    // jsonb containment: supabase-js serialises an array argument as a Postgres array literal, so pass the JSON text to `cs` directly.
    raw.target ? db.from('network_insights').select(INS).eq('org_id', orgId).filter('path', 'cs', JSON.stringify([{ id: raw.target.id }])).is('dismissed_at', null).order('score', { ascending: false }).limit(8) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  // Patterns that name this target, minus the one that IS this lead (its wording is already the thesis).
  const seen = new Set<string>();
  const insights = [...(byLead ?? []), ...(byPath ?? [])].filter(i => { const k = i.id as string; if (seen.has(k) || (i.lead_id === id && ['Warm Introduction', 'Shared Employer', 'Shared Board', 'High-Confidence Path', 'Corporate Giving Opportunity', 'Untapped Funder'].includes(i.insight_type as string))) return false; seen.add(k); return true; }).slice(0, 6);
  return {
    ...row,
    explanation: (raw.explanation ?? null) as Explanation | null,
    target_profile: raw.target ? { website: raw.target.website ?? null, philanthropy: (raw.target.metadata?.philanthropy as Record<string, unknown> | undefined) ?? null } : null,
    actions: (actions ?? []) as LeadDetail['actions'],
    insights: insights.map(i => ({ id: i.id as string, insight_type: i.insight_type as string, title: i.title as string, summary: (i.summary as string | null) ?? null, score: Number(i.score), confidence: i.confidence as string })),
  };
}

// ── Insights ────────────────────────────────────────────────────────────────
export interface InsightRow { id: string; insight_type: string; title: string; summary: string | null; score: number; confidence: string; lead_id: string | null; path: PathNode[]; generated_at: string }
export async function listInsights(db: Db, orgId: string): Promise<InsightRow[]> {
  const { data, error } = await db.from('network_insights').select('id, insight_type, title, summary, score, confidence, lead_id, path, generated_at').eq('org_id', orgId).is('dismissed_at', null).order('score', { ascending: false }).limit(60);
  if (error) throw new Error(`insights: ${error.message}`);
  return (data ?? []).map(i => ({ ...i, score: Number(i.score), path: (Array.isArray(i.path) ? i.path : []) as PathNode[] })) as InsightRow[];
}

// ── Organizations ───────────────────────────────────────────────────────────
export interface OrgRow {
  id: string; name: string; type: string | null; city: string | null; state: string | null; website: string | null;
  peer_events: number; funded_cyc: boolean; leads: number; top_score: number | null; top_lead_id: string | null; trustees: number; own_people: number; insight_types: string[];
}
export async function listOrganizations(db: Db, orgId: string): Promise<OrgRow[]> {
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', CYC_EIN).maybeSingle();
  const cycId = (cyc?.id as string | undefined) ?? null;
  const [{ data: leads }, { data: overlap }, { data: rel }, { data: fc }] = await Promise.all([
    db.from('network_leads').select('id, target_org_id, opportunity_score, insight_type').eq('org_id', orgId).not('target_org_id', 'is', null),
    db.from('network_relationships').select('source_organization_id, evidence').eq('org_id', orgId).eq('relationship_type', 'philanthropic_overlap'),
    cycId ? db.from('network_relationships').select('target_organization_id').eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_organization_id', cycId) : Promise.resolve({ data: [] as Array<{ target_organization_id: string }> }),
    db.from('network_relationships').select('source_organization_id, target_organization_id').eq('org_id', orgId).eq('relationship_type', 'foundation_connection').eq('source_type', 'corporate:v1'),
  ]);
  const agg = new Map<string, OrgRow>();
  const get = (id: string) => { let r = agg.get(id); if (!r) { r = { id, name: '', type: null, city: null, state: null, website: null, peer_events: 0, funded_cyc: false, leads: 0, top_score: null, top_lead_id: null, trustees: 0, own_people: 0, insight_types: [] }; agg.set(id, r); } return r; };
  for (const l of leads ?? []) { const r = get(l.target_org_id as string); r.leads++; const s = Number(l.opportunity_score ?? 0); if (r.top_score === null || s > r.top_score) { r.top_score = s; r.top_lead_id = l.id as string; } if (l.insight_type && !r.insight_types.includes(l.insight_type as string)) r.insight_types.push(l.insight_type as string); }
  for (const e of overlap ?? []) { const r = get(e.source_organization_id as string); r.peer_events += Number((e.evidence as { events?: number })?.events ?? 1); }
  for (const e of rel ?? []) get(e.target_organization_id as string).funded_cyc = true;
  for (const e of fc ?? []) { get(e.source_organization_id as string); get(e.target_organization_id as string); }
  if (cycId) agg.delete(cycId);
  const ids = [...agg.keys()];
  for (const c of chunks(ids, 200)) {
    const [{ data: orgs }, { data: seats }, { data: emps }] = await Promise.all([
      db.from('network_organizations').select('id, name, organization_type, city, state, website').in('id', c),
      db.from('network_boards').select('organization_id, person_id').in('organization_id', c),
      db.from('network_people').select('organization_id, kind').eq('org_id', orgId).in('organization_id', c),
    ]);
    for (const o of orgs ?? []) { const r = get(o.id as string); r.name = o.name as string; r.type = o.organization_type as string | null; r.city = o.city as string | null; r.state = o.state as string | null; r.website = o.website as string | null; }
    const seen = new Set<string>();
    for (const s of seats ?? []) { const k = `${s.organization_id}|${s.person_id}`; if (seen.has(k)) continue; seen.add(k); get(s.organization_id as string).trustees++; }
    for (const p of emps ?? []) if (OWN_KINDS.has(p.kind as string)) get(p.organization_id as string).own_people++;
  }
  return [...agg.values()].filter(r => r.name).sort((a, b) => (b.top_score ?? -1) - (a.top_score ?? -1) || b.peer_events - a.peer_events || a.name.localeCompare(b.name));
}

// ── Relationships ───────────────────────────────────────────────────────────
export interface EdgeRow {
  id: string; type: string; verification: 'verified' | 'probable' | 'inferred'; strength: number; confidence: number;
  a: { kind: 'person' | 'org'; id: string; name: string; own: boolean }; b: { kind: 'person' | 'org'; id: string; name: string; own: boolean };
  summary: string | null; source_type: string | null; source_url: string | null;
}
export async function listRelationships(db: Db, orgId: string, f: { type?: string | null; verification?: string | null; limit?: number } = {}): Promise<EdgeRow[]> {
  let q = db.from('network_relationships').select('id, relationship_type, verification, relationship_strength, confidence, evidence, source_person_id, target_person_id, source_organization_id, target_organization_id, src:network_sources(source_type, source_url)').eq('org_id', orgId).order('relationship_strength', { ascending: false }).limit(f.limit ?? 400);
  if (f.type) q = q.eq('relationship_type', f.type);
  if (f.verification) q = q.eq('verification', f.verification);
  const { data, error } = await q;
  if (error) throw new Error(`relationships: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { src: { source_type: string; source_url: string | null } | null }>;
  const pids = new Set<string>(), oids = new Set<string>();
  for (const r of rows) { for (const k of ['source_person_id', 'target_person_id']) if (r[k]) pids.add(r[k] as string); for (const k of ['source_organization_id', 'target_organization_id']) if (r[k]) oids.add(r[k] as string); }
  const people = new Map<string, { name: string; own: boolean }>(), orgs = new Map<string, string>();
  for (const c of chunks([...pids], 200)) { const { data } = await db.from('network_people').select('id, name, kind').in('id', c); for (const p of data ?? []) people.set(p.id as string, { name: p.name as string, own: OWN_KINDS.has(p.kind as string) }); }
  for (const c of chunks([...oids], 200)) { const { data } = await db.from('network_organizations').select('id, name, ein').in('id', c); for (const o of data ?? []) orgs.set(o.id as string, o.name as string); }
  const end = (pid: unknown, oid: unknown): EdgeRow['a'] | null => pid ? { kind: 'person', id: pid as string, name: people.get(pid as string)?.name ?? 'Unknown', own: people.get(pid as string)?.own ?? false } : oid ? { kind: 'org', id: oid as string, name: orgs.get(oid as string) ?? 'Unknown', own: false } : null;
  return rows.flatMap(r => {
    const a = end(r.source_person_id, r.source_organization_id), b = end(r.target_person_id, r.target_organization_id);
    if (!a || !b) return [];
    return [{ id: r.id as string, type: r.relationship_type as string, verification: r.verification as EdgeRow['verification'], strength: Number(r.relationship_strength), confidence: Number(r.confidence), a, b, summary: ((r.evidence as { summary?: string } | null)?.summary ?? null), source_type: r.src?.source_type ?? null, source_url: r.src?.source_url ?? null }];
  });
}

// ── Graph ───────────────────────────────────────────────────────────────────
export interface GraphNode { id: string; kind: 'person' | 'org'; label: string; sub: string | null; own: boolean; orgType: string | null; focus: boolean; lead_id: string | null; score: number | null; rowId: string | null }
export interface GraphLink { source: string; target: string; type: string; verification: 'verified' | 'probable' | 'inferred'; strength: number; label: string | null }
export interface GraphPayload { mode: 'overview' | 'focus'; focus: { kind: 'person' | 'org'; id: string; label: string } | null; nodes: GraphNode[]; links: GraphLink[] }

const nid = (kind: 'person' | 'org', id: string | null, label: string) => (id ? `${kind[0]}:${id}` : `l:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
const confToVer = (c: string | null | undefined): GraphLink['verification'] => (c === 'High' ? 'verified' : c === 'Low' ? 'inferred' : 'probable');

/** The default map: the paths behind the strongest leads, nothing else. */
export async function graphOverview(db: Db, orgId: string, topN = 24): Promise<GraphPayload> {
  const leads = (await listLeads(db, orgId)).filter(l => l.path.length >= 2).slice(0, topN);
  const nodes = new Map<string, GraphNode>(), links = new Map<string, GraphLink>();
  const leadByOrg = new Map<string, LeadRow>();
  for (const l of leads) if (l.target && !leadByOrg.has(l.target.id)) leadByOrg.set(l.target.id, l);
  const add = (p: PathNode, l: LeadRow) => {
    const id = nid(p.kind, p.id, p.label);
    const lead = p.kind === 'org' && p.id ? leadByOrg.get(p.id) ?? null : null;
    const cur = nodes.get(id);
    if (!cur) nodes.set(id, { id, kind: p.kind, label: p.label, sub: p.sub ?? null, own: !!p.own, orgType: p.kind === 'org' && l.target && p.id === l.target.id ? l.target.type : null, focus: p.label === 'CYC', lead_id: lead?.id ?? null, score: lead?.score ?? null, rowId: p.id });
    return id;
  };
  for (const l of leads) {
    for (let i = 0; i < l.path.length; i++) {
      const a = add(l.path[i], l);
      if (i === 0) continue;
      const b = add(l.path[i - 1], l);
      const key = [a, b].sort().join('|');
      const pa = l.path[i - 1], pb = l.path[i];
      const type = pa.kind === 'person' && pb.kind === 'person' ? 'relationship' : pa.kind === 'org' && pb.kind === 'org' ? (l.insight_type === 'Untapped Funder' ? 'white_space' : 'funding') : (pb.sub === 'shared history' || pa.sub === 'shared history' || pb.sub === 'shared employer' || pa.sub === 'shared employer') ? 'employment' : pb.own || pa.own ? 'membership' : 'seat';
      if (!links.has(key)) links.set(key, { source: b, target: a, type, verification: confToVer(l.confidence), strength: Math.max(20, l.score), label: null });
    }
  }
  return { mode: 'overview', focus: null, nodes: [...nodes.values()], links: [...links.values()] };
}

/** One node and everything it touches, plus the edges among those neighbours. */
export async function graphNeighborhood(db: Db, orgId: string, focus: { kind: 'person' | 'org'; id: string }, maxNodes = 60): Promise<GraphPayload> {
  const SEL = 'id, relationship_type, verification, relationship_strength, evidence, source_person_id, target_person_id, source_organization_id, target_organization_id';
  const col = focus.kind === 'person' ? ['source_person_id', 'target_person_id'] : ['source_organization_id', 'target_organization_id'];
  const [{ data: e1 }, { data: e2 }] = await Promise.all([
    db.from('network_relationships').select(SEL).eq('org_id', orgId).eq(col[0], focus.id).order('relationship_strength', { ascending: false }).limit(120),
    db.from('network_relationships').select(SEL).eq('org_id', orgId).eq(col[1], focus.id).order('relationship_strength', { ascending: false }).limit(120),
  ]);
  type E = { id: string; relationship_type: string; verification: GraphLink['verification']; relationship_strength: number; evidence: { summary?: string } | null; source_person_id: string | null; target_person_id: string | null; source_organization_id: string | null; target_organization_id: string | null };
  const edges = [...(e1 ?? []), ...(e2 ?? [])] as E[];
  // Structural links (seats, employments) so a person shows the rooms they were in and an org shows its people.
  const struct: Array<{ kind: 'person' | 'org'; id: string; type: string; label: string | null; current: boolean }> = [];
  if (focus.kind === 'person') {
    const [{ data: seats }, { data: emps }] = await Promise.all([
      db.from('network_boards').select('organization_id, title, is_current').eq('person_id', focus.id).limit(20),
      db.from('network_employments').select('organization_id, title, is_current').eq('person_id', focus.id).not('organization_id', 'is', null).limit(20),
    ]);
    for (const s of seats ?? []) struct.push({ kind: 'org', id: s.organization_id as string, type: 'seat', label: (s.title as string | null) ?? 'board', current: s.is_current !== false });
    for (const e of emps ?? []) struct.push({ kind: 'org', id: e.organization_id as string, type: 'employment', label: (e.title as string | null) ?? null, current: !!e.is_current });
  } else {
    const [{ data: seats }, { data: emps }] = await Promise.all([
      db.from('network_boards').select('person_id, title, is_current').eq('organization_id', focus.id).limit(30),
      db.from('network_employments').select('person_id, title, is_current').eq('organization_id', focus.id).limit(30),
    ]);
    for (const s of seats ?? []) struct.push({ kind: 'person', id: s.person_id as string, type: 'seat', label: (s.title as string | null) ?? 'board', current: s.is_current !== false });
    for (const e of emps ?? []) struct.push({ kind: 'person', id: e.person_id as string, type: 'employment', label: (e.title as string | null) ?? null, current: !!e.is_current });
  }
  // Collect neighbour ids, strongest first, capped.
  const neigh = new Map<string, { kind: 'person' | 'org'; id: string; w: number }>();
  const bump = (kind: 'person' | 'org', id: string, w: number) => { if (id === focus.id && kind === focus.kind) return; const k = `${kind}:${id}`; const c = neigh.get(k); if (!c || c.w < w) neigh.set(k, { kind, id, w }); };
  for (const e of edges) {
    for (const [k, v] of [['person', e.source_person_id], ['person', e.target_person_id], ['org', e.source_organization_id], ['org', e.target_organization_id]] as const) if (v) bump(k, v, Number(e.relationship_strength) || 1);
  }
  for (const s of struct) bump(s.kind, s.id, s.current ? 30 : 15);
  const chosen = [...neigh.values()].sort((a, b) => b.w - a.w).slice(0, maxNodes - 1);
  const pIds = [focus.kind === 'person' ? focus.id : null, ...chosen.filter(n => n.kind === 'person').map(n => n.id)].filter(Boolean) as string[];
  const oIds = [focus.kind === 'org' ? focus.id : null, ...chosen.filter(n => n.kind === 'org').map(n => n.id)].filter(Boolean) as string[];
  const people = new Map<string, { name: string; kind: string; title: string | null; org: string | null }>(), orgs = new Map<string, { name: string; type: string | null; city: string | null }>();
  for (const c of chunks(pIds, 200)) { const { data } = await db.from('network_people').select('id, name, kind, current_title, current_org').in('id', c); for (const p of data ?? []) people.set(p.id as string, { name: p.name as string, kind: p.kind as string, title: p.current_title as string | null, org: p.current_org as string | null }); }
  for (const c of chunks(oIds, 200)) { const { data } = await db.from('network_organizations').select('id, name, organization_type, city').in('id', c); for (const o of data ?? []) orgs.set(o.id as string, { name: o.name as string, type: o.organization_type as string | null, city: o.city as string | null }); }
  const { data: leadRows } = oIds.length ? await db.from('network_leads').select('id, target_org_id, opportunity_score').eq('org_id', orgId).in('target_org_id', oIds).order('opportunity_score', { ascending: false }) : { data: [] };
  const leadOf = new Map<string, { id: string; score: number }>();
  for (const l of leadRows ?? []) if (!leadOf.has(l.target_org_id as string)) leadOf.set(l.target_org_id as string, { id: l.id as string, score: Math.round(Number(l.opportunity_score ?? 0)) });

  const nodes = new Map<string, GraphNode>();
  const mk = (kind: 'person' | 'org', id: string, isFocus: boolean) => {
    const key = nid(kind, id, '');
    if (nodes.has(key)) return key;
    if (kind === 'person') { const p = people.get(id); if (!p) return null; nodes.set(key, { id: key, kind, label: p.name, sub: [p.title, p.org].filter(Boolean).join(', ') || (p.kind === 'trustee' ? 'trustee' : p.kind), own: OWN_KINDS.has(p.kind), orgType: null, focus: isFocus, lead_id: null, score: null, rowId: id }); }
    else { const o = orgs.get(id); if (!o) return null; const l = leadOf.get(id); nodes.set(key, { id: key, kind, label: o.name, sub: [o.type?.replace(/_/g, ' '), o.city].filter(Boolean).join(' · ') || null, own: false, orgType: o.type, focus: isFocus, lead_id: l?.id ?? null, score: l?.score ?? null, rowId: id }); }
    return key;
  };
  const focusKey = mk(focus.kind, focus.id, true);
  if (!focusKey) return { mode: 'focus', focus: null, nodes: [], links: [] };
  const chosenKeys = new Set<string>();
  for (const n of chosen) { const k = mk(n.kind, n.id, false); if (k) chosenKeys.add(k); }
  const links = new Map<string, GraphLink>();
  const link = (a: string, b: string, type: string, ver: GraphLink['verification'], strength: number, label: string | null) => { if (!nodes.has(a) || !nodes.has(b) || a === b) return; const key = [a, b].sort().join('|'); if (!links.has(key)) links.set(key, { source: a, target: b, type, verification: ver, strength, label }); };
  const endKey = (e: E, which: 'source' | 'target') => (e[`${which}_person_id`] ? nid('person', e[`${which}_person_id`], '') : e[`${which}_organization_id`] ? nid('org', e[`${which}_organization_id`], '') : null);
  for (const e of edges) { const a = endKey(e, 'source'), b = endKey(e, 'target'); if (a && b) link(a, b, e.relationship_type, e.verification, Number(e.relationship_strength) || 10, e.evidence?.summary ?? null); }
  for (const s of struct) link(focusKey, nid(s.kind, s.id, ''), s.type, 'verified', s.current ? 30 : 15, s.label);
  // Edges among the neighbours themselves (the triangles that make a path legible).
  const npIds = [...chosenKeys].filter(k => k.startsWith('p:')).map(k => k.slice(2));
  for (const c of chunks(npIds, 60)) {
    const { data } = await db.from('network_relationships').select(SEL).eq('org_id', orgId).in('source_person_id', c).limit(400);
    for (const e of (data ?? []) as E[]) {
      // Trustees of the focused organization all "share a board" with each other — that is the seat itself, already drawn. Skip the implied clique.
      if (focus.kind === 'org' && (e.relationship_type === 'shared_board' || e.relationship_type === 'current_colleague')) continue;
      const a = endKey(e, 'source'), b = endKey(e, 'target'); if (a && b && chosenKeys.has(a) && chosenKeys.has(b)) link(a, b, e.relationship_type, e.verification, Number(e.relationship_strength) || 10, e.evidence?.summary ?? null);
    }
  }
  const f = nodes.get(focusKey)!;
  return { mode: 'focus', focus: { kind: focus.kind, id: focus.id, label: f.label }, nodes: [...nodes.values()], links: [...links.values()] };
}

// ── People ──────────────────────────────────────────────────────────────────
export interface PersonRow {
  id: string; kind: string; name: string; board_role: string | null; title: string | null; org: string | null; org_id: string | null; location: string | null; headline: string | null;
  linkedin_url: string | null; enriched_at: string | null; verification: string | null; source_type: string | null;
  own: boolean; employers: number; boards: Array<{ id: string; name: string; title: string | null }>; paths: number; best_lead: { id: string; score: number; target: string } | null;
}
export async function listPeople(db: Db, orgId: string): Promise<PersonRow[]> {
  const people = await pageAllRows<{ id: string; kind: string; name: string; board_role: string | null; current_title: string | null; current_org: string | null; organization_id: string | null; location: string | null; headline: string | null; linkedin_url: string | null; enriched_at: string | null; verification: string | null; source_id: string | null }>(db, 'network_people', 'id, kind, name, board_role, current_title, current_org, organization_id, location, headline, linkedin_url, enriched_at, verification, source_id', orgId);
  const ids = people.map(p => p.id);
  const empCount = new Map<string, number>(), seats = new Map<string, Array<{ id: string; name: string; title: string | null }>>(), paths = new Map<string, number>(), best = new Map<string, { id: string; score: number; target: string }>();
  for (const c of chunks(ids, 150)) {
    const [{ data: emps }, { data: brd }] = await Promise.all([
      db.from('network_employments').select('person_id').in('person_id', c),
      db.from('network_boards').select('person_id, title, organization_id, org:network_organizations(id, name)').in('person_id', c),
    ]);
    for (const e of emps ?? []) empCount.set(e.person_id as string, (empCount.get(e.person_id as string) ?? 0) + 1);
    for (const s of (brd ?? []) as unknown as Array<{ person_id: string; title: string | null; org: { id: string; name: string } | null }>) { if (!s.org) continue; const a = seats.get(s.person_id) ?? []; if (!a.some(x => x.id === s.org!.id)) a.push({ id: s.org.id, name: s.org.name, title: s.title }); seats.set(s.person_id, a); }
  }
  const { data: leads } = await db.from('network_leads').select('id, via_person_id, person_id, opportunity_score, pipeline_status, target:network_organizations!network_leads_target_org_id_fkey(name)').eq('org_id', orgId).not('pipeline_status', 'in', '("NOT_A_FIT","LOST")');
  for (const l of (leads ?? []) as unknown as Array<{ id: string; via_person_id: string | null; person_id: string | null; opportunity_score: number | null; target: { name: string } | null }>) {
    for (const pid of [l.via_person_id, l.person_id]) {
      if (!pid) continue;
      paths.set(pid, (paths.get(pid) ?? 0) + 1);
      const s = Math.round(Number(l.opportunity_score ?? 0));
      if (!best.has(pid) || best.get(pid)!.score < s) best.set(pid, { id: l.id, score: s, target: l.target?.name ?? '' });
    }
  }
  const srcIds = [...new Set(people.map(p => p.source_id).filter(Boolean))] as string[];
  const srcType = new Map<string, string>();
  for (const c of chunks(srcIds, 200)) { const { data } = await db.from('network_sources').select('id, source_type').in('id', c); for (const s of data ?? []) srcType.set(s.id as string, s.source_type as string); }
  return people.map(p => ({
    id: p.id, kind: p.kind, name: p.name, board_role: p.board_role, title: p.current_title, org: p.current_org, org_id: p.organization_id, location: p.location, headline: p.headline,
    linkedin_url: p.linkedin_url, enriched_at: p.enriched_at, verification: p.verification, source_type: p.source_id ? srcType.get(p.source_id) ?? null : null,
    own: OWN_KINDS.has(p.kind), employers: empCount.get(p.id) ?? 0, boards: seats.get(p.id) ?? [], paths: paths.get(p.id) ?? 0, best_lead: best.get(p.id) ?? null,
  })).sort((a, b) => Number(b.own) - Number(a.own) || b.paths - a.paths || a.name.localeCompare(b.name));
}

async function pageAllRows<T>(db: Db, table: string, select: string, orgId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).eq('org_id', orgId).order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface PersonDetail extends PersonRow {
  summary: string | null; note: string | null; status: string | null;
  employments: Array<{ org_name: string; org_id: string | null; title: string | null; start_year: number | null; end_year: number | null; is_current: boolean; source_type: string | null; source_url: string | null }>;
  educations: Array<{ school: string; degree: string | null; field: string | null; start_year: number | null; end_year: number | null }>;
  seats: Array<{ org_id: string; org: string; title: string | null; is_current: boolean; source_type: string | null; source_url: string | null }>;
  leads: Array<{ id: string; role: 'via' | 'target'; target: string; score: number; confidence: string | null; insight_type: string | null; pipeline_status: string }>;
  links: Array<{ id: string; type: string; verification: string; other: { kind: 'person' | 'org'; id: string; name: string }; summary: string | null }>;
  sources: Array<{ source_type: string; source_url: string | null; name: string | null }>;
}
export async function getPersonDetail(db: Db, orgId: string, id: string): Promise<PersonDetail | null> {
  const rows = (await listPeople(db, orgId)).filter(p => p.id === id);
  const base = rows[0]; if (!base) return null;
  const { data: p } = await db.from('network_people').select('summary, note, status').eq('id', id).maybeSingle();
  const [{ data: emps }, { data: edus }, { data: seats }, { data: l1 }, { data: l2 }, { data: e1 }, { data: e2 }] = await Promise.all([
    db.from('network_employments').select('org_name, organization_id, title, start_year, end_year, is_current, src:network_sources(source_type, source_url)').eq('person_id', id).order('is_current', { ascending: false }).order('start_year', { ascending: false, nullsFirst: false }),
    db.from('network_educations').select('school_name, degree, field, start_year, end_year').eq('person_id', id),
    db.from('network_boards').select('organization_id, title, is_current, org:network_organizations(name), src:network_sources(source_type, source_url)').eq('person_id', id),
    db.from('network_leads').select('id, opportunity_score, evidence_confidence, insight_type, pipeline_status, target:network_organizations!network_leads_target_org_id_fkey(name)').eq('org_id', orgId).eq('via_person_id', id),
    db.from('network_leads').select('id, opportunity_score, evidence_confidence, insight_type, pipeline_status, target:network_organizations!network_leads_target_org_id_fkey(name)').eq('org_id', orgId).eq('person_id', id),
    db.from('network_relationships').select('id, relationship_type, verification, relationship_strength, evidence, source_person_id, target_person_id, source_organization_id, target_organization_id').eq('org_id', orgId).eq('source_person_id', id).order('relationship_strength', { ascending: false }).limit(40),
    db.from('network_relationships').select('id, relationship_type, verification, relationship_strength, evidence, source_person_id, target_person_id, source_organization_id, target_organization_id').eq('org_id', orgId).eq('target_person_id', id).order('relationship_strength', { ascending: false }).limit(40),
  ]);
  type Src = { source_type: string; source_url: string | null } | null;
  const edges = [...(e1 ?? []), ...(e2 ?? [])] as unknown as Array<{ id: string; relationship_type: string; verification: string; relationship_strength: number; evidence: { summary?: string } | null; source_person_id: string | null; target_person_id: string | null; source_organization_id: string | null; target_organization_id: string | null }>;
  const otherP = new Set<string>(), otherO = new Set<string>();
  for (const e of edges) { const pid = e.source_person_id === id ? e.target_person_id : e.source_person_id; if (pid) otherP.add(pid); else { const oid = e.source_person_id === id ? e.target_organization_id : e.source_organization_id; if (oid) otherO.add(oid); } }
  const pn = new Map<string, string>(), on = new Map<string, string>();
  for (const c of chunks([...otherP], 200)) { const { data } = await db.from('network_people').select('id, name').in('id', c); for (const x of data ?? []) pn.set(x.id as string, x.name as string); }
  for (const c of chunks([...otherO], 200)) { const { data } = await db.from('network_organizations').select('id, name').in('id', c); for (const x of data ?? []) on.set(x.id as string, x.name as string); }
  const links = edges.sort((a, b) => Number(b.relationship_strength) - Number(a.relationship_strength)).flatMap(e => {
    const pid = e.source_person_id === id ? e.target_person_id : e.source_person_id;
    const oid = e.source_person_id === id ? e.target_organization_id : e.source_organization_id;
    const other = pid && pn.has(pid) ? { kind: 'person' as const, id: pid, name: pn.get(pid)! } : oid && on.has(oid) ? { kind: 'org' as const, id: oid, name: on.get(oid)! } : null;
    return other ? [{ id: e.id, type: e.relationship_type, verification: e.verification, other, summary: e.evidence?.summary ?? null }] : [];
  }).slice(0, 40);
  const sources = new Map<string, { source_type: string; source_url: string | null; name: string | null }>();
  const addSrc = (s: Src, name: string | null = null) => { if (s?.source_type) sources.set(`${s.source_type}|${s.source_url ?? ''}`, { source_type: s.source_type, source_url: s.source_url, name }); };
  const leadRow = (role: 'via' | 'target') => (l: { id: string; opportunity_score: number | null; evidence_confidence: string | null; insight_type: string | null; pipeline_status: string; target: { name: string } | null }) => ({ id: l.id, role, target: l.target?.name ?? '', score: Math.round(Number(l.opportunity_score ?? 0)), confidence: l.evidence_confidence, insight_type: l.insight_type, pipeline_status: l.pipeline_status });
  const employments = ((emps ?? []) as unknown as Array<{ org_name: string; organization_id: string | null; title: string | null; start_year: number | null; end_year: number | null; is_current: boolean; src: Src }>).map(e => { addSrc(e.src, e.org_name); return { org_name: e.org_name, org_id: e.organization_id, title: e.title, start_year: e.start_year, end_year: e.end_year, is_current: !!e.is_current, source_type: e.src?.source_type ?? null, source_url: e.src?.source_url ?? null }; });
  const seatRows = ((seats ?? []) as unknown as Array<{ organization_id: string; title: string | null; is_current: boolean | null; org: { name: string } | null; src: Src }>).map(s => { addSrc(s.src, s.org?.name ?? null); return { org_id: s.organization_id, org: s.org?.name ?? 'Organization', title: s.title, is_current: s.is_current !== false, source_type: s.src?.source_type ?? null, source_url: s.src?.source_url ?? null }; });
  if (base.source_type) sources.set(`${base.source_type}|`, { source_type: base.source_type, source_url: null, name: 'profile' });
  return {
    ...base, summary: (p?.summary as string | null) ?? null, note: (p?.note as string | null) ?? null, status: (p?.status as string | null) ?? null,
    employments, educations: (edus ?? []).map(e => ({ school: e.school_name as string, degree: e.degree as string | null, field: e.field as string | null, start_year: e.start_year as number | null, end_year: e.end_year as number | null })),
    seats: seatRows,
    leads: [...((l1 ?? []) as unknown as Parameters<ReturnType<typeof leadRow>>[0][]).map(leadRow('via')), ...((l2 ?? []) as unknown as Parameters<ReturnType<typeof leadRow>>[0][]).map(leadRow('target'))].sort((a, b) => b.score - a.score),
    links, sources: [...sources.values()],
  };
}

/** Resolve a free-text name to a node the map can focus on. */
export async function findNode(db: Db, orgId: string, q: string): Promise<{ kind: 'person' | 'org'; id: string; label: string } | null> {
  const t = q.trim().replace(/[%_,]/g, ' ').trim(); if (!t) return null;
  const [{ data: p }, { data: o }] = await Promise.all([
    db.from('network_people').select('id, name, kind').eq('org_id', orgId).ilike('name', `%${t}%`).limit(8),
    db.from('network_organizations').select('id, name, normalized_name').or(`normalized_name.ilike.%${normalizeOrgName(t)}%,name.ilike.%${t}%`).limit(8),
  ]);
  const oIds = (o ?? []).map(x => x.id as string);
  const { data: withLead } = oIds.length ? await db.from('network_leads').select('target_org_id').eq('org_id', orgId).in('target_org_id', oIds) : { data: [] };
  const leadOrg = new Set((withLead ?? []).map(l => l.target_org_id as string));
  const tl = t.toLowerCase();
  // Rank: an organization CYC has a lead on beats a namesake person; a name that starts with the query beats one that merely contains it.
  const cands = [
    ...(o ?? []).map(x => ({ kind: 'org' as const, id: x.id as string, label: x.name as string, score: (leadOrg.has(x.id as string) ? 4 : 1) + ((x.name as string).toLowerCase().startsWith(tl) || (x.normalized_name as string).startsWith(normalizeOrgName(t)) ? 2 : 0) })),
    ...(p ?? []).map(x => ({ kind: 'person' as const, id: x.id as string, label: x.name as string, score: (OWN_KINDS.has(x.kind as string) ? 3 : x.kind === 'trustee' ? 2 : 1) + ((x.name as string).toLowerCase().startsWith(tl) ? 2 : 0) })),
  ].sort((a, b) => b.score - a.score || a.label.length - b.label.length);
  return cands[0] ? { kind: cands[0].kind, id: cands[0].id, label: cands[0].label } : null;
}
