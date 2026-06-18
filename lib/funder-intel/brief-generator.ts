/**
 * Funder-intel brief generator — Workstream B6.
 *
 * Per (org, funder), generates a short evidence-linked prospect brief
 * the grant team can read in 30 seconds. Mirrors the citation discipline
 * of lib/drafts/generator.ts: every factual claim about the funder
 * cites a grants_made row by ID; un-sourceable claims are marked
 * [TODO: ...] rather than fabricated.
 *
 * Cost discipline:
 *   - Sonnet 4.6 with output capped at 2000 tokens (BUDGET.md lever 6).
 *   - Cache aggressively: store brief_edge_hash; regenerate only when
 *     any cited grants_made row changes.
 *   - Per-brief expected cost ~$0.04 input + ~$0.030 output = ~$0.07.
 *     Used 30x for the demo = ~$2.10. The runtime cap stays $50.
 *
 * No global rate limit enforced here — callers manage budget.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import crypto from 'crypto';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL_VERSION = 'claude-sonnet-4-6';

// Sonnet 4.6 pricing — micro-cents per million tokens (same as adjudicator).
const SONNET_IN_PRICE_PER_MTOK_MICROCENTS  =   300_000;
const SONNET_OUT_PRICE_PER_MTOK_MICROCENTS = 1_500_000;

// ── Output shape ──────────────────────────────────────────────────────────

export interface BriefCitation {
  /** 1-indexed id used inside `{{cite:N}}` markers. */
  id:             number;
  /** grants_made row id this citation points to. */
  grants_made_id: string;
  /** Short label rendered in the citation list ("Joyce → ASM 2024 $250K"). */
  label:          string;
  /** Outbound URL to a verifiable source (ProPublica nonprofit page,
   *  IRS-direct, or our own internal evidence page). */
  source_url:     string;
}

export interface BriefSections {
  background:               string;
  who_they_fund_like_you:   string;
  typical_grant_size:       string;
  cadence:                  string;
  entry_point:              string;
  red_flags:                string;
  suggested_ask_range:      string;
}

export interface GeneratedBrief {
  sections:         BriefSections;
  citations:        BriefCitation[];
  /** Number of [TODO: ...] markers Claude left in for human follow-up. */
  todo_marker_count: number;
  /** Hash of the cited grants_made row ids — write to brief_edge_hash so
   *  the regenerate-on-stale logic can skip when unchanged. */
  edge_hash:        string;
  tokens_in:        number;
  tokens_out:       number;
  cost_micro_cents: number;
}

export interface GenerateBriefInput {
  org_id:           string;
  org_name:         string;
  org_summary:      string;          // 1-line org description for context
  funder_id:        string;
  funder_name:      string;
  funder_ein:       string | null;
  /** Peer-funding edges from this funder to the org's peers. Becomes the
   *  source bundle Claude cites from. */
  peer_edges:       Array<{
    grants_made_id: string;
    peer_name:      string;
    peer_ein:       string | null;
    amount:         number;
    fiscal_year:    number;
    purpose:        string | null;
    confidence:     number;
  }>;
  /** Optional: funder.metadata to ground the background section. */
  funder_metadata?: Record<string, unknown>;
}

// ── Prompts ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a grant-strategy analyst writing a short prospect brief for a nonprofit's grant team. The brief covers ONE funder and the nonprofit's strategic angle for pursuing them.

NON-NEGOTIABLE CITATION RULES:
1. Every factual claim about the FUNDER (who they fund, typical grant size, cadence, past recipients, amounts) must end with a {{cite:N}} marker, where N is a 1-indexed id from the SOURCES block.
2. If a claim cannot be supported by SOURCES, replace it with "[TODO: confirm — <one-line description>]". Do NOT fabricate.
3. Strategic suggestions (entry-point, suggested ask range, red flags) may draw inferences from the cited evidence but must label inferences as such ("Based on cited edges, ..." rather than asserting unverifiable facts).
4. Brief commentary on the funder's brand or reputation is fine without citation if it's well-known public knowledge; flag with [TODO: verify] anything you're uncertain of.

STYLE:
- 1-3 short sentences per section. Total brief ≤ 500 words.
- Evidence-forward. Specific numbers from SOURCES when relevant.
- Read like a competent program officer wrote it for a peer, not a chatbot.
- No marketing fluff. No "exciting opportunity" language.

OUTPUT JSON (return ONLY this JSON, no markdown, no prose):
{
  "sections": {
    "background":             "Who the funder is and what they're known for.",
    "who_they_fund_like_you": "Specific peers from SOURCES, with amounts and FY.",
    "typical_grant_size":     "Range / median grounded in cited edges.",
    "cadence":                "How frequently and on what cycle, if inferable.",
    "entry_point":            "Concrete first step (specific person/program/initiative if known).",
    "red_flags":              "Geographic/programmatic mismatches, declining giving, etc.",
    "suggested_ask_range":    "Dollar range to ask, inferred from peer-edge sizes."
  },
  "todo_marker_count": <int>
}`;

function buildUserMessage(input: GenerateBriefInput): string {
  const sources = input.peer_edges.map((e, i) => {
    const conf = Math.round(e.confidence * 100);
    return `[${i + 1}] ${input.funder_name} → ${e.peer_name} (EIN ${e.peer_ein ?? 'n/a'}) | FY${e.fiscal_year} | $${e.amount.toLocaleString()} | purpose: ${e.purpose ?? '(unspecified)'} | confidence ${conf}%`;
  }).join('\n');
  const metaLines = input.funder_metadata ? Object.entries(input.funder_metadata)
    .filter(([k]) => ['city', 'state', 'assets', 'focus_areas', 'geographic_focus', 'avg_grant_amount'].includes(k))
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n') : '';
  return `APPLICANT ORG:
  name:    ${input.org_name}
  summary: ${input.org_summary}

FUNDER:
  name: ${input.funder_name}
  ein:  ${input.funder_ein ?? 'unknown'}
${metaLines ? 'METADATA:\n' + metaLines + '\n' : ''}
SOURCES (grants_made edges from this funder to the org's peer set):
${sources || '(none — Claude should leave [TODO] markers throughout)'}

Generate the prospect brief.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function computeEdgeHash(peerEdges: GenerateBriefInput['peer_edges']): string {
  const sorted = [...peerEdges].map(e => e.grants_made_id).sort();
  return crypto.createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 32);
}

function countTodoMarkers(sections: BriefSections): number {
  const text = Object.values(sections).join(' ');
  return (text.match(/\[TODO:/g) ?? []).length;
}

function buildCitations(input: GenerateBriefInput): BriefCitation[] {
  return input.peer_edges.map((e, i) => ({
    id:             i + 1,
    grants_made_id: e.grants_made_id,
    label:          `${input.funder_name} → ${e.peer_name} FY${e.fiscal_year} $${(e.amount / 1000).toFixed(0)}K`,
    source_url:     e.peer_ein
      ? `https://projects.propublica.org/nonprofits/organizations/${e.peer_ein.replace(/\D/g, '')}`
      : `https://projects.propublica.org/nonprofits/search?q=${encodeURIComponent(e.peer_name)}`,
  }));
}

interface ClaudeBriefPayload {
  sections:          BriefSections;
  todo_marker_count?: number;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a prospect brief. Returns the full structured output + cost.
 * Does NOT write to funder_intel — the caller is responsible for the
 * UPSERT so it can decide whether to overwrite.
 */
export async function generateBrief(input: GenerateBriefInput): Promise<GeneratedBrief> {
  const userMsg = buildUserMessage(input);
  const resp = await client.messages.create({
    model:       MODEL_VERSION,
    max_tokens:  2000,
    temperature: 0.2,
    system:      SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  const inTok  = resp.usage?.input_tokens  ?? 0;
  const outTok = resp.usage?.output_tokens ?? 0;
  const cost_micro_cents =
      Math.ceil(inTok  * SONNET_IN_PRICE_PER_MTOK_MICROCENTS  / 1_000_000)
    + Math.ceil(outTok * SONNET_OUT_PRICE_PER_MTOK_MICROCENTS / 1_000_000);

  const text = resp.content
    .map(b => b.type === 'text' ? b.text : '')
    .join('').trim();
  let parsed: ClaudeBriefPayload;
  try {
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    parsed = JSON.parse(cleaned) as ClaudeBriefPayload;
  } catch (err) {
    throw new Error(`generateBrief: failed to parse Claude JSON (${err}); raw=${text.slice(0, 200)}`);
  }

  const todo_marker_count = countTodoMarkers(parsed.sections);

  return {
    sections:         parsed.sections,
    citations:        buildCitations(input),
    todo_marker_count,
    edge_hash:        computeEdgeHash(input.peer_edges),
    tokens_in:        inTok,
    tokens_out:       outTok,
    cost_micro_cents,
  };
}

/**
 * Convenience: load the input for one (org, funder) pair from Supabase
 * and call generateBrief. Returns null when no peer edges exist (don't
 * generate a brief for funders with zero overlap — peer-overlap is the
 * sourceable signal).
 */
export async function generateBriefForPair(orgCode: string, funderId: string): Promise<{
  brief:           GeneratedBrief | null;
  reason_skipped?: string;
}> {
  const db = createServerClient();

  // 1. Resolve org.
  const { data: org } = await db.from('organizations')
    .select('id, name, org_code').eq('org_code', orgCode).maybeSingle();
  if (!org) return { brief: null, reason_skipped: `org ${orgCode} not found` };

  // 2. Resolve funder + metadata.
  const { data: funder } = await db.from('funders')
    .select('id, name, ein, metadata').eq('id', funderId).maybeSingle();
  if (!funder) return { brief: null, reason_skipped: `funder ${funderId} not found` };

  // 3. Resolve peer set.
  const { data: peers } = await db.from('peer_orgs')
    .select('peer_recipient_id').eq('organization_id', org.id);
  const peerIds = (peers ?? []).map(p => p.peer_recipient_id as string);
  if (peerIds.length === 0) return { brief: null, reason_skipped: 'org has no peers' };

  // 4. Pull peer-edge rows from this funder.
  const { data: edges } = await db.from('grants_made')
    .select('id, amount, fiscal_year, purpose, confidence, recipient:recipients(name, ein)')
    .eq('funder_id', funderId)
    .in('recipient_id', peerIds);
  if (!edges || edges.length === 0) return { brief: null, reason_skipped: 'no peer edges from this funder' };

  // 5. Shape the input.
  const peer_edges = edges.map(e => {
    const rec = Array.isArray(e.recipient) ? e.recipient[0] : e.recipient;
    return {
      grants_made_id: e.id as string,
      peer_name:      (rec as { name?: string })?.name ?? '(unknown peer)',
      peer_ein:       (rec as { ein?: string | null })?.ein ?? null,
      amount:         Number(e.amount),
      fiscal_year:    Number(e.fiscal_year),
      purpose:        (e.purpose as string | null) ?? null,
      confidence:     Number(e.confidence ?? 1),
    };
  });

  const brief = await generateBrief({
    org_id:          org.id as string,
    org_name:        org.name as string,
    org_summary:     `Chicago youth-services nonprofit; primary tract LMI; segment: youth development.`,
    funder_id:       funder.id as string,
    funder_name:     funder.name as string,
    funder_ein:      (funder.ein as string | null) ?? null,
    peer_edges,
    funder_metadata: (funder.metadata ?? {}) as Record<string, unknown>,
  });

  return { brief };
}
