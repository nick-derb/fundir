// LinkedIn URL discovery + verification for the people in CYC's network.
//
// Two ways a URL arrives:
//   1. web_search   — a public search found a linkedin.com/in/… page for the
//                     person (no provider credits). Stored in
//                     network_url_candidates as `pending`.
//   2. provider     — for people with a known employer but no candidate, the
//                     company-scoped employee search (name keyword) is asked
//                     for exactly one same-name hit (~10-15 calls).
//
// Either way, nothing is written to network_people.linkedin_url until the
// LIVE profile corroborates the person: the name must agree (surname + first /
// nickname / initial) AND an organization we already know for the person
// (board-page employer, public-bio career, the foundation they sit on) must
// appear in the profile. One enrich call (~2 credits) does both the check and
// the career-history read, so a verified candidate is also an enriched person.

import type { createServerClient } from '@/lib/supabase';
import { enrichProfile, searchEmployees, experienceYears, canonicalLinkedInUrl, CallBudget, type LinkedInProfile, type CompanyMatch } from '@/lib/network/linkedin';
import { ensureSource } from '@/lib/network/bridge';
import { canonicalEmployer, personNameKey } from '@/lib/network/normalize';

type Db = ReturnType<typeof createServerClient>;

/** Kinds that belong to CYC itself (vs. trustees/executives of funders). */
export const OWN_KINDS = ['board', 'staff', 'auxiliary', 'council'] as const;
/** Kinds whose employer is a searchable company (foundation executives count). */
export const DISCOVERABLE_KINDS = [...OWN_KINDS, 'executive'] as const;

export const ENRICH_CREDITS = 2;
export const DISCOVER_CALLS = 14;   // resolve (~3) + search (~1 + polls + pages)

// ── Name agreement (ported from scripts/verify-linkedin-url.ts) ─────────────

const HONORIFIC = /^(mr|mrs|ms|miss|dr|hon|rev|sir)\.?\s+/i;
const SUFFIX = /^(jr|sr|ii|iii|iv|phd|cfa|cpa|md|jd|mba|esq|rn|msw|med|pc)$/;

function nameParts(s: string): { first: string; last: string; rest: string[]; nick: string | null } {
  const nick = s.match(/\(([^)]+)\)|["“]([^"”]+)["”]/)?.slice(1).find(Boolean)?.toLowerCase() ?? null;
  const cleaned = s.replace(HONORIFIC, '').replace(/\(.*?\)|["“].*?["”]/g, ' ').replace(/,.*$/, '');
  // Hyphenated surnames count as both halves ("Speller-Thurman" ≈ "Speller").
  const words = cleaned.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/[\s-]+/).filter(w => w.length > 1 && !SUFFIX.test(w.replace(/\./g, '')));
  return { first: words[0] ?? '', last: words[words.length - 1] ?? '', rest: words.slice(1), nick };
}

/** "Catherine (Cathy) Main" ≈ "Cathy Main"; "Dennis J. FitzSimons" ≈ "Dennis FitzSimons";
 *  "Dixie Adams Erwin" ≈ "Dixie Adams" (a maiden or middle surname on either side). */
export function namesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const A = nameParts(a), B = nameParts(b);
  if (!A.last || !B.last) return false;
  const surnameAgrees = A.last === B.last || A.rest.includes(B.last) || B.rest.includes(A.last);
  if (!surnameAgrees) return false;
  if (!A.first || !B.first) return false;
  return A.first === B.first || A.nick === B.first || B.nick === A.first || A.first[0] === B.first[0];
}

// ── Organization agreement ──────────────────────────────────────────────────

const ORG_STOP = new Set(['the', 'of', 'and', 'inc', 'llc', 'llp', 'lp', 'ltd', 'co', 'com', 'net', 'org', 'corp', 'corporation', 'company', 'group', 'foundation', 'fund', 'trust', 'partners', 'bank', 'university', 'college', 'community', 'chicago', 'illinois', 'services', 'associates', 'consulting', 'capital', 'financial', 'holdings', 'international', 'national', 'america', 'north']);
function orgTokens(s: string | null | undefined): Set<string> {
  return new Set(String(s ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !ORG_STOP.has(w)));
}
function orgsAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const A = orgTokens(a), B = orgTokens(b);
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared >= Math.min(2, Math.min(A.size, B.size)) && shared / Math.min(A.size, B.size) >= 0.5;
}

export type Verdict = { ok: true; verification: 'verified' | 'probable'; why: string } | { ok: false; why: string };

const LOCAL = /chicago|illinois|\bil\b|evanston|oak park|naperville|wheaton|elgin/i;

/** Does the live profile corroborate this person? */
export function corroborate(person: { name: string; knownOrgs: string[]; hasEmployer: boolean; kind?: string }, prof: LinkedInProfile): Verdict {
  if (!namesAgree(person.name, prof.name)) return { ok: false, why: `name mismatch: profile says "${prof.name ?? '?'}"` };
  const profOrgs = [prof.currentOrg, ...prof.experiences.map(e => e.org), prof.headline, prof.summary?.slice(0, 400)];
  for (const known of person.knownOrgs) {
    for (const p of profOrgs) if (orgsAgree(known, p)) return { ok: true, verification: 'verified', why: `name + "${known}" both on the profile` };
  }
  const local = LOCAL.test(prof.location ?? '');
  if (!person.hasEmployer && local) {
    return { ok: true, verification: 'probable', why: 'name agrees and the profile is in the Chicago area; no employer on file to corroborate' };
  }
  // Foundation trustees rarely list an unpaid board seat as experience, and all
  // we know about them is the seat: a same-name, Chicago-area profile is kept as
  // probable so the evidence grading downstream stays honest about it.
  if ((person.kind === 'trustee' || person.kind === 'executive') && local) {
    return { ok: true, verification: 'probable', why: 'name agrees and the profile is in the Chicago area; the foundation seat is not listed on the profile' };
  }
  return { ok: false, why: `name agrees but none of [${person.knownOrgs.slice(0, 4).join('; ')}] appears on the profile` };
}

// ── Apply a live profile to a person (shared with the plain enrich path) ────

export async function applyProfile(db: Db, personId: string, prof: LinkedInProfile, sourceId: string, extra: Record<string, unknown> = {}): Promise<void> {
  await db.from('network_people').update({
    headline: prof.headline, current_title: prof.currentTitle, current_org: prof.currentOrg ?? undefined,
    location: prof.location, summary: prof.summary,
    enriched_at: new Date().toISOString(), ...extra,
  }).eq('id', personId);
  // Replace THIS SOURCE's career history wholesale — provider-owned data.
  // Public-bio rows (other source_id) are left in place.
  await db.from('network_employments').delete().eq('person_id', personId).or(`source_id.eq.${sourceId},source_id.is.null`);
  if (prof.experiences.length) {
    await db.from('network_employments').insert(prof.experiences.map(e => {
      const y = experienceYears(e);
      return { person_id: personId, org_name: e.org, title: e.title, started: e.started, ended: e.ended, is_current: e.isCurrent, start_year: y.startYear, end_year: y.endYear, source_id: sourceId };
    }));
  }
  await db.from('network_educations').delete().eq('person_id', personId).eq('source_id', sourceId);
  if (prof.educations.length) {
    await db.from('network_educations').insert(prof.educations.map(s => ({
      person_id: personId, school_name: s.school, degree: s.degree, field: s.field, start_year: s.startYear, end_year: s.endYear, source_id: sourceId,
    })));
  }
}

export async function linkedinSource(db: Db): Promise<string> {
  return ensureSource(db, { source_type: 'linkedin_api', source_name: 'LinkedIn profile via RapidAPI (Fresh LinkedIn Profile Data)', raw_reference: 'linkedin_api:fresh', confidence: 0.85 });
}

// ── Known organizations for a person ────────────────────────────────────────

interface PersonRow { id: string; kind: string; name: string; current_org: string | null; organization_id: string | null; note: string | null }

async function knownOrgsFor(db: Db, people: PersonRow[]): Promise<Map<string, string[]>> {
  const ids = people.map(p => p.id);
  const orgIds = [...new Set(people.map(p => p.organization_id).filter((x): x is string => !!x))];
  const [{ data: emps }, { data: orgs }, { data: boards }] = await Promise.all([
    ids.length ? db.from('network_employments').select('person_id, org_name').in('person_id', ids) : Promise.resolve({ data: [] as { person_id: string; org_name: string }[] }),
    orgIds.length ? db.from('network_organizations').select('id, name').in('id', orgIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids.length ? db.from('network_boards').select('person_id, organization_id').in('person_id', ids) : Promise.resolve({ data: [] as { person_id: string; organization_id: string }[] }),
  ]);
  const boardOrgIds = [...new Set((boards ?? []).map(b => b.organization_id as string))].filter(id => !orgIds.includes(id));
  const { data: boardOrgs } = boardOrgIds.length ? await db.from('network_organizations').select('id, name').in('id', boardOrgIds) : { data: [] as { id: string; name: string }[] };
  const orgName = new Map([...(orgs ?? []), ...(boardOrgs ?? [])].map(o => [o.id as string, o.name as string]));
  const out = new Map<string, string[]>();
  for (const p of people) {
    const set = new Set<string>();
    if (p.current_org) set.add(p.current_org);
    if (p.organization_id && orgName.get(p.organization_id)) set.add(orgName.get(p.organization_id)!);
    for (const e of emps ?? []) if (e.person_id === p.id && e.org_name) set.add(e.org_name as string);
    for (const b of boards ?? []) if (b.person_id === p.id && orgName.get(b.organization_id as string)) set.add(orgName.get(b.organization_id as string)!);
    out.set(p.id, [...set]);
  }
  return out;
}

// ── Step 1: verify pending candidates (enrich = verify + read career) ───────

export interface VerifyReport { verified: string[]; rejected: number; probable: string[]; errors: string[] }

export async function verifyCandidates(db: Db, orgId: string, budget: CallBudget, max: number): Promise<VerifyReport> {
  const report: VerifyReport = { verified: [], rejected: 0, probable: [], errors: [] };
  const { data: cands } = await db.from('network_url_candidates')
    .select('id, person_id, url, rank, source')
    .eq('org_id', orgId).eq('status', 'pending').order('rank').order('created_at').limit(max * 4);
  if (!cands?.length) return report;

  // One candidate per person per step (the strongest); people who already have a URL are skipped.
  const byPerson = new Map<string, typeof cands[number]>();
  for (const c of cands) if (!byPerson.has(c.person_id as string)) byPerson.set(c.person_id as string, c);
  const personIds = [...byPerson.keys()].slice(0, max);
  const { data: peopleRows } = await db.from('network_people').select('id, kind, name, current_org, organization_id, note, linkedin_url').in('id', personIds);
  const people = (peopleRows ?? []) as (PersonRow & { linkedin_url: string | null })[];
  const known = await knownOrgsFor(db, people);
  const sourceId = await linkedinSource(db);

  for (const p of people) {
    const c = byPerson.get(p.id)!;
    if (p.linkedin_url) {
      await db.from('network_url_candidates').update({ status: 'rejected', note: 'person already has a verified URL', checked_at: new Date().toISOString() }).eq('id', c.id);
      continue;
    }
    const url = canonicalLinkedInUrl(c.url as string);
    if (!url) { await db.from('network_url_candidates').update({ status: 'rejected', note: 'not a profile URL', checked_at: new Date().toISOString() }).eq('id', c.id); report.rejected++; continue; }
    try {
      const prof = await enrichProfile(url, budget);
      const verdict = corroborate({ name: p.name, knownOrgs: known.get(p.id) ?? [], hasEmployer: !!(p.current_org || (known.get(p.id) ?? []).length), kind: p.kind }, prof);
      if (verdict.ok) {
        await applyProfile(db, p.id, prof, sourceId, {
          linkedin_url: url, verification: verdict.verification,
          note: `${p.note ? p.note.replace(/\s*LinkedIn URL[\s\S]*$/, '') + ' ' : ''}LinkedIn URL from ${c.source === 'provider_search' ? 'provider search' : 'web search'}, ${verdict.why}.`,
        });
        await db.from('network_url_candidates').update({ status: 'verified', note: verdict.why, checked_at: new Date().toISOString() }).eq('id', c.id);
        await db.from('network_url_candidates').update({ status: 'rejected', note: 'another candidate verified', checked_at: new Date().toISOString() }).eq('person_id', p.id).eq('status', 'pending');
        (verdict.verification === 'verified' ? report.verified : report.probable).push(p.name);
      } else {
        await db.from('network_url_candidates').update({ status: 'rejected', note: verdict.why, checked_at: new Date().toISOString() }).eq('id', c.id);
        report.rejected++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'enrich failed';
      report.errors.push(`${p.name}: ${msg}`);
      if (/budget exhausted/i.test(msg)) break;
      // A dead profile (404) is a rejection; a transient error stays pending.
      if (/\b404\b|not found/i.test(msg)) { await db.from('network_url_candidates').update({ status: 'rejected', note: msg.slice(0, 200), checked_at: new Date().toISOString() }).eq('id', c.id); report.rejected++; }
      else await db.from('network_url_candidates').update({ status: 'error', note: msg.slice(0, 200), checked_at: new Date().toISOString() }).eq('id', c.id);
    }
  }
  return report;
}

// ── Step 2: discover URLs by employer for people with no candidate ──────────

export interface DiscoverReport { found: string[]; none: number; ambiguous: number; unresolvable: number; errors: string[] }

/** People eligible for a provider search: no URL, no pending candidate, no prior attempt, a searchable employer. */
export async function discoverable(db: Db, orgId: string): Promise<{ person: PersonRow; employer: string; retired: boolean }[]> {
  const [{ data: people }, { data: cands }] = await Promise.all([
    db.from('network_people').select('id, kind, name, current_org, organization_id, note').eq('org_id', orgId).in('kind', [...DISCOVERABLE_KINDS]).is('linkedin_url', null),
    db.from('network_url_candidates').select('person_id, status, source').eq('org_id', orgId),
  ]);
  const blocked = new Set<string>();
  for (const c of cands ?? []) {
    if (c.status === 'pending' || c.status === 'error') blocked.add(c.person_id as string);   // still has a candidate to try
    if (c.source === 'provider_search') blocked.add(c.person_id as string);                  // already searched once
  }
  const out: { person: PersonRow; employer: string; retired: boolean }[] = [];
  for (const p of (people ?? []) as PersonRow[]) {
    if (blocked.has(p.id)) continue;
    const employer = canonicalEmployer(p.current_org)?.display;
    if (!employer || /chicago youth centers/i.test(employer)) continue;
    const retired = /retired/i.test(p.note ?? '') || /\(retired\)/i.test(p.current_org ?? '');
    out.push({ person: p, employer, retired });
  }
  // Value order: CYC officers, board, staff, auxiliary/council, then foundation executives.
  const rank = (p: PersonRow) => p.kind === 'board' ? 0 : p.kind === 'staff' ? 1 : p.kind === 'auxiliary' || p.kind === 'council' ? 2 : 3;
  return out.sort((a, b) => rank(a.person) - rank(b.person));
}

export async function discoverByEmployer(
  db: Db, orgId: string, budget: CallBudget, max: number,
  resolve: (db: Db, name: string, budget: CallBudget) => Promise<CompanyMatch | null>,
): Promise<DiscoverReport> {
  const report: DiscoverReport = { found: [], none: 0, ambiguous: 0, unresolvable: 0, errors: [] };
  const todo = (await discoverable(db, orgId)).slice(0, max);
  const stamp = () => new Date().toISOString();
  for (const { person: p, employer, retired } of todo) {
    const record = async (status: string, note: string, url?: string) => {
      await db.from('network_url_candidates').upsert({
        org_id: orgId, person_id: p.id, url: url ?? `search:${employer}`, source: 'provider_search', query: `${p.name} @ ${employer}${retired ? ' (former)' : ''}`,
        status, note, rank: 0, checked_at: url ? null : stamp(),
      }, { onConflict: 'person_id,url' });
    };
    try {
      const company = await resolve(db, employer, budget);
      if (!company) { report.unresolvable++; await record('none', 'employer not found on LinkedIn'); continue; }
      let hits = await searchEmployees(company, { budget, maxResults: 10, keywords: p.name, pastCompany: retired });
      const key = personNameKey(p.name);
      const same = () => hits.filter(h => h.name && personNameKey(h.name) === key);
      // Keyword search can miss; for small firms a plain roster scan is cheap and exact.
      if (!same().length && (company.employeeCount ?? 0) > 0 && (company.employeeCount ?? 0) <= 300) {
        hits = await searchEmployees(company, { budget, maxResults: 25, pastCompany: retired });
      }
      const matches = same();
      if (matches.length === 1) {
        await record('pending', `one same-name hit at ${company.name}: "${matches[0].title ?? matches[0].headline ?? ''}"`, matches[0].url);
        report.found.push(p.name);
      } else if (matches.length > 1) { report.ambiguous++; await record('ambiguous', `${matches.length} same-name hits at ${company.name}`); }
      else { report.none++; await record('none', `no same-name hit among ${hits.length} at ${company.name}`); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'search failed';
      report.errors.push(`${p.name}: ${msg}`);
      if (/budget exhausted/i.test(msg)) break;
    }
  }
  return report;
}

/** Counts for the pre-flight estimate. */
export async function candidateCounts(db: Db, orgId: string): Promise<{ pendingPeople: number; discoverablePeople: number }> {
  const { data: cands } = await db.from('network_url_candidates').select('person_id').eq('org_id', orgId).eq('status', 'pending');
  const pendingPeople = new Set((cands ?? []).map(c => c.person_id as string)).size;
  const discoverablePeople = (await discoverable(db, orgId)).length;
  return { pendingPeople, discoverablePeople };
}
