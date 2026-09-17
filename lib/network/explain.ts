// Phase 7 — "Why this lead?" explanations bound to evidence ids.
//
// The model's job is prose, not facts: it receives a numbered evidence pack
// and must cite an item for every bullet. A validator then checks each bullet
// mechanically — cited ids exist; every number appears in the cited evidence;
// every multi-word proper name appears in the cited evidence; no forbidden
// claims (personal relationships, promises, "never funded"); and a bullet
// resting only on inferred evidence must say so. Bullets that fail are
// dropped and recorded, never rewritten. A deterministic composer produces
// the same structure with no model at all, so every lead has an explanation
// whether or not it was worth a model call.

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { buildEvidencePacks, sourceLabel, type EvidencePack, type EvidenceItem } from '@/lib/network/evidence';
import { PROGRAM_TERMS, POPULATION_TERMS, CHICAGO_TERMS } from '@/lib/network/scoring';

type Db = ReturnType<typeof createServerClient>;
export const GENERATOR = 'explain:v1';
const MODEL = 'claude-sonnet-4-6';
// Sonnet 4.6 list price, USD per token.
const PRICE_IN = 3 / 1_000_000, PRICE_OUT = 15 / 1_000_000;

export const SECTION_HEADINGS = ['Funding fit', 'Program fit', 'Geographic fit', 'Relationship', 'Accessibility', 'Risks and unknowns'] as const;
export type SectionHeading = typeof SECTION_HEADINGS[number];

export interface Bullet { text: string; evidence: string[] }
export interface Section { heading: SectionHeading; bullets: Bullet[] }
export interface Explanation {
  generator: typeof GENERATOR;
  method: 'model' | 'deterministic';
  model: string | null;
  generated_at: string;
  input_hash: string;
  thesis: string;                              // 2–3 sentences, cites [E#]
  sections: Section[];
  recommended_action: Bullet;
  confidence: string;                          // evidence_confidence at generation time
  confidence_note: string;
  sources: Array<{ id: string; kind: string; source_type: string | null; source_url: string | null; verification: string | null; text: string }>;
  validation: { bullets_total: number; bullets_kept: number; dropped: Array<{ text: string; reason: string }>; raw_head?: string };
  draft?: Record<string, unknown>;             // the model's parsed output, kept so validation can be re-run without another call
  cost_usd: number;
}

// ── Validation ──────────────────────────────────────────────────────────────
const FORBIDDEN = [
  /never funded|has not funded|hasn'?t funded|does not fund|doesn'?t fund|no history of funding/i,
  /\b(is|are|was|were) (close )?friends?\b|personally knows?|knows (him|her|them)|close relationship|personal relationship with|on good terms/i,
  /\bwill introduce\b|has agreed|is willing|would be happy|is likely to fund|will fund|guarantee/i,
  /\bis connected to\b|\bare connected\b|\bhas a relationship with\b|\b(his|her|their) (personal )?(relationship|friendship) with\b/i,
];
const HEDGE = /inferred|not documented|unverified|undated|may have|appears|possibly|unconfirmed|not confirmed|seed list|uncited/i;
const STOP_CAPS = new Set(['CYC', 'Fundir', 'Chicago', 'Illinois', 'IRS', 'CRA', 'NFP', 'STEM', 'Vice', 'Executive', 'Secretary', 'Treasurer', 'Managing', 'Senior', 'Chief', 'CEO', 'CFO', 'COO', 'Dr', 'Mr', 'Ms', 'Mrs', 'PhD', 'Grantees', 'Grantee', 'Trustees', 'Directors', 'Officers', 'Key', 'Peer', 'Peers', 'The', 'A', 'An', 'In', 'On', 'At', 'For', 'Of', 'And', 'Its', 'This', 'These', 'Both', 'No', 'Not', 'Per', 'Ask', 'Consider', 'Request', 'Research', 'Confirm', 'Identify', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Foundation', 'Inc', 'LLC', 'LLP', 'Board', 'Director', 'Chair', 'Chairman', 'President', 'Trustee', 'Officer', 'Program', 'Youth', 'Family', 'Community', 'Bank', 'Company', 'Group']);

/** Numbers as the reader sees them: 150k, $1.2M, 2,500, 2013. Returned as canonical numeric values. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\$?(\d[\d,]*(?:\.\d+)?)\s*([kKmM](?![a-zA-Z]))?/g)) {
    // "IRS 990", "Form 990-PF", "Schedule I": identifiers, not quantities.
    const before = text.slice(Math.max(0, m.index! - 12), m.index!), after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 8);
    if (/(IRS|Form|Schedule)\s*$/i.test(before) || /^\s*-?PF\b|^s\b|^\s*(filing|data|form)/i.test(after)) continue;
    let n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (m[2]) n *= /k/i.test(m[2]) ? 1_000 : 1_000_000;
    out.push(n);
  }
  return out;
}

/** Multi-word capitalised phrases: the names a bullet asserts. */
export function namesIn(text: string): string[] {
  const out: string[] = [];
  const CONNECTOR = /^(of|and|&|the|for|de|von|van)$/i;
  const bare = (w: string) => w.replace(/['’]s$/, '').replace(/[.,'’"“”]/g, '');
  // A period after a lowercase letter or a closing bracket ends a sentence ("Musil. No CYC…"); "R." does not.
  for (const sentence of text.split(/(?<=[a-z)\]])[.!?]\s+(?=[A-Z])/)) {
    for (const m of sentence.matchAll(/\b([A-Z][A-Za-z&.'’-]+(?:\s+(?:of|and|&|the|for|de|von|van)\s+|\s+)[A-Z][A-Za-z&.'’-]+(?:\s+[A-Z][A-Za-z&.'’-]+)*)/g)) {
      // Sentence-initial words ("Ask Phil Doherty"), titles ("Vice President Jim Stoddard") and dangling connectors are not part of the name.
      const parts = m[1].trim().split(/\s+/);
      while (parts.length && (STOP_CAPS.has(bare(parts[0])) || CONNECTOR.test(parts[0]))) parts.shift();
      while (parts.length && (CONNECTOR.test(parts[parts.length - 1]) || STOP_CAPS.has(bare(parts[parts.length - 1])) && parts.length > 2 && /^(No|Not|The|In|On|Ask)$/.test(bare(parts[parts.length - 1])))) parts.pop();
      // "Phil Doherty's Chicago Tribune" is two names joined by a possessive.
      const groups: string[][] = [[]];
      for (const w of parts) { groups[groups.length - 1].push(w); if (/['’]s$/.test(w)) groups.push([]); }
      for (const g of groups.filter(g => g.length)) {
        const words = g.filter(w => !CONNECTOR.test(w));
        if (words.length < 2 || words.every(w => STOP_CAPS.has(bare(w)))) continue;
        // "McCormick Foundation's" is still "McCormick Foundation"; quotes around a name are not part of it.
        out.push(g.join(' ').replace(/['’]s$/, '').replace(/^['’"“]+|['’"”]+$/g, ''));
      }
    }
  }
  return out;
}

/** Inline "[E3]" tokens move out of the prose and into the evidence list (the UI renders citations from the list). */
function normalizeBullet(b: Bullet): Bullet {
  const { text, ids } = splitCitations(b.text);
  return { text, evidence: [...new Set([...b.evidence, ...ids])] };
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[.,;:()"]/g, ' ').replace(/\s+/g, ' ').trim();

/** Split inline citations ("[E3]", "(E4; E7)", "[E4–E6]", bare "E9") out of prose. */
export function splitCitations(raw: string): { text: string; ids: string[] } {
  const ids: string[] = [];
  let text = raw ?? '';
  // Bracketed groups made only of E-ids and separators (ranges expand).
  text = text.replace(/[\[(]\s*E\d+(?:\s*(?:[,;&/]|and|–|-|to)\s*E?\d+)*\s*[\])]/g, m => {
    const nums = m.match(/E?\d+/g) ?? [];
    const isRange = /[–-]|to/.test(m) && nums.length === 2;
    if (isRange) { const [a, z] = nums.map(n => Number(n.replace('E', ''))); for (let i = a; i <= z; i++) ids.push(`E${i}`); }
    else for (const n of nums) ids.push(`E${n.replace('E', '')}`);
    return ' ';
  });
  text = text.replace(/\bE(\d+)\b/g, (_, n) => { ids.push(`E${n}`); return ' '; });
  text = text.replace(/\s+([.,;:])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  return { text, ids: [...new Set(ids)] };
}

export function validateBullet(b: Bullet, items: Map<string, EvidenceItem>, allowedNames: string[]): { ok: true } | { ok: false; reason: string } {
  // Inline citations count as citations and are not numbers.
  const { text, ids: inline } = splitCitations(b.text ?? '');
  if (!text) return { ok: false, reason: 'empty' };
  const cites = [...new Set([...(b.evidence ?? []), ...inline])];
  const ids = cites.filter(id => items.has(id));
  if (!ids.length) return { ok: false, reason: 'no valid evidence citation' };
  if (cites.some(id => !items.has(id))) return { ok: false, reason: `cites unknown evidence ${cites.filter(id => !items.has(id)).join(', ')}` };
  for (const f of FORBIDDEN) {
    if (!f.test(text)) continue;
    // "Ask X whether they are willing…" / "whether they have a personal relationship is unknown" pose the
    // question rather than assert the fact. The "never funded" rule has no such exception.
    if (f !== FORBIDDEN[0] && /\bwhether\b/i.test(text) && /\b(unknown|unconfirmed|not (yet )?(known|confirmed|documented)|ask|confirm)\b/i.test(text)) continue;
    return { ok: false, reason: `forbidden claim: "${text.match(f)?.[0]}"` };
  }
  const cited = ids.map(id => items.get(id)!);
  const citedText = norm(cited.map(i => i.text).join(' '));
  const citedNums = new Set(numbersIn(cited.map(i => i.text).join(' ')));
  for (const n of numbersIn(text)) if (!citedNums.has(n)) return { ok: false, reason: `number ${n} not in cited evidence` };
  const allowed = norm(allowedNames.join(' | '));
  const known = (n: string) => citedText.includes(n) || allowed.includes(n);
  for (const name of namesIn(text)) {
    const n = norm(name);
    if (known(n)) continue;
    // A sentence-initial common word ("Grantees Girls Like Me Project") is not part of the name.
    const rest = n.split(' ').slice(1).join(' ');
    if (rest.includes(' ') && known(rest)) continue;
    // "Doherty and FitzSimons": two surnames joined, each known on its own.
    const sides = n.split(/\s+(?:and|&)\s+/);
    if (sides.length > 1 && sides.every(s => s.split(' ').every(w => w.length > 2 && citedText.includes(w)))) continue;
    return { ok: false, reason: `name "${name}" not in cited evidence` };
  }
  const grades = cited.map(i => i.verification).filter(Boolean);
  if (grades.length && grades.every(g => g === 'inferred') && !HEDGE.test(text)) return { ok: false, reason: 'rests only on inferred evidence but is not hedged' };
  return { ok: true };
}

export function validateExplanation(draft: { thesis?: unknown; sections?: unknown; recommended_action?: unknown; confidence_note?: unknown }, pack: EvidencePack): { thesis: string; sections: Section[]; recommended_action: Bullet; confidence_note: string; validation: Explanation['validation'] } {
  const items = new Map(pack.items.map(i => [i.id, i]));
  const allowedNames = ['CYC', 'Chicago Youth Centers', 'Fundir', pack.target.name, pack.via?.name, pack.trustee?.name].filter(Boolean) as string[];
  const dropped: Explanation['validation']['dropped'] = [];
  let total = 0, kept = 0;
  const sections: Section[] = [];
  for (const raw of Array.isArray(draft.sections) ? draft.sections : []) {
    const s = raw as { heading?: unknown; bullets?: unknown };
    const heading = SECTION_HEADINGS.find(h => h.toLowerCase() === String(s.heading ?? '').toLowerCase().replace(/&/g, 'and').trim());
    if (!heading) { for (const b of Array.isArray(s.bullets) ? s.bullets : []) { total++; dropped.push({ text: String((b as Bullet).text ?? ''), reason: `unknown section "${String(s.heading)}"` }); } continue; }
    const bullets: Bullet[] = [];
    for (const raw2 of Array.isArray(s.bullets) ? s.bullets : []) {
      total++;
      const b = { text: String((raw2 as Bullet).text ?? '').trim(), evidence: Array.isArray((raw2 as Bullet).evidence) ? (raw2 as Bullet).evidence.map(String) : [] };
      const v = validateBullet(b, items, allowedNames);
      if (v.ok) { bullets.push(normalizeBullet(b)); kept++; } else dropped.push({ text: b.text, reason: v.reason });
    }
    if (bullets.length) sections.push({ heading, bullets });
  }
  // Thesis: a summary across the pack, so its facts may come from any item — but it must cite at least one, and
  // every number and name must still exist somewhere in the pack.
  const thesisText = String(draft.thesis ?? '').trim();
  const thesisSplit = splitCitations(thesisText);
  const thesisOk = thesisText ? (thesisSplit.ids.length ? validateBullet({ text: thesisSplit.text, evidence: pack.items.map(i => i.id) }, items, allowedNames) : { ok: false as const, reason: 'thesis cites no evidence' }) : null;
  total++;
  const thesis = thesisOk && thesisOk.ok ? thesisText : '';
  if (thesis) kept++; else dropped.push({ text: thesisText, reason: thesisOk ? (thesisOk as { reason: string }).reason : 'empty thesis' });
  // Recommended action: must cite and must be an ask, not a promise.
  const ra = draft.recommended_action as Bullet | undefined;
  let recommended_action: Bullet = { text: '', evidence: [] };
  total++;
  if (ra && typeof ra.text === 'string') {
    const b = { text: ra.text.trim(), evidence: Array.isArray(ra.evidence) ? ra.evidence.map(String) : [] };
    const v = validateBullet(b, items, allowedNames);
    if (v.ok && /^(ask|consider|request|research|confirm|identify|review|explore|prepare|reach out|invite|check)/i.test(b.text)) { recommended_action = normalizeBullet(b); kept++; }
    else dropped.push({ text: b.text, reason: v.ok ? 'action must start with an ask/consider/research verb' : v.reason });
  } else dropped.push({ text: '', reason: 'missing recommended action' });
  return { thesis, sections, recommended_action, confidence_note: String(draft.confidence_note ?? '').trim().slice(0, 300), validation: { bullets_total: total, bullets_kept: kept, dropped } };
}

// ── Deterministic composer (no model) ───────────────────────────────────────
export function composeExplanation(pack: EvidencePack): Omit<Explanation, 'generated_at' | 'cost_usd'> {
  const by = (k: EvidenceItem['kind'] | EvidenceItem['kind'][]) => pack.items.filter(i => (Array.isArray(k) ? k : [k]).includes(i.kind));
  const one = (i: EvidenceItem): Bullet => ({ text: i.text, evidence: [i.id] });
  const sections: Section[] = [];
  const funding = by(['funding_summary', 'cyc_funding']).filter(i => i.kind !== 'cyc_funding' || pack.funding_to_cyc_identified);
  if (funding.length) sections.push({ heading: 'Funding fit', bullets: funding.map(one) });
  const program = [...by('grant').filter(i => PROGRAM_TERMS.test(i.text) || POPULATION_TERMS.test(i.text)).slice(0, 3), ...by('program')];
  if (program.length) sections.push({ heading: 'Program fit', bullets: program.map(one) });
  const geo = [...by('funding_summary').filter(i => /in illinois/i.test(i.text)), ...by('organization').filter(i => CHICAGO_TERMS.test(i.text))];
  if (geo.length) sections.push({ heading: 'Geographic fit', bullets: geo.map(one) });
  const rel = by(['relationship', 'tie', 'seat']);
  if (rel.length) sections.push({ heading: 'Relationship', bullets: rel.map(one) });
  const access = by('seat').filter(i => /program officer|program director|grants? (manager|director|officer)|executive director/i.test(i.text)).concat(by('program').filter(i => /application path|giving contact/i.test(i.text)));
  if (access.length) sections.push({ heading: 'Accessibility', bullets: access.map(one) });
  const risks: Bullet[] = [];
  if (!pack.funding_to_cyc_identified) { const c = by('cyc_funding')[0]; if (c) risks.push(one(c)); }
  // Inferred items that no other section already shows verbatim.
  const shown = new Set(sections.flatMap(s => s.bullets.flatMap(b => b.evidence)));
  for (const i of pack.items.filter(i => i.verification === 'inferred' && i.kind !== 'grant' && !shown.has(i.id)).slice(0, 2)) risks.push({ text: `Inferred, not documented: ${i.text}`, evidence: [i.id] });
  if (pack.items.some(i => i.kind === 'funding_summary' && i.verification === 'inferred')) risks.push({ text: 'All funding evidence for this lead comes from CYC\'s uncited seed list; the score discounts it until a filing citation is attached.', evidence: [by('funding_summary')[0].id] });
  if (by('grant').some(i => /seed list/i.test(i.text))) { const g = by('grant').find(i => /seed list/i.test(i.text))!; risks.push({ text: `Some funding evidence comes from CYC's uncited seed list and is discounted in the score: ${g.text}`, evidence: [g.id] }); }
  if (risks.length) sections.push({ heading: 'Risks and unknowns', bullets: risks });

  const score = by('score')[0];
  const relIt = rel[0];
  const thesis = [
    score ? `${pack.target.name} scores ${pack.score.opportunity_score}/100 with ${pack.score.evidence_confidence} evidence confidence [${score.id}].` : null,
    funding[0] ? `${funding[0].text} [${funding[0].id}]` : null,
    relIt ? `${relIt.text} [${relIt.id}]` : null,
  ].filter(Boolean).join(' ');
  const action = recommendedAction(pack);
  return {
    generator: GENERATOR, method: 'deterministic', model: null, input_hash: pack.hash,
    thesis, sections, recommended_action: action, confidence: pack.score.evidence_confidence,
    confidence_note: confidenceNote(pack),
    sources: pack.items.map(i => ({ id: i.id, kind: i.kind, source_type: i.source_type, source_url: i.source_url, verification: i.verification, text: i.text })),
    validation: { bullets_total: sections.reduce((n, s) => n + s.bullets.length, 0) + 2, bullets_kept: sections.reduce((n, s) => n + s.bullets.length, 0) + 2, dropped: [] },
  };
}

function recommendedAction(pack: EvidencePack): Bullet {
  const rel = pack.items.find(i => i.kind === 'relationship' && i.verification !== 'inferred') ?? pack.items.find(i => i.kind === 'relationship');
  const tie = pack.items.find(i => i.kind === 'tie');
  const seat = pack.items.find(i => i.kind === 'seat');
  const cyc = pack.items.find(i => i.kind === 'cyc_funding');
  const fs = pack.items.find(i => i.kind === 'funding_summary');
  if (pack.via && pack.trustee && rel) return { text: `Ask ${pack.via.name} whether they would be comfortable introducing CYC to ${pack.trustee.name} at ${pack.target.name}, noting the tie is ${rel.verification === 'verified' ? 'documented' : rel.verification === 'probable' ? 'documented but undated' : 'inferred and should be confirmed first'}.`, evidence: [rel.id, ...(seat ? [seat.id] : [])] };
  if (pack.via && tie) return { text: `Ask ${pack.via.name} how ${pack.target.name} handles community giving and who owns it, before any outreach.`, evidence: [tie.id] };
  if (fs) return { text: `Research ${pack.target.name}'s application path and the program officer for youth grants, and look for a board or peer connection before outreach.`, evidence: [fs.id, ...(cyc ? [cyc.id] : [])] };
  return { text: `Research ${pack.target.name} further before outreach; the current evidence is thin.`, evidence: [pack.items[0]?.id].filter(Boolean) as string[] };
}

function confidenceNote(pack: EvidencePack): string {
  const grades = pack.items.map(i => i.verification).filter(Boolean);
  const inferred = grades.filter(g => g === 'inferred').length, verified = grades.filter(g => g === 'verified').length;
  const types = new Set(pack.items.map(i => i.source_type).filter(Boolean));
  return `${pack.score.evidence_confidence}: ${verified} documented and ${inferred} inferred items across ${types.size} source type${types.size === 1 ? '' : 's'}${pack.funding_to_cyc_identified ? '' : '; no CYC funding relationship identified'}.`;
}

// ── Model generator ─────────────────────────────────────────────────────────
const SYSTEM = `You write the "Why this lead?" panel for a nonprofit's development team (Chicago Youth Centers, "CYC") inside a relationship-intelligence tool.
You are given a numbered evidence pack (E1, E2, …). Hard rules:
- Every bullet MUST cite one or more evidence ids and MUST be fully supported by the cited items. Do not add facts, numbers, names, dates, amounts or relationships that are not in the cited evidence.
- Never assert or presume a personal relationship between people. Shared employment or board service is a possible introduction path, nothing more: write "whether they know each other", not "the status of his relationship". Refer to people by name or as they/them.
- Never say an organization "never funded" or "does not fund" CYC. Where evidence says so, use exactly: "No CYC funding relationship identified in available data."
- If the only evidence for a point is graded "inferred" or "undated", say so in the bullet ("inferred", "undated").
- Numbers must be copied verbatim from the evidence (you may write $150,000 as $150k).
- Use organization and person names exactly as they appear in the evidence — no abbreviations, initialisms or nicknames the evidence does not use.
- The recommended action must start with Ask / Consider / Research / Confirm / Identify / Request and must not promise an outcome.
- Plain, specific, professional prose. No hype; no emoji. Be concise: at most three bullets per section, each under 35 words.
Output strictly the JSON object requested. No prose outside the JSON, no code fences.`;

function userPrompt(pack: EvidencePack): string {
  const lines = pack.items.map(i => `${i.id} [${i.kind}${i.verification ? `, ${i.verification}` : ''}${i.source_type ? `, ${sourceLabel(i.source_type)}` : ''}]: ${i.text}`).join('\n');
  const who = pack.trustee && pack.via ? `Warm path: CYC ${pack.via.role ?? 'board member'} ${pack.via.name} → ${pack.trustee.name} at ${pack.target.name}.` : pack.via ? `CYC ${pack.via.role ?? 'board member'} ${pack.via.name} is the connection.` : 'No specific CYC person is on this path.';
  return `LEAD: ${pack.target.name} (${pack.insight_type ?? pack.lead_type}). ${who}
Deterministic score ${pack.score.opportunity_score}/100, evidence confidence ${pack.score.evidence_confidence}.

EVIDENCE PACK:
${lines}

Write the panel as a single JSON object with these keys and nothing else (no comments, no code fences):
- "thesis": string. Two or three sentences on why this lead matters now, citing evidence ids in square brackets, e.g. [E3].
- "sections": array of {"heading": string, "bullets": [{"text": string, "evidence": [string]}]}. Heading must be one of "Funding fit", "Program fit", "Geographic fit", "Relationship", "Accessibility", "Risks and unknowns". Omit a section that has no evidence; ALWAYS include "Risks and unknowns".
- "recommended_action": {"text": string, "evidence": [string]}.
- "confidence_note": string. One sentence on how well-supported the evidence is.`;
}

export interface ExplainResult { explanation: Explanation; usage: { input: number; output: number } }

/** Tolerant JSON recovery: code fences, leading prose, trailing commas and line comments outside strings. */
export function parseDraft(text: string): { draft: Record<string, unknown>; parseError: string | null } {
  let s = text.replace(/```(?:json)?/gi, '').trim();
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return { draft: {}, parseError: 'no JSON object found' };
  s = s.slice(start, end + 1);
  const attempt = (x: string) => { try { const o = JSON.parse(x); return o && typeof o === 'object' ? (o as Record<string, unknown>) : null; } catch { return null; } };
  let o = attempt(s);
  if (o) return { draft: o, parseError: null };
  // Strip // comments outside string literals, then trailing commas.
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    out += c;
  }
  o = attempt(out.replace(/,\s*([}\]])/g, '$1'));
  return o ? { draft: o, parseError: null } : { draft: {}, parseError: 'unparseable after cleanup' };
}

export async function explainWithModel(pack: EvidencePack): Promise<ExplainResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({ model: MODEL, max_tokens: 2500, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: userPrompt(pack) }] });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
  const parsed = parseDraft(text);
  const { draft } = parsed;
  const parseError = res.stop_reason === 'max_tokens' ? `output truncated at ${res.usage.output_tokens} tokens` : parsed.parseError;
  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  const v = validateExplanation(draft, pack);
  if (parseError) v.validation.dropped.unshift({ text: text.slice(0, 160), reason: `model output was not valid JSON (${parseError})` });
  // Keep the head of the raw output when validation went badly — the only way to see what the model actually did.
  if (v.validation.bullets_kept < v.validation.bullets_total / 2) v.validation.raw_head = text.slice(0, 1200);
  const explanation = assemble(pack, draft, v, usage.input * PRICE_IN + usage.output * PRICE_OUT);
  return { explanation, usage };
}

/** The model's structure survives only where it validated; anything missing falls back to the deterministic text. */
function assemble(pack: EvidencePack, draft: Record<string, unknown>, v: ReturnType<typeof validateExplanation>, cost: number): Explanation {
  const fallback = composeExplanation(pack);
  return {
    generator: GENERATOR, method: 'model', model: MODEL, generated_at: new Date().toISOString(), input_hash: pack.hash,
    thesis: v.thesis || fallback.thesis,
    sections: v.sections.length ? v.sections : fallback.sections,
    recommended_action: v.recommended_action.text ? v.recommended_action : fallback.recommended_action,
    confidence: pack.score.evidence_confidence, confidence_note: v.confidence_note || fallback.confidence_note,
    sources: fallback.sources, validation: v.validation, draft,
    cost_usd: cost,
  };
}

/** Re-run validation on a stored draft (free): the validator improved, the evidence did not change. */
export function revalidate(pack: EvidencePack, prev: Explanation): Explanation | null {
  if (!prev.draft || prev.input_hash !== pack.hash) return null;
  const v = validateExplanation(prev.draft, pack);
  const next = assemble(pack, prev.draft, v, 0);
  return { ...next, generated_at: prev.generated_at, cost_usd: prev.cost_usd };
}

export function estimateCostUsd(pack: EvidencePack): number {
  // ~4 chars per token; system + prompt in, ~700 tokens out.
  const inTokens = Math.ceil((SYSTEM.length + userPrompt(pack).length) / 4);
  return inTokens * PRICE_IN + 700 * PRICE_OUT;
}

// ── Orchestration ───────────────────────────────────────────────────────────
export interface ExplainRunReport {
  considered: number; generated: number; deterministic: number; unchanged: number;
  cost_usd: number; claude_calls: number;
  validation: { bullets_total: number; bullets_kept: number; dropped: Array<{ lead: string; text: string; reason: string }> };
}

/**
 * Explain leads. Model calls go to the top `modelTop` leads by score (at or above `minScore`);
 * every other lead gets the deterministic composition. Unchanged evidence → no call.
 */
export async function explainLeads(db: Db, orgId: string, opts: { modelTop?: number; minScore?: number; maxCostUsd?: number; force?: boolean; dry?: boolean; leadIds?: string[]; revalidate?: boolean } = {}): Promise<ExplainRunReport> {
  const modelTop = opts.modelTop ?? 25, minScore = opts.minScore ?? 30, maxCost = opts.maxCostUsd ?? 1.0;
  let q = db.from('network_leads').select('id, opportunity_score, explanation, pipeline_status').eq('org_id', orgId).order('opportunity_score', { ascending: false, nullsFirst: false });
  if (opts.leadIds?.length) q = q.in('id', opts.leadIds);
  const { data: leads, error } = await q;
  if (error) throw new Error(`leads: ${error.message}`);
  const all = (leads ?? []).filter(l => !['NOT_A_FIT', 'LOST'].includes(l.pipeline_status as string));
  const packs = await buildEvidencePacks(db, orgId, all.map(l => l.id as string));

  const report: ExplainRunReport = { considered: all.length, generated: 0, deterministic: 0, unchanged: 0, cost_usd: 0, claude_calls: 0, validation: { bullets_total: 0, bullets_kept: 0, dropped: [] } };
  let modelBudgetLeft = modelTop;
  for (const l of all) {
    const pack = packs.get(l.id as string); if (!pack) continue;
    const prev = l.explanation as Explanation | null;
    const useModel = modelBudgetLeft > 0 && Number(l.opportunity_score ?? 0) >= minScore;
    if (useModel) modelBudgetLeft--;
    let explanation: Explanation;
    const again = opts.revalidate && prev ? revalidate(pack, prev) : null;
    if (again) { explanation = again; report.unchanged++; }
    else if (!opts.force && prev?.input_hash === pack.hash && (prev.method === 'model' || !useModel)) { report.unchanged++; continue; }
    else if (useModel && !opts.dry) {
      const est = estimateCostUsd(pack);
      if (report.cost_usd + est > maxCost) { explanation = { ...composeExplanation(pack), generated_at: new Date().toISOString(), cost_usd: 0 }; report.deterministic++; }
      else {
        const r = await explainWithModel(pack);
        explanation = r.explanation; report.cost_usd += explanation.cost_usd; report.claude_calls++; report.generated++;
      }
    } else if (useModel && opts.dry) {
      report.cost_usd += estimateCostUsd(pack); report.claude_calls++; report.generated++;
      continue;
    } else {
      explanation = { ...composeExplanation(pack), generated_at: new Date().toISOString(), cost_usd: 0 }; report.deterministic++;
    }
    report.validation.bullets_total += explanation.validation.bullets_total;
    report.validation.bullets_kept += explanation.validation.bullets_kept;
    for (const d of explanation.validation.dropped) report.validation.dropped.push({ lead: pack.target.name, ...d });
    if (!opts.dry) await db.from('network_leads').update({ explanation, updated_at: new Date().toISOString() }).eq('id', l.id);
  }
  return report;
}
