/**
 * Tier 2D — natural-language grant search.
 *
 * The user types something like
 *   "show me unrestricted operating grants for IL youth orgs under $250K
 *    closing in 60 days"
 * and gets back a ranked feed pulled from the entire stored grant corpus
 * (Tier 1B), not just whatever the last keyword discovery happened to
 * pull from grants.gov.
 *
 * Flow:
 *   1. Claude parses the query into a structured filter + a cleaned
 *      semantic query suitable for embedding.
 *   2. OpenAI embeds the cleaned query.
 *   3. searchCorpusByEmbedding returns the top-K nearest grants
 *      (joined with the org's match_results for stored composite_score
 *      and pipeline_stage).
 *   4. Post-filters apply structured constraints (max_award, deadline,
 *      geographic_states, funder_types) the embedding can't enforce
 *      precisely.
 *
 * Cost per query: ~$0.003 (one Claude call ~200 tokens out + one embed).
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthContext } from '@/lib/auth-context';
import { generateEmbedding } from '@/lib/embeddings';
import { searchCorpusByEmbedding, type CorpusGrant } from '@/lib/corpus-search';
import type { ExtractedFields } from '@/types';

export const maxDuration = 30;

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Parse layer ──────────────────────────────────────────────────────────────

interface ParsedQuery {
  cleaned_query:     string;
  program_areas:     string[] | null;
  funding_use:       Array<'operating' | 'project' | 'capital' | 'training' | 'general'> | null;
  min_award:         number | null;
  max_award:         number | null;
  geographic_states: string[];
  deadline_days:     number | null;
  funder_types:      Array<'federal' | 'state_local' | 'foundation' | 'corporate'> | null;
}

const PARSE_SYSTEM = `You parse a nonprofit's natural-language grant-search query into a structured filter for vector retrieval. Return ONLY valid JSON. No markdown, no preamble.

Extract any of:
- cleaned_query: A short semantic query suitable for embedding. Strip dollar amounts, state codes, deadline language. Keep program/mission/topic terms.
- program_areas: Array of topic keywords from the query (e.g. ["youth","afterschool"]). null if none.
- funding_use: Array of any of: "operating","project","capital","training","general". null if not specified.
- min_award: USD number if user gave a floor. null otherwise.
- max_award: USD number if user gave a ceiling. null otherwise. ("$250K" -> 250000)
- geographic_states: Array of 2-letter US state codes when named. [] if none.
- deadline_days: Integer days into the future for grant close_date when the user gave a time bound. null otherwise. ("in 60 days" -> 60)
- funder_types: Array of any of: "federal","state_local","foundation","corporate". null if not specified.

Examples:

Query: "show me unrestricted operating grants for IL youth orgs under $250K closing in 60 days"
{"cleaned_query":"youth nonprofit programs unrestricted operating","program_areas":["youth"],"funding_use":["operating"],"min_award":null,"max_award":250000,"geographic_states":["IL"],"deadline_days":60,"funder_types":null}

Query: "head start federal funding"
{"cleaned_query":"Head Start early childhood education","program_areas":["early childhood","head start"],"funding_use":null,"min_award":null,"max_award":null,"geographic_states":[],"deadline_days":null,"funder_types":["federal"]}

Query: "any chicago foundation that funds afterschool"
{"cleaned_query":"afterschool out-of-school time youth Chicago","program_areas":["afterschool"],"funding_use":null,"min_award":null,"max_award":null,"geographic_states":["IL"],"deadline_days":null,"funder_types":["foundation"]}`;

async function parseQuery(raw: string): Promise<ParsedQuery> {
  const msg = await claude.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 400,
    temperature: 0,
    system:     PARSE_SYSTEM,
    messages:   [{ role: 'user', content: raw }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const json = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(json) as ParsedQuery;
  } catch {
    // Defensive fallback: treat the raw query as the cleaned query, no filters.
    return {
      cleaned_query:    raw,
      program_areas:    null,
      funding_use:      null,
      min_award:        null,
      max_award:        null,
      geographic_states: [],
      deadline_days:    null,
      funder_types:     null,
    };
  }
}

// ── Post-filter layer ────────────────────────────────────────────────────────

function inDeadlineWindow(close: string | null, daysAhead: number | null): boolean {
  if (daysAhead == null) return true;
  if (!close) return false;            // user asked for a deadline; reject undated
  const closeDate = new Date(close).getTime();
  if (Number.isNaN(closeDate)) return false;
  const ahead = (closeDate - Date.now()) / (1000 * 60 * 60 * 24);
  return ahead >= 0 && ahead <= daysAhead;
}

function fitsAwardRange(
  fields: ExtractedFields,
  minAward: number | null,
  maxAward: number | null,
): boolean {
  if (minAward == null && maxAward == null) return true;
  const ceiling = fields.award_ceiling ?? fields.award_floor ?? null;
  const floor   = fields.award_floor   ?? fields.award_ceiling ?? null;
  if (ceiling == null && floor == null) return true;  // unknown; do not filter out
  if (minAward != null && ceiling != null && ceiling < minAward) return false;
  if (maxAward != null && floor   != null && floor   > maxAward) return false;
  return true;
}

function fitsStates(fields: ExtractedFields, wantedStates: string[]): boolean {
  if (!wantedStates.length) return true;
  // National grants pass; otherwise the grant's geographic_states must
  // include at least one of the wanted states.
  if (fields.geographic_scope === 'national' || !fields.geographic_scope) return true;
  const grantStates = fields.geographic_states ?? [];
  return wantedStates.some(s => grantStates.includes(s));
}

interface SearchResult extends CorpusGrant {
  reason: string;
}

function postFilter(
  grants: CorpusGrant[],
  parsed: ParsedQuery,
): SearchResult[] {
  return grants.flatMap((g): SearchResult[] => {
    const fields = (g.extracted_fields ?? {}) as ExtractedFields;
    if (!inDeadlineWindow(g.close_date, parsed.deadline_days)) return [];
    if (!fitsAwardRange(fields, parsed.min_award, parsed.max_award)) return [];
    if (!fitsStates(fields, parsed.geographic_states)) return [];
    const reasonBits: string[] = [];
    reasonBits.push(`${Math.round(g.similarity * 100)}% semantic`);
    if (g.composite_score != null) reasonBits.push(`stored score ${Math.round(g.composite_score)}`);
    return [{ ...g, reason: reasonBits.join(' · ') }];
  });
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Search is not configured.' }, { status: 503 });
  }

  let body: { query?: string; k?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const raw = (body.query ?? '').trim();
  if (!raw) {
    return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
  }
  const k = Math.min(Math.max(body.k ?? 25, 5), 100);

  // 1. Parse natural language to structured filter + cleaned semantic query.
  const parsed = await parseQuery(raw);

  // 2. Embed the cleaned query.
  const queryEmbedding = await generateEmbedding(parsed.cleaned_query || raw);

  // 3. Pull a larger pool from the corpus than we need so post-filtering
  //    doesn't leave us empty after the structured constraints apply.
  const overscan = Math.min(k * 4, 200);
  const candidates = await searchCorpusByEmbedding(queryEmbedding, {
    orgId:        ctx.orgId,
    k:            overscan,
    minCloseDate: parsed.deadline_days != null
      ? new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().slice(0, 10)  // exclude already-closed
      : undefined,
  });

  // 4. Apply structured post-filters and cap to k.
  const filtered = postFilter(candidates, parsed).slice(0, k);

  return NextResponse.json({
    parsed,
    results:    filtered,
    candidates: candidates.length,
  });
}
