/**
 * Claude-grounded draft generator — Phase 6 cont C.
 *
 * Takes a source bundle (from lib/drafts/sources.ts) + an opportunity
 * row, builds a strict instruction prompt, and asks Claude Sonnet 4.6
 * to produce a sectioned first draft. The contract is enforced in the
 * system prompt and validated post-parse:
 *
 *   - Every sentence containing a FACTUAL CLAIM about the org MUST
 *     end with {{cite:N}} where N is a 1-indexed source from the
 *     bundle.
 *   - Claims that aren't backed by a source MUST be replaced with
 *     "[TODO: confirm from org — <one-line description>]".
 *   - Grant-side facts (eligibility, award range, agency) are
 *     paraphrased without org-side citations.
 *
 * Output JSON:
 *   {
 *     content: {
 *       background, need, approach, capacity, budget_narrative, impact
 *     },
 *     unused_sources: number[]   // sources we passed but Claude didn't cite
 *   }
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DraftSource, SourceBundle } from './sources';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface DraftContent {
  background:        string;
  need:              string;
  approach:          string;
  capacity:          string;
  budget_narrative:  string;
  impact:            string;
}

export interface GeneratedDraft {
  content:           DraftContent;
  /** Citation ids the generator references somewhere in the body. */
  cited_source_ids:  number[];
  /** Quotes Claude flagged it couldn't source — useful for the audit log. */
  todo_markers:      string[];
  tokens_used:       number | null;
}

export interface GenerateDraftInput {
  bundle:        SourceBundle;
  grant: {
    title:           string;
    funder_name:     string;
    agency_code?:    string | null;
    description:     string;
    amount_floor?:   number | null;
    amount_ceiling?: number | null;
    deadline?:       string | null;
    eligibility_hints?: Record<string, unknown>;
    requires_lmi?:   boolean | null;
  };
}

const SYSTEM_PROMPT = `You are a grant writer producing the first draft
of a federal/state/foundation grant application. The applicant is the
nonprofit described in the SOURCES block below. Strict rules:

CITATION RULES (non-negotiable):
1. Every factual claim about the APPLICANT ORG (mission, programs,
   budget, demographics, staff, sites, accreditations, prior awards,
   service area, financials, CRA tract, peer network) must end with
   a {{cite:N}} marker referencing a SOURCES entry by its id.
2. If a factual claim about the org cannot be supported by SOURCES,
   replace it with a [TODO: ...] placeholder describing what the org
   needs to confirm. Do not invent facts.
3. Statements about the GRANT itself (the funder's program priorities,
   eligibility criteria, award range, deadline) do not need
   {{cite:N}} markers — they're grounded in the OPPORTUNITY block.
4. Inspirational / mission-aligned framing language is allowed without
   citation as long as it doesn't make a verifiable claim about the
   org.

STYLE:
- Crisp, evidence-forward prose. No marketing fluff.
- Use specific numbers from the sources when relevant.
- Each section should read like a competent program officer wrote it
  for a board review, not a chatbot generating boilerplate.

OUTPUT JSON SHAPE (return ONLY this JSON, no markdown):
{
  "background":       "<2-3 paragraphs grounding the org and its mission>",
  "need":             "<2-3 paragraphs on the population/community need this grant addresses>",
  "approach":         "<2-3 paragraphs on how the org would deliver the funded work>",
  "capacity":         "<2-3 paragraphs on staff, sites, accreditations, prior funding track record>",
  "budget_narrative": "<2-3 paragraphs on financial fit: budget bands, reserves, payment-structure considerations>",
  "impact":           "<2-3 paragraphs on outcomes the org would deliver, citing prior results where sourced>"
}`;

function formatSources(sources: DraftSource[]): string {
  return sources
    .map(s => `[${s.id}] ${s.location}: "${s.quote}"`)
    .join('\n');
}

function formatGrant(input: GenerateDraftInput['grant']): string {
  const lines: string[] = [
    `Title:    ${input.title}`,
    `Funder:   ${input.funder_name}${input.agency_code ? ` (${input.agency_code})` : ''}`,
  ];
  if (input.amount_floor != null || input.amount_ceiling != null) {
    lines.push(`Award:    $${input.amount_floor ?? '?'} - $${input.amount_ceiling ?? '?'}`);
  }
  if (input.deadline) lines.push(`Deadline: ${input.deadline}`);
  if (input.requires_lmi) {
    lines.push(`Priority: explicit LMI / low-to-moderate income / underserved focus`);
  }
  lines.push(``, `Description:`, input.description.slice(0, 4000));
  return lines.join('\n');
}

function buildUserMessage(input: GenerateDraftInput): string {
  return `OPPORTUNITY:
${formatGrant(input.grant)}

SOURCES (cite by id in your draft):
${formatSources(input.bundle.sources)}

APPLICANT ORG: ${input.bundle.org_name}

Produce the JSON described in the system prompt. Use {{cite:N}} markers
generously for every org claim. Use [TODO: ...] where the sources don't
cover what the section needs.`;
}

const CITE_RE  = /\{\{cite:(\d+)\}\}/g;
const TODO_RE  = /\[TODO:[^\]]*\]/g;

function collectCitedIds(content: DraftContent): number[] {
  const ids = new Set<number>();
  for (const v of Object.values(content)) {
    let m: RegExpExecArray | null;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(v)) !== null) ids.add(Number(m[1]));
  }
  return [...ids].sort((a, b) => a - b);
}

function collectTodoMarkers(content: DraftContent): string[] {
  const out: string[] = [];
  for (const v of Object.values(content)) {
    let m: RegExpExecArray | null;
    TODO_RE.lastIndex = 0;
    while ((m = TODO_RE.exec(v)) !== null) out.push(m[0]);
  }
  return out;
}

export async function generateDraft(input: GenerateDraftInput): Promise<GeneratedDraft> {
  const userMessage = buildUserMessage(input);

  const res = await client.messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  4000,
    temperature: 0.2,
    system:      SYSTEM_PROMPT,
    messages:    [{ role: 'user', content: userMessage }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: DraftContent;
  try {
    parsed = JSON.parse(cleaned) as DraftContent;
  } catch (err) {
    throw new Error(`generator returned non-JSON: ${err instanceof Error ? err.message : String(err)}; first 400 chars: ${cleaned.slice(0, 400)}`);
  }

  // Validate every required section exists.
  const REQUIRED: (keyof DraftContent)[] = [
    'background', 'need', 'approach', 'capacity', 'budget_narrative', 'impact',
  ];
  for (const k of REQUIRED) {
    if (typeof parsed[k] !== 'string' || parsed[k].length < 50) {
      throw new Error(`generator output missing or too-short section: ${k}`);
    }
  }

  // Drop any citation ids the generator made up (out of range).
  const validIds = new Set(input.bundle.sources.map(s => s.id));
  for (const k of REQUIRED) {
    parsed[k] = parsed[k].replace(CITE_RE, (full, idStr) => {
      const id = Number(idStr);
      return validIds.has(id) ? full : '[TODO: source id was hallucinated]';
    });
  }

  return {
    content: parsed,
    cited_source_ids: collectCitedIds(parsed),
    todo_markers:     collectTodoMarkers(parsed),
    tokens_used:      res.usage ? res.usage.input_tokens + res.usage.output_tokens : null,
  };
}
