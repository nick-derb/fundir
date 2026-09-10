// Phase 7 — the evidence pack behind a lead.
//
// An explanation may only say what the pack says. So the pack is built first,
// deterministically, from stored rows: every item is one plain sentence of
// fact with its source, its row reference and — where it matters — its
// verification grade. Aggregates ("54 grants to 33 peers") are computed here,
// not by the model, so every number in an explanation has a row behind it.
//
// Items are numbered E1…En in a stable order (relationship → funding → access
// → organization → score) and hashed, so an explanation is regenerated only
// when its evidence changes.

import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { loadSignalContext, signalsFor, type SignalContext, type TargetContext } from '@/lib/network/opportunity';
import { scoreLead, PROGRAM_TERMS, POPULATION_TERMS, CHICAGO_TERMS, PROGRAM_OFFICER_TITLES, RELATIONSHIP_POINTS, NO_CYC_FUNDING, type Verification } from '@/lib/network/scoring';
import { normalizeOrgName } from '@/lib/network/normalize';

type Db = ReturnType<typeof createServerClient>;

export type EvidenceKind = 'relationship' | 'tie' | 'seat' | 'grant' | 'funding_summary' | 'cyc_funding' | 'program' | 'peer' | 'organization' | 'score';

export interface EvidenceItem {
  id: string;                       // "E1"
  kind: EvidenceKind;
  text: string;                     // one sentence of fact, exactly as the rows state it
  verification: Verification | null;
  source_type: string | null;
  source_url: string | null;
  source_id: string | null;
  ref: { table: string; id: string | null };
}

export interface EvidencePack {
  lead_id: string;
  lead_type: string;
  insight_type: string | null;
  target: { id: string; name: string; type: string | null };
  via: { id: string; name: string; role: string | null } | null;       // CYC person the path runs through
  trustee: { id: string; name: string; title: string | null } | null;  // the person at the target, for warm paths
  items: EvidenceItem[];
  score: { opportunity_score: number; evidence_confidence: string; subtotals: Record<string, number> };
  funding_to_cyc_identified: boolean;
  hash: string;
}

const SOURCE_LABEL: Record<string, string> = {
  irs_990_xml: 'IRS 990 filing', propublica: 'ProPublica', foundation_site: 'foundation website', corporate_site: 'company website',
  cyc_workbook: 'CYC records', linkedin_api: 'LinkedIn profile', public_bio: 'public bio', cyc_site: 'CYC board page', seed: 'CYC seed list (uncited)', manual: 'manual entry', instrumentl: 'Instrumentl', irs_bmf: 'IRS BMF',
};
export const sourceLabel = (t: string | null) => (t ? SOURCE_LABEL[t] ?? t : 'source not recorded');

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** "2001–2013", "2001–present", "from 2001", "until 2007", "undated". */
const span = (s: number | null, e: number | null, current: boolean) =>
  s && (e || current) ? `${s}–${current ? 'present' : e}` : s ? `from ${s}` : e ? `until ${e}` : 'undated';

/** Build packs for many leads with one bulk signal load. */
export async function buildEvidencePacks(db: Db, orgId: string, leadIds: string[]): Promise<Map<string, EvidencePack>> {
  const { data: leadRows, error } = await db.from('network_leads')
    .select('id, lead_type, insight_type, person_id, via_person_id, via_org, target_org_id, opportunity_score, evidence_confidence, score_breakdown')
    .eq('org_id', orgId).in('id', leadIds);
  if (error) throw new Error(`leads: ${error.message}`);
  const leads = leadRows ?? [];

  // Person leads (employer scans) name their employer in via_org; resolve it.
  const viaNames = [...new Set(leads.filter(l => !l.target_org_id && l.via_org).map(l => normalizeOrgName(l.via_org as string)))];
  const viaOrgId = new Map<string, string>();
  if (viaNames.length) {
    const { data } = await db.from('network_organizations').select('id, normalized_name').in('normalized_name', viaNames);
    for (const o of data ?? []) viaOrgId.set(o.normalized_name as string, o.id as string);
  }
  const targetOf = (l: typeof leads[number]) => (l.target_org_id as string | null) ?? (l.via_org ? viaOrgId.get(normalizeOrgName(l.via_org as string)) ?? null : null);
  const ctx = await loadSignalContext(db, orgId, leads.map(targetOf).filter(Boolean) as string[]);

  const personIds = [...new Set(leads.flatMap(l => [l.person_id, l.via_person_id]).filter(Boolean))] as string[];
  const { data: people } = personIds.length ? await db.from('network_people').select('id, name, board_role, kind, current_title, current_org').in('id', personIds) : { data: [] };
  const person = new Map((people ?? []).map(p => [p.id as string, p]));
  const { data: ownRoles } = await db.from('network_people').select('id, name, board_role, kind').eq('org_id', orgId).in('id', [...ctx.ownIds]);
  const ownRole = new Map((ownRoles ?? []).map(p => [p.id as string, { name: p.name as string, role: (p.board_role as string | null) ?? (p.kind === 'staff' ? 'staff' : null) }]));

  // Trustee names/titles for every target person we may cite.
  const targetPersonIds = [...new Set([...ctx.targets.values()].flatMap(t => [...t.peopleIds]))];
  const tName = new Map<string, { name: string; title: string | null }>();
  for (let i = 0; i < targetPersonIds.length; i += 300) {
    const { data } = await db.from('network_people').select('id, name, current_title').in('id', targetPersonIds.slice(i, i + 300));
    for (const p of data ?? []) tName.set(p.id as string, { name: p.name as string, title: p.current_title as string | null });
  }
  const seatRows = new Map<string, Array<{ id: string; person_id: string; title: string | null; source_id: string | null }>>();
  const targetIds = [...ctx.targets.keys()];
  for (let i = 0; i < targetIds.length; i += 100) {
    const { data } = await db.from('network_boards').select('id, person_id, organization_id, title, source_id').in('organization_id', targetIds.slice(i, i + 100));
    for (const s of data ?? []) { const arr = seatRows.get(s.organization_id as string) ?? []; arr.push({ id: s.id as string, person_id: s.person_id as string, title: s.title as string | null, source_id: s.source_id as string | null }); seatRows.set(s.organization_id as string, arr); }
  }
  // Source lookups: the signal context knows edge + grant sources; seats and ties add their own.
  const sourceUrl = new Map<string, string | null>();
  {
    const ids = new Set([...ctx.sourceTypes.keys()]);
    for (const list of seatRows.values()) for (const s of list) if (s.source_id) ids.add(s.source_id);
    for (const t of ctx.targets.values()) for (const tie of t.ownTies) if (tie.sourceId) ids.add(tie.sourceId);
    const arr = [...ids];
    for (let i = 0; i < arr.length; i += 200) {
      const { data } = await db.from('network_sources').select('id, source_type, source_url').in('id', arr.slice(i, i + 200));
      for (const s of data ?? []) { sourceUrl.set(s.id as string, s.source_url as string | null); if (!ctx.sourceTypes.has(s.id as string)) ctx.sourceTypes.set(s.id as string, s.source_type as string); }
    }
  }

  const packs = new Map<string, EvidencePack>();
  for (const l of leads) {
    const tId = targetOf(l); const t = tId ? ctx.targets.get(tId) : undefined;
    if (!t) continue;
    const trusteeId = l.lead_type === 'organization' ? (l.person_id as string | null) : null;
    const s = signalsFor(ctx, t, trusteeId);
    const r = scoreLead(s);
    const items: EvidenceItem[] = [];
    const push = (i: Omit<EvidenceItem, 'id'>) => { items.push({ id: `E${items.length + 1}`, ...i }); };
    const src = (id: string | null) => ({ source_type: id ? ctx.sourceTypes.get(id) ?? null : null, source_url: id ? sourceUrl.get(id) ?? null : null, source_id: id });

    // ── Relationship evidence ──
    const rels = t.edges.filter(e => e.source_person_id && e.target_person_id)
      .filter(e => !trusteeId || e.source_person_id === trusteeId || e.target_person_id === trusteeId)
      .filter(e => e.relationship_type !== 'second_degree')  // lead-derived, not primary evidence
      .sort((a, b) => (RELATIONSHIP_POINTS[b.relationship_type] ?? 0) - (RELATIONSHIP_POINTS[a.relationship_type] ?? 0))
      .slice(0, 6);
    for (const e of rels) {
      const ev = (e.evidence ?? {}) as { summary?: string; tenures?: Array<{ person: string; org: string; start: number | null; end: number | null }>; school?: string; via_org?: string };
      let text = ev.summary ?? `${e.relationship_type.replace(/_/g, ' ')} link`;
      if (ev.tenures?.length) text += ` (${ev.tenures.map(x => `${x.person} ${span(x.start, x.end, false)}`).join('; ')})`;
      text += ` — ${e.verification}${e.verification === 'inferred' ? ', not documented' : e.verification === 'probable' ? ', undated' : ' with dates'}, per ${sourceLabel(e.source_id ? ctx.sourceTypes.get(e.source_id) ?? null : null)}.`;
      push({ kind: 'relationship', text, verification: e.verification, ...src(e.source_id), ref: { table: 'network_relationships', id: e.id } });
    }
    for (const e of t.edges.filter(e => !e.source_person_id && ['existing_cyc_relationship', 'geographic_overlap'].includes(e.relationship_type))) {
      const ev = (e.evidence ?? {}) as { summary?: string };
      push({ kind: 'relationship', text: `${ev.summary ?? (e.relationship_type === 'existing_cyc_relationship' ? `CYC's records list an existing relationship with ${t.org.name}` : `${t.org.name}'s service area covers CYC's neighbourhoods`)} — ${e.verification}, per ${sourceLabel(e.source_id ? ctx.sourceTypes.get(e.source_id) ?? null : null)}.`, verification: e.verification, ...src(e.source_id), ref: { table: 'network_relationships', id: e.id } });
    }
    if (!trusteeId) for (const tie of dedupeTies(t.ownTies)) {
      const who = ownRole.get(tie.personId);
      push({ kind: 'tie', text: `CYC ${who?.role ? who.role.toLowerCase() === 'staff' ? 'staff member' : `board ${who.role.toLowerCase()}` : 'board member'} ${who?.name ?? 'a CYC person'} ${tie.current ? 'currently works' : 'previously worked'} at ${t.org.name}, per ${sourceLabel(tie.sourceId ? ctx.sourceTypes.get(tie.sourceId) ?? null : 'cyc_site')}.`, verification: tie.sourceId ? 'verified' : 'probable', ...src(tie.sourceId), ref: { table: 'network_employments', id: null } });
    }
    // Seats at the target: the trustee on a warm path, otherwise program staff first.
    const seats = (seatRows.get(t.org.id) ?? []).concat(t.foundationId ? seatRows.get(t.foundationId) ?? [] : []);
    const seatPick = trusteeId ? seats.filter(x => x.person_id === trusteeId).slice(0, 1)
      : [...seats.filter(x => x.title && PROGRAM_OFFICER_TITLES.test(x.title)), ...seats.filter(x => !(x.title && PROGRAM_OFFICER_TITLES.test(x.title)))].slice(0, 3);
    for (const x of seatPick) {
      const p = tName.get(x.person_id);
      if (!p) continue;
      push({ kind: 'seat', text: `${p.name} is ${x.title ?? 'on the board'} at ${t.org.name}, per ${sourceLabel(x.source_id ? ctx.sourceTypes.get(x.source_id) ?? null : null)}.`, verification: x.source_id ? 'verified' : 'probable', ...src(x.source_id), ref: { table: 'network_boards', id: x.id } });
    }

    // ── Funding evidence ──
    const f = s.funding;
    const peerGrants = t.grants.filter(g => g.recipient_org_id && ctx.peerSim.has(g.recipient_org_id));
    if (peerGrants.length) {
      const years = peerGrants.map(g => g.fiscal_year).filter((y): y is number => typeof y === 'number');
      const il = peerGrants.filter(g => (g.geography && CHICAGO_TERMS.test(g.geography)) || (g.purpose && /chicago/i.test(g.purpose))).length;
      const cited = peerGrants.filter(g => g.source_url || (g.source_id && ctx.sourceTypes.get(g.source_id) !== 'seed')).length;
      const srcLabel = cited === peerGrants.length ? 'IRS 990 filings' : cited === 0 ? 'CYC seed list (uncited)' : 'IRS 990 filings and CYC seed list';
      push({ kind: 'funding_summary', text: `In ${srcLabel} ${years.length ? `${Math.min(...years)}–${Math.max(...years)}` : ''}, ${t.org.name}${t.foundationId ? ' (including its foundation)' : ''} made ${peerGrants.length} grant${peerGrants.length === 1 ? '' : 's'} to ${f.peerRecipients} organization${f.peerRecipients === 1 ? '' : 's'} in CYC's peer set${f.medianAmount ? `, median ${money(f.medianAmount)}` : ''}${il ? `; ${il} of ${peerGrants.length} in Illinois` : ''}; ${f.programHits} with a stated purpose overlapping CYC programs and ${f.populationHits} naming youth, children or families.`, verification: cited === peerGrants.length ? 'verified' : cited ? 'probable' : 'inferred', source_type: cited ? 'irs_990_xml' : 'seed', source_url: null, source_id: null, ref: { table: 'grants_made', id: null } });
      const top = [...peerGrants].sort((a, b) => ((ctx.peerSim.get(b.recipient_org_id!) ?? 0) - (ctx.peerSim.get(a.recipient_org_id!) ?? 0)) || ((b.fiscal_year ?? 0) - (a.fiscal_year ?? 0)) || (Number(b.amount) - Number(a.amount))).slice(0, 6);
      for (const g of top) {
        const seed = !g.source_url && (!g.source_id || ctx.sourceTypes.get(g.source_id) === 'seed');
        push({ kind: 'grant', text: `${t.org.name} granted ${g.amount ? money(Number(g.amount)) : 'an unstated amount'} to ${ctx.peerNames.get(g.recipient_org_id!) ?? 'a peer organization'}${g.fiscal_year ? ` in ${g.fiscal_year}` : ''}${g.purpose ? ` for "${g.purpose.slice(0, 140)}"` : ''}, per ${seed ? 'CYC seed list (uncited)' : 'IRS 990 filing'}.`, verification: seed ? 'inferred' : 'verified', source_type: seed ? 'seed' : (g.source_id ? ctx.sourceTypes.get(g.source_id) ?? 'irs_990_xml' : 'irs_990_xml'), source_url: g.source_url, source_id: g.source_id, ref: { table: 'grants_made', id: g.id } });
      }
    }
    const cycGrants = ctx.cycOrgId ? t.grants.filter(g => g.recipient_org_id === ctx.cycOrgId) : [];
    if (cycGrants.length) {
      const latest = [...cycGrants].sort((a, b) => (b.fiscal_year ?? 0) - (a.fiscal_year ?? 0))[0];
      push({ kind: 'cyc_funding', text: `${t.org.name} has funded CYC: ${cycGrants.length} grant${cycGrants.length === 1 ? '' : 's'} on record, most recently ${latest.amount ? money(Number(latest.amount)) : 'an unstated amount'}${latest.fiscal_year ? ` in ${latest.fiscal_year}` : ''}.`, verification: latest.source_url ? 'verified' : 'probable', source_type: latest.source_id ? ctx.sourceTypes.get(latest.source_id) ?? null : null, source_url: latest.source_url, source_id: latest.source_id, ref: { table: 'grants_made', id: latest.id } });
    } else {
      push({ kind: 'cyc_funding', text: `${NO_CYC_FUNDING} (IRS filings in scope, CYC records.)`, verification: null, source_type: null, source_url: null, source_id: null, ref: { table: 'grants_made', id: null } });
    }
    // Peer relevance of the recipients cited above.
    for (const rid of [...new Set(peerGrants.map(g => g.recipient_org_id as string))].sort((a, b) => (ctx.peerSim.get(b) ?? 0) - (ctx.peerSim.get(a) ?? 0)).slice(0, 3)) {
      push({ kind: 'peer', text: `${ctx.peerNames.get(rid) ?? 'This organization'} is in CYC's peer set (similarity ${(ctx.peerSim.get(rid) ?? 0).toFixed(2)} on program, geography, population and size).`, verification: 'verified', source_type: 'irs_bmf', source_url: null, source_id: null, ref: { table: 'network_peer_orgs', id: rid } });
    }

    // ── Public program facts (company giving page) ──
    const phil = (t.org.metadata?.philanthropy ?? null) as { focus_areas?: string[]; chicago_named?: boolean; youth_named?: boolean; contact?: string | null; application_path?: string | null; leadership?: Array<{ name: string; title: string }>; source_url?: string; source_id?: string } | null;
    if (phil) {
      const bits = [phil.focus_areas?.length ? `focus areas: ${phil.focus_areas.slice(0, 5).join(', ')}` : null, phil.chicago_named ? 'names Chicago / Illinois giving' : null, phil.youth_named ? 'names youth or education programs' : null, phil.application_path ? `application path: ${phil.application_path}` : null, phil.contact ? 'a public giving contact is listed' : null].filter(Boolean);
      if (bits.length) push({ kind: 'program', text: `${t.org.name}'s public giving page states ${bits.join('; ')}.`, verification: 'verified', source_type: 'corporate_site', source_url: phil.source_url ?? t.org.website, source_id: phil.source_id ?? null, ref: { table: 'network_organizations', id: t.org.id } });
      for (const lead of (phil.leadership ?? []).slice(0, 2)) push({ kind: 'program', text: `${lead.name} is listed as ${lead.title} on ${t.org.name}'s giving page.`, verification: 'verified', source_type: 'corporate_site', source_url: phil.source_url ?? t.org.website, source_id: phil.source_id ?? null, ref: { table: 'network_organizations', id: t.org.id } });
    }

    // ── Organization facts ──
    const orgBits = [t.org.organization_type ? t.org.organization_type.replace(/_/g, ' ') : null, t.org.city || t.org.state ? `based in ${[t.org.city, t.org.state].filter(Boolean).join(', ')}` : null, t.org.website ? `website ${t.org.website}` : null].filter(Boolean);
    if (orgBits.length) push({ kind: 'organization', text: `${t.org.name}: ${orgBits.join('; ')}.`, verification: 'verified', source_type: 'irs_bmf', source_url: t.org.website, source_id: null, ref: { table: 'network_organizations', id: t.org.id } });

    // ── The deterministic score, so the model can reference it without inventing it ──
    push({ kind: 'score', text: `Fundir's deterministic score for this lead is ${r.opportunity_score}/100 with ${r.evidence_confidence} evidence confidence (relationship ${r.breakdown.subtotals.relationship}, funding fit ${r.breakdown.subtotals.funding_fit}, accessibility ${r.breakdown.subtotals.accessibility}, recency ${r.breakdown.subtotals.recency}, penalties ${r.breakdown.subtotals.penalties}).${r.breakdown.penalties.length ? ` Penalties: ${r.breakdown.penalties.map(p => p.label).join('; ')}.` : ''}`, verification: null, source_type: null, source_url: null, source_id: null, ref: { table: 'network_leads', id: l.id as string } });

    const via = l.via_person_id ? person.get(l.via_person_id as string) : null;
    const trustee = trusteeId ? person.get(trusteeId) : null;
    const hash = createHash('sha1').update(JSON.stringify(items.map(i => i.text))).digest('hex').slice(0, 16);
    packs.set(l.id as string, {
      lead_id: l.id as string, lead_type: l.lead_type as string, insight_type: l.insight_type as string | null,
      target: { id: t.org.id, name: t.org.name, type: t.org.organization_type },
      via: via ? { id: via.id as string, name: via.name as string, role: (via.board_role as string | null) ?? null } : null,
      trustee: trustee ? { id: trustee.id as string, name: trustee.name as string, title: (trustee.current_title as string | null) ?? null } : null,
      items, score: { opportunity_score: r.opportunity_score, evidence_confidence: r.evidence_confidence, subtotals: r.breakdown.subtotals },
      funding_to_cyc_identified: cycGrants.length > 0, hash,
    });
  }
  return packs;
}

function dedupeTies(ties: TargetContext['ownTies']) {
  const best = new Map<string, TargetContext['ownTies'][number]>();
  for (const t of ties) { const c = best.get(t.personId); if (!c || (t.current && !c.current)) best.set(t.personId, t); }
  return [...best.values()];
}

export type { SignalContext };
