// Board foundation-connections survey → the relationship graph and leads.
//
// Each answer says "this board member knows this foundation" (optionally:
// through whom, how, and whether they would introduce). The file can be a
// forms export (Microsoft Forms, Google Forms, SurveyMonkey) or a sheet the
// team typed up, in either shape:
//   long:   one row per member and foundation (or several foundations in one
//           cell, separated by semicolons or new lines — how a multi-select
//           question exports);
//   matrix: one row per member, one column per foundation, any non-blank
//           "yes"-type answer meaning they know it.
// On commit every answer becomes a person → foundation edge (source_type
// 'board_survey'; a survey re-upload replaces the earlier answers for the
// members in it) and the direct-connection generator turns them into
// warm-introduction leads at once. Foundations not yet in the graph are added.

import * as XLSX from 'xlsx';
import type { createServerClient } from '@/lib/supabase';
import { readWorkbook } from '@/lib/instrumentl-import';
import { normalizeOrgName, personNameKey } from '@/lib/network/normalize';
import { resolveFunderNode } from '@/lib/known-funders';
import { syncDirectConnectionLeads, type DirectReport } from '@/lib/network/direct-paths';

type Db = ReturnType<typeof createServerClient>;

export const SURVEY_SOURCE = 'board_survey';
const OWN = ['board', 'auxiliary', 'council', 'staff'];

export interface SurveyAnswer { member: string; foundation: string; contact: string | null; relationship: string | null; willing: boolean | null; notes: string | null }
export interface SurveyParse { answers: SurveyAnswer[]; shape: 'long' | 'matrix'; respondents: number; columns: Record<string, string | null> }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cell = (v: unknown) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s || null; };
const has = (h: string, words: string[]) => words.some(w => h.includes(w));
const YES = /^(y|yes|x|✓|✔|true|1|know|known|connected|i know|personal|professional|friend|colleague|acquaint)/i;
const NO = /^(n|no|none|n\/a|na|-|—|false|0|not|don.?t|do not|unsure|no connection)$/i;

/** Split a multi-select or typed list of foundations without breaking "Foundation, Inc." */
export function splitFoundations(v: string): string[] {
  return v.replace(/,\s*(inc|llc|nfp|ltd)\.?\b/gi, ' $1').split(/\s*(?:;|\n|\r|\s\|\s)\s*/).flatMap(s => (s.split(',').every(p => p.trim().split(/\s+/).length >= 2) ? s.split(',') : [s]))
    .map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(s => s.length > 2 && !NO.test(s));
}

/** Yes → true, no → false, maybe or anything else → unknown. */
export function truthyWilling(v: string | null): boolean | null {
  if (v == null) return null;
  if (/^(y|yes|sure|definitely|happy|willing|absolutely|of course)/i.test(v)) return true;
  if (/^(maybe|possibly|depends|perhaps)/i.test(v)) return null;
  if (/^(n|no|not)\b/i.test(v)) return false;
  return null;
}

export function parseSurvey(buffer: Buffer): SurveyParse {
  const wb = readWorkbook(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The workbook has no sheets');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
  let hi = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i++) if ((grid[i] ?? []).map(norm).some(h => has(h, ['foundation', 'funder', 'organization']))) { hi = i; break; }
  if (hi < 0) throw new Error('No foundation column found. Head one column "Foundation" (or "Foundations you know") and one "Board member" (or "Your name").');
  const header = (grid[hi] ?? []).map(v => String(v ?? ''));
  const h = header.map(norm);
  const idx = (pred: (s: string) => boolean) => h.findIndex(pred);
  const member = idx(s => ['board member', 'board member name', 'your name', 'name', 'full name', 'respondent', 'respondent name', 'member', 'director', 'member name'].includes(s)) >= 0
    ? idx(s => ['board member', 'board member name', 'your name', 'name', 'full name', 'respondent', 'respondent name', 'member', 'director', 'member name'].includes(s))
    : idx(s => has(s, ['your name', 'board member', 'respondent']) || /\bname\b/.test(s) && !has(s, ['foundation', 'organization', 'funder', 'contact', 'person you know', 'trustee']));
  if (member < 0) throw new Error('No board member column found. Head it "Board member" or "Your name".');
  const isQ = (s: string) => has(s, ['how do you know', 'how you know', 'how are you', 'relationship', 'willing', 'introduc', 'comfortable', 'contact', 'who do you know', 'who you know', 'person you know', 'trustee', 'note', 'comment', 'your company', 'your organization', 'your employer']);
  const foundationCols = h.map((s, i) => ({ s, i })).filter(x => x.i !== member && has(x.s, ['foundation', 'funder', 'organization', 'philanthrop', 'trust', 'fund']) && !isQ(x.s));
  const contact = idx(s => has(s, ['contact', 'who do you know', 'who you know', 'person you know', 'trustee', 'board member there', 'who at']));
  const relationship = idx(s => has(s, ['how do you know', 'how you know', 'relationship', 'connection type', 'nature of', 'how are you connected', 'how ']) && !has(s, ['willing', 'introduc']));
  const willing = idx(s => has(s, ['willing', 'introduc', 'comfortable', 'would you']));
  const notes = idx(s => has(s, ['note', 'comment', 'anything else']));
  const answers: SurveyAnswer[] = [];
  const respondents = new Set<string>();
  // Matrix: several columns that each name a foundation (the header is the foundation).
  const matrix = foundationCols.length >= 3 && foundationCols.every(c => !/^(foundation|foundations|funder|funders|organization|organizations)( name)?s?$/.test(c.s) && !/which|list|know/.test(c.s));
  for (const r of grid.slice(hi + 1)) {
    const m = cell(r[member]);
    if (!m) continue;
    respondents.add(personNameKey(m));
    const base = { member: m, contact: contact >= 0 ? cell(r[contact]) : null, relationship: relationship >= 0 ? cell(r[relationship]) : null, willing: willing >= 0 ? truthyWilling(cell(r[willing])) : null, notes: notes >= 0 ? cell(r[notes]) : null };
    if (matrix) {
      for (const c of foundationCols) {
        const v = cell(r[c.i]);
        if (!v || NO.test(v)) continue;
        answers.push({ ...base, foundation: header[c.i].trim(), relationship: YES.test(v) && v.length <= 4 ? base.relationship : v });
      }
    } else {
      for (const c of foundationCols) { const v = cell(r[c.i]); if (!v) continue; for (const f of splitFoundations(v)) answers.push({ ...base, foundation: f }); }
    }
  }
  if (!answers.length) throw new Error('The file has respondents but no foundations named.');
  const col = (i: number) => (i >= 0 ? header[i] : null);
  return { answers, shape: matrix ? 'matrix' : 'long', respondents: respondents.size, columns: { member: col(member), foundation: matrix ? `${foundationCols.length} foundation columns` : col(foundationCols[0]?.i ?? -1), contact: col(contact), relationship: col(relationship), willing: col(willing) } };
}

interface Own { id: string; name: string; kind: string; board_role: string | null }
const looseKey = (n: string) => { const t = personNameKey(n).split(' ').filter(Boolean); return t.length >= 2 ? `${t[0]} ${t[t.length - 1]}` : t.join(' '); };

export interface SurveyPreview {
  shape: 'long' | 'matrix'; columns: SurveyParse['columns']; respondents: number; answers: number;
  members_matched: number; members_unmatched: string[];
  foundations: number; foundations_in_graph: number; foundations_new: string[];
  willing: number; sample: Array<{ member: string; foundation: string; detail: string | null }>;
}

async function plan(db: Db, orgId: string, buffer: Buffer) {
  const parsed = parseSurvey(buffer);
  const { data } = await db.from('network_people').select('id, name, kind, board_role').eq('org_id', orgId).in('kind', OWN);
  const own = (data ?? []) as Own[];
  const memberOf = new Map<string, Own | null>();
  for (const a of parsed.answers) {
    const k = personNameKey(a.member);
    if (memberOf.has(k)) continue;
    const exact = own.filter(p => personNameKey(p.name) === k);
    const near = exact.length ? exact : own.filter(p => looseKey(p.name) === looseKey(a.member));
    memberOf.set(k, near.length === 1 ? near[0] : null);
  }
  const fNames = [...new Map(parsed.answers.map(a => [normalizeOrgName(a.foundation), a.foundation])).entries()].filter(([k]) => k);
  const nodeOf = new Map<string, { id: string; name: string } | null>();
  for (const [k] of fNames) nodeOf.set(k, await resolveFunderNode(db, k));
  return { parsed, memberOf, fNames, nodeOf };
}

export async function previewSurvey(db: Db, orgId: string, buffer: Buffer): Promise<SurveyPreview> {
  const { parsed, memberOf, fNames, nodeOf } = await plan(db, orgId, buffer);
  const members = [...new Map(parsed.answers.map(a => [personNameKey(a.member), a.member])).entries()];
  return {
    shape: parsed.shape, columns: parsed.columns, respondents: parsed.respondents, answers: parsed.answers.length,
    members_matched: members.filter(([k]) => memberOf.get(k)).length, members_unmatched: members.filter(([k]) => !memberOf.get(k)).map(([, n]) => n),
    foundations: fNames.length, foundations_in_graph: fNames.filter(([k]) => nodeOf.get(k)).length, foundations_new: fNames.filter(([k]) => !nodeOf.get(k)).map(([, n]) => n).slice(0, 30),
    willing: parsed.answers.filter(a => a.willing === true).length,
    sample: parsed.answers.slice(0, 10).map(a => ({ member: a.member, foundation: a.foundation, detail: [a.contact, a.relationship, a.willing === true ? 'willing to introduce' : null].filter(Boolean).join(' · ') || null })),
  };
}

export interface SurveyCommit { connections: number; members: number; foundations_added: number; skipped_members: string[]; leads: DirectReport; preview: SurveyPreview }

const strengthFor = (rel: string | null) => (!rel ? 60 : /close|friend|family|personal|well|serve|served|board/i.test(rel) ? 80 : /acquaint|met|know of|loose|casual/i.test(rel) ? 40 : 60);

export async function commitSurvey(db: Db, orgId: string, buffer: Buffer): Promise<SurveyCommit> {
  const preview = await previewSurvey(db, orgId, buffer);
  const { parsed, memberOf, nodeOf } = await plan(db, orgId, buffer);
  const { data: src } = await db.from('network_sources').select('id').eq('raw_reference', `board survey:${orgId}`).maybeSingle();
  const now = new Date().toISOString();
  const sourceId = src?.id as string | undefined ?? (await db.from('network_sources').insert({ source_type: 'cyc_workbook', source_name: 'Board foundation-connections survey', raw_reference: `board survey:${orgId}`, retrieved_at: now, confidence: 0.85 }).select('id').single()).data?.id as string | undefined;
  if (src?.id) await db.from('network_sources').update({ retrieved_at: now }).eq('id', src.id);

  // A re-upload replaces the earlier answers of the members in this file.
  const memberIds = [...new Set([...memberOf.values()].filter((x): x is Own => !!x).map(p => p.id))];
  for (let i = 0; i < memberIds.length; i += 100) await db.from('network_relationships').delete().eq('org_id', orgId).eq('source_type', SURVEY_SOURCE).in('source_person_id', memberIds.slice(i, i + 100));

  let connections = 0, added = 0;
  const skipped = new Set<string>();
  const seen = new Set<string>();
  for (const a of parsed.answers) {
    const p = memberOf.get(personNameKey(a.member));
    if (!p) { skipped.add(a.member); continue; }
    const fk = normalizeOrgName(a.foundation);
    let node = nodeOf.get(fk) ?? null;
    if (!node) {
      const { data: r } = await db.rpc('network_resolve_cultivation_org', { p_name: a.foundation, p_ein: null, p_funder_type: null, p_source: sourceId ?? null });
      const row = (Array.isArray(r) ? r[0] : r) as { o_id?: string; o_created?: boolean } | null;
      if (!row?.o_id) continue;
      node = { id: row.o_id, name: a.foundation }; nodeOf.set(fk, node); if (row.o_created) added++;
    }
    const key = `${p.id}|${node.id}`;
    if (seen.has(key)) continue; seen.add(key);
    const { error } = await db.from('network_relationships').insert({
      org_id: orgId, relationship_type: 'existing_cyc_relationship', source_person_id: p.id, target_organization_id: node.id,
      relationship_strength: strengthFor(a.relationship), confidence: 0.85, verification: 'verified', source_type: SURVEY_SOURCE, source_id: sourceId ?? null, observed_at: now,
      evidence: { summary: `${p.name} reported knowing ${node.name}${a.contact ? ` through ${a.contact}` : ''}${a.relationship ? ` (${a.relationship})` : ''} in the board connections survey`, relationship: a.relationship, contact: a.contact, willing: a.willing, notes: a.notes, survey_at: now },
    });
    if (!error) connections++;
  }
  const leads = await syncDirectConnectionLeads(db, orgId);
  return { connections, members: memberIds.length, foundations_added: added, skipped_members: [...skipped], leads, preview };
}
