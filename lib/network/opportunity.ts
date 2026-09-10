// Phase 6 — gather the signals behind every lead, score them with the
// deterministic rubric, and generate the white-space "Untapped Funder" leads.
//
// This is the single place that turns graph facts into numbers on
// network_leads: crossref (warm paths), corporate and the employer scans all
// create leads; this module re-scores every one of them the same way so a
// warm path, a corporate lead and a research lead are comparable.

import { createServerClient } from '@/lib/supabase';
import { OWN_KINDS } from '@/lib/network/edges';
import { normalizeOrgName } from '@/lib/network/normalize';
import {
  scoreLead, describeUntapped, PROGRAM_TERMS, POPULATION_TERMS, CHICAGO_TERMS, PROGRAM_OFFICER_TITLES,
  type LeadSignals, type RelationshipSignal, type FundingSignal, type AccessSignal, type ScoreResult, type Verification,
} from '@/lib/network/scoring';

type Db = ReturnType<typeof createServerClient>;
const UNTAPPED = 'untapped:v1';
const CYC_EIN = '362344429';

async function withRetry<T>(fn: () => PromiseLike<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (!/fetch failed|ECONNRESET|ETIMEDOUT|socket|timeout/i.test(String(e))) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
  throw last;
}

/** Paginate an ordered query — PostgREST caps unbounded selects at 1,000 rows. */
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await withRetry(() => Promise.resolve(build(from, from + size - 1)));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

const chunks = <T,>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

interface GrantRow { id: string; funder_org_id: string; recipient_org_id: string | null; fiscal_year: number | null; amount: number | null; purpose: string | null; geography: string | null; source_id: string | null; source_url: string | null; confidence: number | null }
interface OrgRow { id: string; name: string; organization_type: string | null; city: string | null; state: string | null; website: string | null; metadata: Record<string, unknown> | null }
interface EdgeRow { id: string; relationship_type: string; verification: Verification; confidence: number; source_id: string | null; source_person_id: string | null; target_person_id: string | null; source_organization_id: string | null; target_organization_id: string | null; evidence: Record<string, unknown> | null }

export interface TargetContext {
  org: OrgRow;
  foundationId: string | null;                 // for a corporation: its foundation (funding counts under the company)
  grants: GrantRow[];                          // grants by the target (and its foundation)
  peopleIds: Set<string>;                      // trustees / employees of the target in the graph
  seatTitles: string[];
  edges: EdgeRow[];                            // person↔person edges between CYC's people and the target's people, plus org-level CYC↔target edges
  currentPersonIds: Set<string>;               // target people with a current tie to a CYC person's employer
  ownTies: Array<{ personId: string; current: boolean; sourceId: string | null }>; // CYC's own people employed at the target (a corporate lead's whole case)
}

export interface SignalContext {
  cycOrgId: string | null;
  ownIds: Set<string>;
  ownNames: Map<string, string>;
  peerSim: Map<string, number>;
  peerNames: Map<string, string>;
  sourceTypes: Map<string, string>;            // source_id → source_type
  targets: Map<string, TargetContext>;
  asOfYear: number;
}

/** Load everything the scorer needs for a set of target organizations, in bulk. */
export async function loadSignalContext(db: Db, orgId: string, targetIds: string[]): Promise<SignalContext> {
  const ids = [...new Set(targetIds)];
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', CYC_EIN).maybeSingle();
  const cycOrgId = (cyc?.id as string | undefined) ?? null;

  const { data: own } = await withRetry(() => db.from('network_people').select('id, name, kind, organization_id, source_id').eq('org_id', orgId));
  const ownRows = (own ?? []).filter(p => OWN_KINDS.has(p.kind as string));
  const ownIds = new Set(ownRows.map(p => p.id as string));
  const ownNames = new Map(ownRows.map(p => [p.id as string, p.name as string]));

  const peers = await pageAll<{ organization_id: string; similarity: number }>((a, b) => db.from('network_peer_orgs').select('organization_id, similarity').eq('org_id', orgId).order('id').range(a, b));
  const peerSim = new Map(peers.map(p => [p.organization_id, Number(p.similarity)]));

  // Corporations count their foundation's grants.
  const foundationOf = new Map<string, string>();
  for (const c of chunks(ids, 200)) {
    const { data } = await withRetry(() => db.from('network_relationships').select('source_organization_id, target_organization_id').eq('org_id', orgId).eq('relationship_type', 'foundation_connection').in('source_organization_id', c));
    for (const e of data ?? []) if (e.source_organization_id && e.target_organization_id) foundationOf.set(e.source_organization_id as string, e.target_organization_id as string);
  }
  const funderIds = [...new Set([...ids, ...foundationOf.values()])];

  const orgs = new Map<string, OrgRow>();
  for (const c of chunks(funderIds, 200)) {
    const { data } = await withRetry(() => db.from('network_organizations').select('id, name, organization_type, city, state, website, metadata').in('id', c));
    for (const o of data ?? []) orgs.set(o.id as string, o as unknown as OrgRow);
  }

  const grantsByFunder = new Map<string, GrantRow[]>();
  for (const c of chunks(funderIds, 100)) {
    const rows = await pageAll<GrantRow>((a, b) => db.from('grants_made').select('id, funder_org_id, recipient_org_id, fiscal_year, amount, purpose, geography, source_id, source_url, confidence').in('funder_org_id', c).order('id').range(a, b));
    for (const g of rows) { const arr = grantsByFunder.get(g.funder_org_id) ?? []; arr.push(g); grantsByFunder.set(g.funder_org_id, arr); }
  }
  const recipientIds = [...new Set([...grantsByFunder.values()].flat().map(g => g.recipient_org_id).filter(Boolean) as string[])].filter(r => peerSim.has(r));
  const peerNames = new Map<string, string>();
  for (const c of chunks(recipientIds, 200)) {
    const { data } = await withRetry(() => db.from('network_organizations').select('id, name').in('id', c));
    for (const o of data ?? []) peerNames.set(o.id as string, o.name as string);
  }

  // People attached to each target: board seats + employments + "current org".
  const peopleOf = new Map<string, Set<string>>();
  const seatTitles = new Map<string, string[]>();
  const currentOf = new Map<string, Set<string>>();
  const ownTiesOf = new Map<string, Array<{ personId: string; current: boolean; sourceId: string | null }>>();
  const add = (t: string, p: string) => { const s = peopleOf.get(t) ?? new Set<string>(); s.add(p); peopleOf.set(t, s); };
  const tie = (t: string, personId: string, current: boolean, sourceId: string | null) => { const arr = ownTiesOf.get(t) ?? []; arr.push({ personId, current, sourceId }); ownTiesOf.set(t, arr); };
  const idSet = new Set(ids);
  for (const p of ownRows) if (p.organization_id && idSet.has(p.organization_id as string)) tie(p.organization_id as string, p.id as string, true, (p.source_id as string | null) ?? null);
  for (const c of chunks(ids, 100)) {
    const seats = await pageAll<{ person_id: string; organization_id: string; title: string | null; is_current: boolean | null }>((a, b) => db.from('network_boards').select('person_id, organization_id, title, is_current').in('organization_id', c).order('id').range(a, b));
    for (const s of seats) { if (ownIds.has(s.person_id)) continue; add(s.organization_id, s.person_id); if (s.title) { const t = seatTitles.get(s.organization_id) ?? []; t.push(s.title); seatTitles.set(s.organization_id, t); } }
    const emps = await pageAll<{ person_id: string; organization_id: string; is_current: boolean | null; source_id: string | null }>((a, b) => db.from('network_employments').select('person_id, organization_id, is_current, source_id').in('organization_id', c).order('id').range(a, b));
    for (const e of emps) {
      if (ownIds.has(e.person_id)) { tie(e.organization_id, e.person_id, !!e.is_current, e.source_id); continue; }
      add(e.organization_id, e.person_id); if (e.is_current) { const s = currentOf.get(e.organization_id) ?? new Set<string>(); s.add(e.person_id); currentOf.set(e.organization_id, s); }
    }
    const { data: ppl } = await withRetry(() => db.from('network_people').select('id, organization_id, kind').eq('org_id', orgId).in('organization_id', c));
    for (const p of ppl ?? []) if (!OWN_KINDS.has(p.kind as string) && p.organization_id) add(p.organization_id as string, p.id as string);
  }

  // Person↔person edges that touch one of CYC's own people, in two indexed passes.
  const ownList = [...ownIds];
  const edgeMap = new Map<string, EdgeRow>();
  const SEL = 'id, relationship_type, verification, confidence, source_id, source_person_id, target_person_id, source_organization_id, target_organization_id, evidence';
  for (const c of chunks(ownList, 60)) {
    for (const col of ['source_person_id', 'target_person_id'] as const) {
      const rows = await pageAll<EdgeRow>((a, b) => db.from('network_relationships').select(SEL).eq('org_id', orgId).in(col, c).order('id').range(a, b));
      for (const e of rows) edgeMap.set(e.id, e);
    }
  }
  // Org-level edges from CYC's node to the targets.
  if (cycOrgId) {
    for (const c of chunks(funderIds, 200)) {
      const { data } = await withRetry(() => db.from('network_relationships').select(SEL).eq('org_id', orgId).eq('source_organization_id', cycOrgId).in('target_organization_id', c));
      for (const e of (data ?? []) as unknown as EdgeRow[]) edgeMap.set(e.id, e);
      const { data: rev } = await withRetry(() => db.from('network_relationships').select(SEL).eq('org_id', orgId).eq('target_organization_id', cycOrgId).in('source_organization_id', c));
      for (const e of (rev ?? []) as unknown as EdgeRow[]) edgeMap.set(e.id, e);
    }
  }
  const edges = [...edgeMap.values()];

  const sourceIds = new Set<string>();
  for (const e of edges) if (e.source_id) sourceIds.add(e.source_id);
  for (const gs of grantsByFunder.values()) for (const g of gs) if (g.source_id) sourceIds.add(g.source_id);
  const sourceTypes = new Map<string, string>();
  for (const c of chunks([...sourceIds], 200)) {
    const { data } = await withRetry(() => db.from('network_sources').select('id, source_type').in('id', c));
    for (const s of data ?? []) sourceTypes.set(s.id as string, s.source_type as string);
  }

  const targets = new Map<string, TargetContext>();
  for (const id of ids) {
    const org = orgs.get(id); if (!org) continue;
    const fId = foundationOf.get(id) ?? null;
    const people = new Set<string>([...(peopleOf.get(id) ?? []), ...(fId ? peopleOf.get(fId) ?? [] : [])]);
    const orgEdges = edges.filter(e => {
      if (e.source_person_id && e.target_person_id) {
        const other = ownIds.has(e.source_person_id) ? e.target_person_id : ownIds.has(e.target_person_id) ? e.source_person_id : null;
        return !!other && people.has(other);
      }
      const o = [e.source_organization_id, e.target_organization_id];
      return o.includes(id) || (!!fId && o.includes(fId));
    });
    targets.set(id, {
      org, foundationId: fId,
      grants: [...(grantsByFunder.get(id) ?? []), ...(fId ? grantsByFunder.get(fId) ?? [] : [])],
      peopleIds: people, seatTitles: [...(seatTitles.get(id) ?? []), ...(fId ? seatTitles.get(fId) ?? [] : [])],
      edges: orgEdges, currentPersonIds: new Set([...(currentOf.get(id) ?? []), ...(fId ? currentOf.get(fId) ?? [] : [])]),
      ownTies: ownTiesOf.get(id) ?? [],
    });
  }
  return { cycOrgId, ownIds, ownNames, peerSim, peerNames, sourceTypes, targets, asOfYear: new Date().getFullYear() };
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function fundingSignal(ctx: SignalContext, t: TargetContext): FundingSignal {
  const peerGrants = t.grants.filter(g => g.recipient_org_id && ctx.peerSim.has(g.recipient_org_id));
  const recipients = [...new Set(peerGrants.map(g => g.recipient_org_id as string))];
  const sims = recipients.map(r => ctx.peerSim.get(r) ?? 0);
  const chicago = peerGrants.filter(g => (g.geography && CHICAGO_TERMS.test(g.geography)) || (g.purpose && /chicago/i.test(g.purpose))).length;
  const years = peerGrants.map(g => g.fiscal_year).filter((y): y is number => typeof y === 'number');
  const amounts = peerGrants.map(g => Number(g.amount)).filter(a => Number.isFinite(a) && a > 0);
  return {
    peerGrants: peerGrants.length, peerRecipients: recipients.length,
    avgSimilarity: sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0,
    chicagoShare: peerGrants.length ? chicago / peerGrants.length : 0,
    programHits: peerGrants.filter(g => g.purpose && PROGRAM_TERMS.test(g.purpose)).length,
    populationHits: peerGrants.filter(g => g.purpose && POPULATION_TERMS.test(g.purpose)).length,
    latestYear: years.length ? Math.max(...years) : null,
    medianAmount: median(amounts),
    fundedCyc: !!ctx.cycOrgId && t.grants.some(g => g.recipient_org_id === ctx.cycOrgId),
    cited: peerGrants.some(g => !!g.source_url || (g.source_id !== null && ctx.sourceTypes.get(g.source_id) !== 'seed')),
    evidenceIds: peerGrants.map(g => g.id),
  };
}

export function accessSignal(t: TargetContext): AccessSignal {
  const phil = (t.org.metadata?.philanthropy ?? null) as { contact?: string | null; application_path?: string | null; leadership?: unknown[] } | null;
  return {
    programOfficer: t.seatTitles.some(x => PROGRAM_OFFICER_TITLES.test(x)),
    localPresence: (t.org.state ?? '').toUpperCase() === 'IL' || /chicago/i.test(t.org.city ?? ''),
    publicContact: !!(phil?.contact || phil?.application_path),
    corporateLeadership: Array.isArray(phil?.leadership) && phil!.leadership!.length > 0,
  };
}

/** Relationship signals for a target, optionally narrowed to one trustee (a specific warm path). */
export function relationshipSignals(ctx: SignalContext, t: TargetContext, personId: string | null): RelationshipSignal[] {
  const out: RelationshipSignal[] = [];
  for (const e of t.edges) {
    if (e.source_person_id && e.target_person_id) {
      const other = ctx.ownIds.has(e.source_person_id) ? e.target_person_id : e.source_person_id;
      if (personId && other !== personId) continue;
      const own = ctx.ownIds.has(e.source_person_id) ? e.source_person_id : e.target_person_id;
      out.push({ type: e.relationship_type, verification: e.verification, confidence: Number(e.confidence), current: e.relationship_type === 'current_colleague' || t.currentPersonIds.has(other), edge_id: e.id, source_id: e.source_id, label: `${ctx.ownNames.get(own) ?? 'CYC person'} ↔ ${String(e.evidence?.summary ?? e.relationship_type)}` });
    } else if (['existing_cyc_relationship', 'geographic_overlap'].includes(e.relationship_type)) {
      out.push({ type: e.relationship_type, verification: e.verification, confidence: Number(e.confidence), current: e.relationship_type === 'existing_cyc_relationship', edge_id: e.id, source_id: e.source_id });
    }
  }
  // A CYC person employed at the target is itself a tie (the corporate lead's
  // whole case). One per person; a current role beats a former one.
  if (!personId) {
    const best = new Map<string, { current: boolean; sourceId: string | null }>();
    for (const t2 of t.ownTies) { const cur = best.get(t2.personId); if (!cur || (t2.current && !cur.current)) best.set(t2.personId, { current: t2.current, sourceId: t2.sourceId }); }
    for (const [pid, v] of best) out.push({ type: 'corporate_connection', verification: v.sourceId ? 'verified' : 'probable', confidence: 0.8, current: v.current, source_id: v.sourceId, label: `${ctx.ownNames.get(pid) ?? 'CYC person'} ${v.current ? 'works' : 'worked'} at ${t.org.name}` });
  }
  return out;
}

export function signalsFor(ctx: SignalContext, t: TargetContext, personId: string | null): LeadSignals {
  const relationships = relationshipSignals(ctx, t, personId);
  const funding = fundingSignal(ctx, t);
  const types = new Set<string>();
  for (const r of relationships) if (r.source_id && ctx.sourceTypes.get(r.source_id)) types.add(ctx.sourceTypes.get(r.source_id)!);
  for (const g of t.grants) if (g.source_id && ctx.sourceTypes.get(g.source_id)) types.add(ctx.sourceTypes.get(g.source_id)!);
  return { relationships, funding, access: accessSignal(t), sourceTypes: [...types], asOfYear: ctx.asOfYear };
}

// ── Re-score every lead the same way ────────────────────────────────────────
export interface AuditRow { id: string; lead_type: string; insight_type: string | null; target: string; via: string | null; score: number; confidence: string; before: number | null; subtotals: ScoreResult['breakdown']['subtotals']; reasons: string[] }

export async function rescoreLeads(db: Db, orgId: string): Promise<{ scored: number; skipped: number; audit: AuditRow[] }> {
  const leads = await pageAll<{ id: string; lead_type: string; person_id: string | null; via_person_id: string | null; via_org: string | null; target_org_id: string | null; score: number | null; insight_type: string | null; score_breakdown: Record<string, unknown> | null; pipeline_status: string }>((a, b) => db.from('network_leads').select('id, lead_type, person_id, via_person_id, via_org, target_org_id, score, insight_type, score_breakdown, pipeline_status').eq('org_id', orgId).order('id').range(a, b));

  // Person leads (employer scans) target the employer named in via_org — resolve it to its org node.
  const viaNames = [...new Set(leads.filter(l => !l.target_org_id && l.via_org).map(l => normalizeOrgName(l.via_org as string)))];
  const viaOrgId = new Map<string, string>();
  for (const c of chunks(viaNames, 100)) {
    const { data } = await withRetry(() => db.from('network_organizations').select('id, normalized_name').in('normalized_name', c));
    for (const o of data ?? []) viaOrgId.set(o.normalized_name as string, o.id as string);
  }
  const targetOf = (l: typeof leads[number]) => l.target_org_id ?? (l.via_org ? viaOrgId.get(normalizeOrgName(l.via_org)) ?? null : null);
  const ctx = await loadSignalContext(db, orgId, leads.map(targetOf).filter(Boolean) as string[]);

  let scored = 0, skipped = 0;
  const audit: AuditRow[] = [];
  const { data: viaPeople } = await withRetry(() => db.from('network_people').select('id, name').in('id', [...new Set(leads.map(l => l.via_person_id).filter(Boolean))] as string[]));
  const viaName = new Map((viaPeople ?? []).map(p => [p.id as string, p.name as string]));
  for (const l of leads) {
    const tId = targetOf(l);
    const t = tId ? ctx.targets.get(tId) : undefined;
    if (!t) { skipped++; continue; }
    // A warm-path lead is scored on ITS trustee's ties; org-level leads on every tie to the target.
    const s = signalsFor(ctx, t, l.lead_type === 'organization' && l.person_id ? l.person_id : null);
    const r = scoreLead(s);
    const origin = (l.score_breakdown && (l.score_breakdown as { generator?: string }).generator !== 'scoring:v1') ? l.score_breakdown : (l.score_breakdown as { origin?: unknown } | null)?.origin ?? null;
    const { error } = await withRetry(() => db.from('network_leads').update({
      opportunity_score: r.opportunity_score, evidence_confidence: r.evidence_confidence, score: r.opportunity_score,
      score_breakdown: { ...r.breakdown, origin, target_org_id: tId }, updated_at: new Date().toISOString(),
    }).eq('id', l.id));
    if (error) { skipped++; continue; }
    await db.from('network_insights').update({ score: r.opportunity_score, confidence: r.evidence_confidence }).eq('lead_id', l.id);
    scored++;
    audit.push({ id: l.id, lead_type: l.lead_type, insight_type: l.insight_type, target: t.org.name, via: l.via_person_id ? viaName.get(l.via_person_id) ?? null : null, score: r.opportunity_score, confidence: r.evidence_confidence, before: l.score === null ? null : Number(l.score), subtotals: r.breakdown.subtotals, reasons: r.breakdown.confidence_reasons });
  }
  audit.sort((a, b) => b.score - a.score);
  return { scored, skipped, audit };
}

// ── White space: who funds CYC's peers but not CYC? ─────────────────────────
export interface UntappedReport { candidates: number; leads: number; insights: number; top: Array<{ funder: string; peers: number; grants: number; wording: string }> }

export async function generateUntappedFunders(db: Db, orgId: string, opts: { minPeers?: number; lookbackYears?: number } = {}): Promise<UntappedReport> {
  const minPeers = opts.minPeers ?? 2, lookback = opts.lookbackYears ?? 4;
  const asOf = new Date().getFullYear();
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', CYC_EIN).maybeSingle();
  const cycId = (cyc?.id as string | undefined) ?? null;

  const peers = await pageAll<{ organization_id: string; similarity: number }>((a, b) => db.from('network_peer_orgs').select('organization_id, similarity').eq('org_id', orgId).order('id').range(a, b));
  const peerSim = new Map(peers.map(p => [p.organization_id, Number(p.similarity)]));

  // Grants to peers, recent years only.
  const byFunder = new Map<string, GrantRow[]>();
  for (const c of chunks([...peerSim.keys()], 100)) {
    const rows = await pageAll<GrantRow>((a, b) => db.from('grants_made').select('id, funder_org_id, recipient_org_id, fiscal_year, amount, purpose, geography, source_id, source_url, confidence').in('recipient_org_id', c).gte('fiscal_year', asOf - lookback).not('funder_org_id', 'is', null).order('id').range(a, b));
    for (const g of rows) { const arr = byFunder.get(g.funder_org_id) ?? []; arr.push(g); byFunder.set(g.funder_org_id, arr); }
  }
  // Funders with any event to CYC, or a recorded CYC relationship, are not white space.
  const excluded = new Set<string>();
  if (cycId) {
    const toCyc = await pageAll<{ funder_org_id: string }>((a, b) => db.from('grants_made').select('funder_org_id').eq('recipient_org_id', cycId).order('id').range(a, b));
    for (const g of toCyc) excluded.add(g.funder_org_id);
    const { data: rel } = await withRetry(() => db.from('network_relationships').select('target_organization_id').eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_organization_id', cycId));
    for (const e of rel ?? []) if (e.target_organization_id) excluded.add(e.target_organization_id as string);
    excluded.add(cycId);
  }
  const candidates = [...byFunder.entries()]
    .filter(([f, gs]) => !excluded.has(f) && new Set(gs.map(g => g.recipient_org_id)).size >= minPeers)
    .map(([f, gs]) => ({ id: f, grants: gs }));
  if (!candidates.length) { await db.from('network_insights').delete().eq('org_id', orgId).filter('evidence->>generator', 'eq', UNTAPPED); return { candidates: 0, leads: 0, insights: 0, top: [] }; }

  const ids = candidates.map(c => c.id);
  const names = new Map<string, string>();
  for (const c of chunks([...new Set([...ids, ...candidates.flatMap(x => x.grants.map(g => g.recipient_org_id as string))])], 200)) {
    const { data } = await withRetry(() => db.from('network_organizations').select('id, name').in('id', c));
    for (const o of data ?? []) names.set(o.id as string, o.name as string);
  }
  // A warm path already found by crossref for this funder becomes the "potential path".
  const { data: pathLeads } = await withRetry(() => db.from('network_leads').select('target_org_id, via_person_id, evidence_confidence, network_people!network_leads_via_person_id_fkey(name)').eq('org_id', orgId).in('target_org_id', ids).not('via_person_id', 'is', null));
  const pathFor = new Map<string, string>();
  for (const l of (pathLeads ?? []) as unknown as Array<{ target_org_id: string; evidence_confidence: string | null; network_people: { name: string } | null }>) {
    if (!l.network_people?.name || pathFor.has(l.target_org_id)) continue;
    pathFor.set(l.target_org_id, `an introduction through ${l.network_people.name} (${(l.evidence_confidence ?? 'Medium').toLowerCase()}-confidence warm path on record)`);
  }

  await db.from('network_insights').delete().eq('org_id', orgId).filter('evidence->>generator', 'eq', UNTAPPED);
  let leads = 0, insights = 0;
  const top: UntappedReport['top'] = [];
  for (const c of candidates) {
    const recips = [...new Set(c.grants.map(g => g.recipient_org_id as string))].sort((a, b) => (peerSim.get(b) ?? 0) - (peerSim.get(a) ?? 0));
    const years = c.grants.map(g => g.fiscal_year).filter((y): y is number => typeof y === 'number');
    const latestYear = Math.max(...years), firstYear = Math.min(...years);
    const latest = c.grants.filter(g => g.fiscal_year === latestYear).sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    const wording = describeUntapped({
      funder: names.get(c.id) ?? 'This funder', peerNames: recips.map(r => names.get(r) ?? 'a peer organization'),
      grants: c.grants.length, firstYear, latestYear, latestAmount: latest?.amount ? Number(latest.amount) : null,
      chicagoShare: c.grants.filter(g => (g.geography && CHICAGO_TERMS.test(g.geography)) || (g.purpose && /chicago/i.test(g.purpose))).length / c.grants.length,
      programHits: c.grants.filter(g => g.purpose && (PROGRAM_TERMS.test(g.purpose) || POPULATION_TERMS.test(g.purpose))).length,
      path: pathFor.get(c.id) ?? null,
    });
    const via = 'Peer funding pattern';
    const { data: existing } = await withRetry(() => db.from('network_leads').select('id, pipeline_status').eq('org_id', orgId).eq('via_org', via).is('person_id', null).eq('target_org_id', c.id).maybeSingle());
    const row = { org_id: orgId, lead_type: 'organization', person_id: null, via_person_id: null, target_org_id: c.id, via_org: via, reason: wording, insight_type: 'Untapped Funder', score_breakdown: { generator: UNTAPPED, peer_recipients: recips.length, grants: c.grants.length, grant_ids: c.grants.map(g => g.id).slice(0, 50) }, updated_at: new Date().toISOString() };
    let leadId = existing?.id as string | undefined;
    if (leadId) await db.from('network_leads').update(row).eq('id', leadId);
    else { const { data: ins, error } = await db.from('network_leads').insert(row).select('id').single(); if (error) continue; leadId = ins?.id as string | undefined; }
    if (leadId) leads++;
    const { error } = await db.from('network_insights').insert({
      org_id: orgId, insight_type: 'Untapped Funder', title: `${names.get(c.id) ?? 'Funder'}: funds ${recips.length} CYC peers, no CYC funding identified`, summary: wording,
      path: [{ kind: 'org', id: c.id, label: names.get(c.id) ?? 'Funder' }, ...recips.slice(0, 3).map(r => ({ kind: 'org', id: r, label: names.get(r) ?? 'peer' })), { kind: 'org', id: cycId, label: 'CYC' }],
      score: 0, confidence: 'Medium', evidence: { generator: UNTAPPED, grant_ids: c.grants.map(g => g.id).slice(0, 50), source_ids: [...new Set(c.grants.map(g => g.source_id).filter(Boolean))] }, lead_id: leadId ?? null,
    });
    if (!error) insights++;
    top.push({ funder: names.get(c.id) ?? c.id, peers: recips.length, grants: c.grants.length, wording });
  }
  top.sort((a, b) => b.peers - a.peers || b.grants - a.grants);
  return { candidates: candidates.length, leads, insights, top: top.slice(0, 15) };
}
