// Phase 5 — corporate philanthropy intelligence.
//
// Corporations reach CYC two ways the graph can see: through PEOPLE (a board
// member works or worked there) and through MONEY (the company's foundation
// files a 990-PF that names Chicago youth organizations). This module builds
// the corporate universe from both, links each corporate foundation to its
// parent, records what the company says publicly about its giving (cited to
// the page), and turns the combination into "Corporate Giving Opportunity"
// leads with hedged wording.
//
// Deterministic scoring; the only model use is structured extraction from a
// public page, and every extracted fact carries the page URL.

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { ensureOrganization, ensureSource } from '@/lib/network/bridge';
import { fetchPublicText } from '@/lib/network/bio';
import { parentCorporationName } from '@/lib/network/crossref';
import { normalizeOrgName, clean } from '@/lib/network/normalize';
import { OWN_KINDS } from '@/lib/network/edges';

type Db = ReturnType<typeof createServerClient>;
const GENERATOR = 'corporate:v1';
const MODEL = 'claude-sonnet-4-6';

// ── Public corporate-giving pages for companies that recur around CYC ───────
export const KNOWN_GIVING_PAGES: Record<string, string> = {
  // Verified 2026-09-10 to return 200 to an honest "FundirBot" user agent. Sites that
  // answer 403 to any non-browser client (Huntington, PwC, First Merchants, AbbVie)
  // and those without a giving page (GTCR, Abbott's moved page) are deliberately
  // absent: we do not spoof browsers to get around bot protection.
  'bmo':                      'https://www.bmo.com/main/about-bmo/community-giving',
  'northern trust':           'https://www.northerntrust.com/united-states/about-us/corporate-social-responsibility',
  'jpmorgan chase':           'https://www.jpmorganchase.com/impact',
  'bank of america':          'https://about.bankofamerica.com/en/making-an-impact',
  'wintrust':                 'https://www.wintrustwealth.com/community.html',
  'fifth third bank':         'https://www.53.com/content/fifth-third/en/about-us/corporate-responsibility.html',
  'grainger':                 'https://www.grainger.com/content/corporate-responsibility',
  'discover financial services': 'https://www.discover.com/company/corporate-responsibility/',
  'morgan stanley':           'https://www.morganstanley.com/about-us/giving-back',
  'deloitte':                 'https://www2.deloitte.com/us/en/pages/about-deloitte/topics/corporate-responsibility-and-sustainability.html',
  'ibm':                      'https://www.ibm.com/responsibility',
  'salesforce':               'https://www.salesforce.com/company/philanthropy/',
  'kirkland & ellis':         'https://www.kirkland.com/social-commitment',
  'associated bank':          'https://www.associatedbank.com/about/community',
  'exelon':                   'https://www.exeloncorp.com/community',
  'comed':                    'https://www.comed.com/community',
  'allstate':                 'https://www.allstate.com/about/community',
  'cme group':                'https://www.cmegroup.com/company/corporate-citizenship.html',
  'motorola solutions':       'https://www.motorolasolutions.com/en_us/about/environmental-social-corporate-governance-esg.html',
  'accenture':                'https://www.accenture.com/us-en/about/corporate-citizenship',
  'boeing':                   'https://www.boeing.com/company/community-engagement',
  'utz brands':               'https://www.utzsnacks.com/blogs/news/the-rice-family-foundation-to-support-local-area-non-profit-organizations',
  'moelis & company':         'https://www.moelis.com/corporate-social-responsibility/',
};

// ── Program facts extracted from a public page ──────────────────────────────

export interface GivingProgram {
  company: string;
  vehicles: string[];               // "corporate foundation", "employee matching", "volunteer grants"…
  focus_areas: string[];            // as stated: "education", "youth", "workforce", "financial literacy"…
  geographic_scope: string | null;  // as stated: "Chicago", "national", "communities where we operate"
  chicago_named: boolean;           // the page explicitly names Chicago / Illinois
  youth_named: boolean;             // the page explicitly names youth / children / students
  application_path: string | null; // how a nonprofit applies / eligibility, as stated
  contact: string | null;           // public philanthropy/community contact (role or team, not personal)
  leadership: Array<{ name: string; title: string }>;  // named community-affairs / philanthropy leaders
  named_recipients: string[];       // nonprofits the page names as recent grantees/partners
  gaps: string[];
}

const SYSTEM = `You extract what a COMPANY states publicly about its philanthropy, for a nonprofit development team.
Hard rules:
- Use ONLY facts stated in the page text. Never infer or fill from general knowledge. Unknown → null / [].
- focus_areas and geographic_scope must be the page's own words, lightly normalized.
- chicago_named is true ONLY if the text names Chicago, Illinois or a Chicago neighborhood. youth_named is true ONLY if it names youth, children, students, teens, schools or K-12.
- leadership: only people the page names with a community/philanthropy/foundation/CSR title. Professional info only.
- named_recipients: only nonprofit organizations the page explicitly names as grantees, partners or beneficiaries.
- contact: a public team/role/email address for giving inquiries if shown (no personal phone numbers).
- Output strictly the JSON object requested. No prose.`;

export async function extractGivingProgram(input: { company: string; url: string; text: string }): Promise<GivingProgram | null> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1400, temperature: 0, system: SYSTEM,
    messages: [{ role: 'user', content: `Company: "${input.company}"\nPage: ${input.url}\n\nPAGE TEXT:\n"""\n${input.text}\n"""\n\nIf the page is not about this company's giving, return {"company": null}.\nOtherwise return JSON of the shape:\n{"company": string, "vehicles": [string], "focus_areas": [string], "geographic_scope": string|null, "chicago_named": boolean, "youth_named": boolean, "application_path": string|null, "contact": string|null, "leadership": [{"name": string, "title": string}], "named_recipients": [string], "gaps": [string]}` }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let p: Record<string, unknown>;
  try { p = JSON.parse(json); } catch { return null; }
  if (!p.company) return null;
  const arr = (v: unknown, n = 12) => (Array.isArray(v) ? v.map(x => clean(x)).filter(Boolean).slice(0, n) : []);
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? clean(v) : null);
  return {
    company: clean(p.company), vehicles: arr(p.vehicles), focus_areas: arr(p.focus_areas),
    geographic_scope: s(p.geographic_scope), chicago_named: p.chicago_named === true, youth_named: p.youth_named === true,
    application_path: s(p.application_path), contact: s(p.contact),
    leadership: (Array.isArray(p.leadership) ? p.leadership : []).flatMap((l: Record<string, unknown>) => { const name = s(l.name), title = s(l.title); return name && title ? [{ name, title }] : []; }).slice(0, 8),
    named_recipients: arr(p.named_recipients, 20), gaps: arr(p.gaps, 6),
  };
}

// ── Universe + links ────────────────────────────────────────────────────────

export interface CorpRow { id: string; name: string; type: string; website: string | null; metadata: Record<string, unknown> }

/** Corporations CYC's own people work(ed) at, plus parents of typed corporate foundations. */
export async function buildCorporateUniverse(db: Db, orgId: string): Promise<{ corporations: CorpRow[]; linked: number }> {
  const { data: own } = await db.from('network_people').select('id, kind, organization_id').eq('org_id', orgId);
  const ownIds = (own ?? []).filter(p => OWN_KINDS.has(p.kind as string)).map(p => p.id as string);
  const orgIds = new Set<string>();
  for (const p of own ?? []) if (OWN_KINDS.has(p.kind as string) && p.organization_id) orgIds.add(p.organization_id as string);
  for (let i = 0; i < ownIds.length; i += 300) {
    const { data: emps } = await db.from('network_employments').select('organization_id').in('person_id', ownIds.slice(i, i + 300)).not('organization_id', 'is', null);
    for (const e of emps ?? []) orgIds.add(e.organization_id as string);
  }

  // Corporate foundations → parent corporation nodes (+ foundation_connection edges).
  const { data: fdns } = await db.from('network_organizations').select('id, name, source_id').eq('organization_type', 'corporate_foundation');
  let linked = 0;
  for (const f of fdns ?? []) {
    const parent = parentCorporationName(f.name as string); if (!parent) continue;
    const corp = await ensureOrganization(db, { name: parent, type: 'corporation', sourceId: f.source_id as string | null, confidence: 0.6 });
    orgIds.add(corp.id);
    const { data: dupe } = await db.from('network_relationships').select('id').eq('org_id', orgId).eq('relationship_type', 'foundation_connection')
      .eq('source_organization_id', corp.id).eq('target_organization_id', f.id).eq('source_type', GENERATOR).maybeSingle();
    if (!dupe) {
      const { error } = await db.from('network_relationships').insert({
        org_id: orgId, relationship_type: 'foundation_connection', source_organization_id: corp.id, target_organization_id: f.id,
        relationship_strength: 15, confidence: 0.7, verification: 'probable',
        evidence: { summary: `${f.name} is the corporate foundation of ${parent} (name-derived)`, generator: GENERATOR }, source_id: f.source_id, source_type: GENERATOR,
      });
      if (!error) linked++;
    }
  }

  const corporations: CorpRow[] = [];
  const list = [...orgIds];
  for (let i = 0; i < list.length; i += 300) {
    const { data } = await db.from('network_organizations').select('id, name, organization_type, website, metadata').in('id', list.slice(i, i + 300)).in('organization_type', ['corporation', 'bank']);
    for (const o of data ?? []) corporations.push({ id: o.id as string, name: o.name as string, type: o.organization_type as string, website: o.website as string | null, metadata: (o.metadata ?? {}) as Record<string, unknown> });
  }
  return { corporations, linked };
}

export function givingPageFor(name: string, website: string | null, meta: Record<string, unknown>): string | null {
  return KNOWN_GIVING_PAGES[normalizeOrgName(name)] ?? (typeof meta.giving_page === 'string' ? meta.giving_page : null) ?? null;
}

/** Fetch + extract + store one company's giving program (cited). Returns null when nothing usable. */
export async function harvestGivingProgram(db: Db, corp: CorpRow, url: string): Promise<GivingProgram | null> {
  const page = await fetchPublicText(url);
  const program = await extractGivingProgram({ company: corp.name, url, text: page.text });
  if (!program) return null;
  const sourceId = await ensureSource(db, { source_type: 'corporate_site', source_name: `Corporate giving page — ${corp.name}`, raw_reference: `giving:${url}`, source_url: url, confidence: 0.85 });
  await db.from('network_organizations').update({
    website: corp.website ?? new URL(url).origin,
    metadata: { ...corp.metadata, giving_page: url, philanthropy: { ...program, source_id: sourceId, retrieved_at: new Date().toISOString() } },
  }).eq('id', corp.id);
  return program;
}

// ── Scoring + leads ─────────────────────────────────────────────────────────

export interface CorpSignals {
  people: Array<{ id: string; name: string; board_role: string | null; current: boolean }>;   // CYC people at the company
  foundation: { id: string; name: string } | null;
  peerEvents: number;              // the foundation's cited grants to CYC peers
  fundedCyc: boolean;              // CYC has an award / relationship on record
  craOverlap: boolean;
  program: GivingProgram | null;
}

export function scoreCorporate(s: CorpSignals): { score: number; fit: number; access: number; reasons: string[] } {
  const reasons: string[] = [];
  let fit = 0, access = 0;
  if (s.peerEvents > 0) { fit += Math.min(20, 8 + s.peerEvents * 3); reasons.push(`${s.foundation?.name ?? 'Its foundation'} funds ${s.peerEvents} CYC peer grant${s.peerEvents === 1 ? '' : 's'} (IRS filings)`); }
  if (s.program?.youth_named) { fit += 15; reasons.push('Names youth/education programs publicly'); }
  if (s.program?.chicago_named) { fit += 15; reasons.push('Names Chicago/Illinois giving publicly'); }
  if (s.program && (s.program.focus_areas.some(f => /workforce|financial|stem|entrepreneur|mobility/i.test(f)))) { fit += 10; reasons.push('Focus overlaps CYC programs (workforce / financial / STEM)'); }
  if (s.fundedCyc) { fit += 10; reasons.push('Existing CYC relationship on record'); }
  if (s.craOverlap) { fit += 8; reasons.push('CRA assessment area covers CYC'); }
  if (s.program?.contact || s.program?.application_path) { access += 7; reasons.push('Public giving contact / application path'); }
  if (s.program?.leadership.length) { access += 5; reasons.push('Community-affairs leadership named'); }
  const cur = s.people.filter(p => p.current), past = s.people.filter(p => !p.current);
  let rel = 0;
  if (cur.length) { rel += 25; reasons.push(`${cur.map(p => p.name).slice(0, 3).join(', ')} currently at the company`); }
  if (past.length) { rel += 15; reasons.push(`${past.map(p => p.name).slice(0, 3).join(', ')} formerly at the company`); }
  const score = Math.min(100, rel + fit + access);
  return { score, fit, access, reasons };
}

export function describeCorporate(name: string, s: CorpSignals, r: ReturnType<typeof scoreCorporate>): string {
  const who = s.people[0];
  const path = who ? ` CYC ${who.board_role ? who.board_role.toLowerCase() : 'board member'} ${who.name} ${who.current ? 'currently works' : 'previously worked'} at ${name}${s.people.length > 1 ? ` (${s.people.length} CYC people in total)` : ''}.` : '';
  const why = r.reasons.filter(x => !x.includes('at the company')).slice(0, 3).join('; ');
  const fund = s.fundedCyc ? '' : ' No CYC funding relationship from the company is identified in available data.';
  return `${name} appears relevant${why ? ` because: ${why}` : ''}.${path}${fund} Potential path: ask ${who ? who.name : 'the connected CYC person'} about the company's community giving; no personal relationship with its philanthropy staff is asserted.`;
}

export interface CorporateReport { corporations: number; withPeople: number; withFoundation: number; leads: number; insights: number; top: Array<{ name: string; score: number; confidence: string; wording: string }> }

export async function computeCorporateLeads(db: Db, orgId: string, corporations: CorpRow[]): Promise<CorporateReport> {
  const { data: cyc } = await db.from('network_organizations').select('id').eq('ein', '362344429').maybeSingle();
  const { data: own } = await db.from('network_people').select('id, name, kind, board_role, organization_id').eq('org_id', orgId);
  const ownPeople = (own ?? []).filter(p => OWN_KINDS.has(p.kind as string));
  const ownIds = ownPeople.map(p => p.id as string);
  const { data: emps } = ownIds.length ? await db.from('network_employments').select('person_id, organization_id, is_current').in('person_id', ownIds).not('organization_id', 'is', null) : { data: [] };

  // Foundation per corporation (our foundation_connection edges) + peer funding per foundation.
  const { data: fEdges } = await db.from('network_relationships').select('source_organization_id, target_organization_id').eq('org_id', orgId).eq('relationship_type', 'foundation_connection').eq('source_type', GENERATOR);
  const foundationOf = new Map((fEdges ?? []).map(e => [e.source_organization_id as string, e.target_organization_id as string]));
  const { data: pEdges } = await db.from('network_relationships').select('source_organization_id, evidence').eq('org_id', orgId).eq('relationship_type', 'philanthropic_overlap');
  const peerEvents = new Map<string, number>();
  for (const e of pEdges ?? []) peerEvents.set(e.source_organization_id as string, (peerEvents.get(e.source_organization_id as string) ?? 0) + (Number((e.evidence as Record<string, unknown>)?.events) || 1));
  const { data: cycRel } = await db.from('network_relationships').select('target_organization_id').eq('org_id', orgId).eq('relationship_type', 'existing_cyc_relationship').eq('source_organization_id', cyc?.id ?? '00000000-0000-0000-0000-000000000000');
  const funded = new Set((cycRel ?? []).map(e => e.target_organization_id as string));
  const { data: geo } = await db.from('network_relationships').select('target_organization_id').eq('org_id', orgId).eq('relationship_type', 'geographic_overlap');
  const cra = new Set((geo ?? []).map(e => e.target_organization_id as string));
  const fNames = new Map<string, string>();
  const fIds = [...new Set(foundationOf.values())];
  for (let i = 0; i < fIds.length; i += 300) { const { data } = await db.from('network_organizations').select('id, name').in('id', fIds.slice(i, i + 300)); for (const o of data ?? []) fNames.set(o.id as string, o.name as string); }

  await db.from('network_insights').delete().eq('org_id', orgId).filter('evidence->>generator', 'eq', GENERATOR);
  let leads = 0, insights = 0, withPeople = 0, withFoundation = 0;
  const top: CorporateReport['top'] = [];
  for (const c of corporations) {
    const people = new Map<string, { id: string; name: string; board_role: string | null; current: boolean }>();
    for (const p of ownPeople) if (p.organization_id === c.id) people.set(p.id as string, { id: p.id as string, name: p.name as string, board_role: p.board_role as string | null, current: true });
    for (const e of emps ?? []) if (e.organization_id === c.id) {
      const p = ownPeople.find(x => x.id === e.person_id); if (!p) continue;
      const cur = people.get(p.id as string);
      if (!cur || (e.is_current && !cur.current)) people.set(p.id as string, { id: p.id as string, name: p.name as string, board_role: p.board_role as string | null, current: !!e.is_current || !!cur?.current });
    }
    const fId = foundationOf.get(c.id) ?? null;
    const signals: CorpSignals = {
      people: [...people.values()], foundation: fId ? { id: fId, name: fNames.get(fId) ?? 'its foundation' } : null,
      peerEvents: fId ? (peerEvents.get(fId) ?? 0) : 0, fundedCyc: funded.has(c.id) || (!!fId && funded.has(fId)), craOverlap: cra.has(c.id),
      program: (c.metadata.philanthropy as GivingProgram | undefined) ?? null,
    };
    if (signals.people.length) withPeople++;
    if (fId) withFoundation++;
    const r = scoreCorporate(signals);
    if (r.score < 20 || (!signals.people.length && signals.peerEvents === 0 && !signals.fundedCyc)) continue;   // nothing actionable
    const confidence = signals.people.some(p => p.current) && (signals.peerEvents > 0 || signals.program) ? 'High' : signals.people.length || signals.peerEvents > 0 ? 'Medium' : 'Low';
    const wording = describeCorporate(c.name, signals, r);
    const via = signals.people[0];
    const { data: existing } = await db.from('network_leads').select('id').eq('org_id', orgId).eq('via_org', c.name.slice(0, 120)).is('person_id', null).eq('target_org_id', c.id).maybeSingle();
    const row = {
      org_id: orgId, lead_type: 'organization', person_id: null, via_person_id: via?.id ?? null, target_org_id: c.id, via_org: c.name.slice(0, 120),
      reason: wording, score: r.score, evidence_confidence: confidence, insight_type: 'Corporate Giving Opportunity',
      score_breakdown: { generator: GENERATOR, relationship: r.score - r.fit - r.access, fit: r.fit, access: r.access, reasons: r.reasons, foundation_id: fId, peer_events: signals.peerEvents },
      updated_at: new Date().toISOString(),
    };
    let leadId = existing?.id as string | undefined;
    if (leadId) await db.from('network_leads').update(row).eq('id', leadId);
    else { const { data: ins } = await db.from('network_leads').insert(row).select('id').single(); leadId = ins?.id as string | undefined; }
    if (leadId) leads++;
    const { error } = await db.from('network_insights').insert({
      org_id: orgId, insight_type: 'Corporate Giving Opportunity', title: `${c.name}: corporate giving opportunity`, summary: wording,
      path: [{ kind: 'org', id: null, label: 'CYC' }, ...(via ? [{ kind: 'person', id: via.id, label: via.name }] : []), { kind: 'org', id: c.id, label: c.name }, ...(fId ? [{ kind: 'org', id: fId, label: fNames.get(fId) ?? 'foundation' }] : [])],
      score: r.score, confidence, evidence: { generator: GENERATOR, reasons: r.reasons, foundation_id: fId, program_source_id: (signals.program as unknown as { source_id?: string } | null)?.source_id ?? null }, lead_id: leadId ?? null,
    });
    if (!error) insights++;
    top.push({ name: c.name, score: r.score, confidence, wording });
  }
  top.sort((a, b) => b.score - a.score);
  return { corporations: corporations.length, withPeople, withFoundation, leads, insights, top: top.slice(0, 15) };
}
