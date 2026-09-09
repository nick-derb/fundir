// Public-bio career extraction (D4) — the LinkedIn-independent source.
//
// A public page (a foundation's trustee bio, CYC's own leadership page, a firm
// bio) is fetched, reduced to text, and handed to Claude with a strict
// contract: return ONLY what the text states, as structured JSON, nulls where
// the page is silent. Every stored employment / education / board seat cites
// the page URL as its source. Professional information only — no personal
// details are requested, extracted or stored.

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { ensureOrganization, ensureSource } from '@/lib/network/bridge';
import { orgTypeOf, clean, canonicalEmployer } from '@/lib/network/normalize';

const MODEL = 'claude-sonnet-4-6';
const MAX_TEXT = 14_000;

export interface BioEmployment { org: string; title: string | null; start_year: number | null; end_year: number | null; is_current: boolean }
export interface BioEducation { school: string; degree: string | null; field: string | null; start_year: number | null; end_year: number | null }
export interface BioBoard { org: string; title: string | null; is_current: boolean }
export interface BioExtraction {
  name: string;
  current_title: string | null;
  current_org: string | null;
  location: string | null;
  employments: BioEmployment[];
  educations: BioEducation[];
  boards: BioBoard[];
  /** Model's own note on what the page did NOT say — surfaced to the reviewer. */
  gaps: string[];
}

/** Fetch a public page and strip it to readable text (no scripts, no nav soup). */
export async function fetchPublicText(url: string): Promise<{ text: string; title: string | null }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FundirBot/1.0 (+https://www.fundir.ai)' } });
  if (!res.ok) throw new Error(`Fetch ${res.status} for ${url}`);
  const html = await res.text();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6]|tr|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { text: text.slice(0, MAX_TEXT), title };
}

const SYSTEM = `You extract PROFESSIONAL biography facts for a relationship-intelligence tool used by a nonprofit's development team.
Rules — these are hard constraints:
- Use ONLY facts stated in the provided page text. Never infer, guess, or fill from general knowledge.
- If the page does not state a value, output null. If a section is absent, output an empty array.
- Employers: one entry per organization named as an employer of THIS person, with the title if stated and years if stated (integers) — is_current true only if the text says they currently hold it.
- Boards: nonprofit, foundation, corporate or civic board seats named for this person.
- Educations: institutions named as this person's schools.
- Do NOT extract or mention: home address, personal phone, personal email, family members, age, health, religion, politics, or any non-professional detail.
- Output strictly the JSON object requested. No prose.`;

/** Ask Claude for the structured bio of one named person from page text. */
export async function extractBio(input: { url: string; text: string; personName: string }): Promise<BioExtraction | null> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1800, temperature: 0, system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Person of interest: "${input.personName}"\nPage URL: ${input.url}\n\nPAGE TEXT:\n"""\n${input.text}\n"""\n\nIf this page does not describe "${input.personName}", return {"name": null}.\nOtherwise return JSON exactly of the shape:\n{"name": string, "current_title": string|null, "current_org": string|null, "location": string|null,\n "employments": [{"org": string, "title": string|null, "start_year": number|null, "end_year": number|null, "is_current": boolean}],\n "educations": [{"school": string, "degree": string|null, "field": string|null, "start_year": number|null, "end_year": number|null}],\n "boards": [{"org": string, "title": string|null, "is_current": boolean}],\n "gaps": [string]}`,
    }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!parsed.name) return null;
  const yr = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null; };
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? clean(v) : null);
  return {
    name: clean(parsed.name),
    current_title: s(parsed.current_title), current_org: s(parsed.current_org), location: s(parsed.location),
    employments: (Array.isArray(parsed.employments) ? parsed.employments : []).flatMap((e: Record<string, unknown>) => {
      const org = s(e.org); if (!org) return [];
      return [{ org, title: s(e.title), start_year: yr(e.start_year), end_year: yr(e.end_year), is_current: e.is_current === true }];
    }),
    educations: (Array.isArray(parsed.educations) ? parsed.educations : []).flatMap((e: Record<string, unknown>) => {
      const school = s(e.school); if (!school) return [];
      return [{ school, degree: s(e.degree), field: s(e.field), start_year: yr(e.start_year), end_year: yr(e.end_year) }];
    }),
    boards: (Array.isArray(parsed.boards) ? parsed.boards : []).flatMap((b: Record<string, unknown>) => {
      const org = s(b.org); if (!org) return [];
      return [{ org, title: s(b.title), is_current: b.is_current !== false }];
    }),
    gaps: (Array.isArray(parsed.gaps) ? parsed.gaps : []).map(g => String(g)).slice(0, 6),
  };
}

export interface ApplyBioReport { employments: number; educations: number; boards: number; source_id: string }

/**
 * Store an extraction against a person, citing the page. Public-bio facts sit
 * alongside LinkedIn facts (different source_id) rather than replacing them;
 * the edge derivation treats both as cited.
 */
export async function applyBio(orgId: string, personId: string, bio: BioExtraction, page: { url: string; title: string | null }): Promise<ApplyBioReport> {
  const db = createServerClient();
  const sourceId = await ensureSource(db, {
    source_type: 'public_bio', source_name: page.title ? `Public bio — ${page.title}` : `Public bio — ${new URL(page.url).hostname}`,
    raw_reference: `bio:${page.url}`, source_url: page.url, confidence: 0.85,
  });

  // Replace only THIS source's prior rows for the person (re-extraction is idempotent).
  await db.from('network_employments').delete().eq('person_id', personId).eq('source_id', sourceId);
  await db.from('network_educations').delete().eq('person_id', personId).eq('source_id', sourceId);

  let emp = 0, edu = 0, brd = 0;
  for (const e of bio.employments) {
    // Alias-aware display name so "Tribune Publishing" and "Chicago Tribune" land on one node.
    const display = canonicalEmployer(e.org)?.display ?? e.org;
    const org = await ensureOrganization(db, { name: display, type: orgTypeOf(display), sourceId, confidence: 0.7 });
    const { error } = await db.from('network_employments').insert({
      person_id: personId, org_name: e.org, organization_id: org.id, title: e.title,
      started: e.start_year ? String(e.start_year) : null, ended: e.is_current ? null : (e.end_year ? String(e.end_year) : null),
      start_year: e.start_year, end_year: e.is_current ? null : e.end_year, is_current: e.is_current, source_id: sourceId,
    });
    if (!error) emp++;
  }
  for (const s of bio.educations) {
    const org = await ensureOrganization(db, { name: s.school, type: 'university', sourceId, confidence: 0.7 });
    const { error } = await db.from('network_educations').insert({
      person_id: personId, school_name: s.school, organization_id: org.id, degree: s.degree, field: s.field,
      start_year: s.start_year, end_year: s.end_year, source_id: sourceId,
    });
    if (!error) edu++;
  }
  for (const b of bio.boards) {
    const org = await ensureOrganization(db, { name: b.org, type: orgTypeOf(b.org), sourceId, confidence: 0.7 });
    const { data: exists } = await db.from('network_boards').select('id').eq('person_id', personId).eq('organization_id', org.id).eq('title', b.title ?? 'Board member').maybeSingle();
    if (exists) continue;
    const { error } = await db.from('network_boards').insert({
      person_id: personId, organization_id: org.id, title: b.title ?? 'Board member', is_current: b.is_current, source_id: sourceId, confidence: 0.8,
    });
    if (!error) brd++;
  }

  // Coarse current role from the bio only fills blanks — LinkedIn or the page roster may already be finer.
  const { data: p } = await db.from('network_people').select('current_title, current_org, location, enriched_at').eq('id', personId).maybeSingle();
  const patch: Record<string, unknown> = {};
  if (p && !p.current_title && bio.current_title) patch.current_title = bio.current_title;
  if (p && !p.current_org && bio.current_org) patch.current_org = bio.current_org;
  if (p && !p.location && bio.location) patch.location = bio.location;
  if (Object.keys(patch).length) await db.from('network_people').update(patch).eq('id', personId);

  return { employments: emp, educations: edu, boards: brd, source_id: sourceId };
}
