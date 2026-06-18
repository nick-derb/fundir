/**
 * Tier 3 Claude adjudication — Workstream B3.
 *
 * When the trigram fuzzy pool in lib/graph/identity.ts returns >=2
 * candidates in the 0.55-0.85 gray band (ambiguous), this layer asks
 * Claude Sonnet 4.6 to pick the most likely match (or reject all).
 * Every decision is persisted to `identity_adjudications` for audit +
 * replay — wrong matches are the worst-case outcome for this pipeline
 * (per BUILD_PLAN.md §5.2 "wrong claim is worse than no claim"), so we
 * never want to be unable to debug a bad call.
 *
 * Cost discipline:
 *   - Sonnet 4.6 (claude-sonnet-4-6) — $3/M in, $15/M out.
 *   - Batched: up to 10 ambiguous cases per round-trip, structured JSON.
 *   - cost_micro_cents stamped per row so the worker can sum spend and
 *     stop if it exceeds the per-run budget.
 *   - Skipped when fewer than 2 candidates above 0.55 (no ambiguity).
 *
 * Budget gate: every caller MUST check `tokensBudgetRemaining` against
 * the BUDGET.md cap before calling. The library does not enforce a
 * global cap.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import type { RecipientRow } from './types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sonnet 4.6 pricing — micro-cents per million tokens.
const SONNET_IN_PRICE_PER_MTOK_MICROCENTS  =   300_000;  // $3.00/Mtok = 300_000 µ¢/Mtok
const SONNET_OUT_PRICE_PER_MTOK_MICROCENTS = 1_500_000;  // $15.00/Mtok
const MODEL_VERSION = 'claude-sonnet-4-6';

export interface AdjudicationInput {
  raw_name:    string;
  raw_ein:     string | null;
  raw_state:   string | null;
  raw_purpose: string | null;
  candidates:  RecipientRow[];
}

export interface AdjudicationResult {
  /** The recipient row Claude chose. null = no match (insert fresh). */
  chosen:           RecipientRow | null;
  /** Claude's confidence 0-1. Floor at 0.70 enforced upstream. */
  confidence:       number;
  /** Tier — always 'claude' from this layer. */
  tier:             'claude' | 'no_match';
  /** One-line reasoning Claude returned. */
  reasoning:        string;
  /** Round-trip cost in micro-cents — sum for budget tracking. */
  cost_micro_cents: number;
  /** The id of the persisted identity_adjudications row. */
  audit_id:         string;
}

const SYSTEM_PROMPT = `You are an entity-resolution oracle for a nonprofit-funding graph. You're given:

  - RAW: a recipient string from a 990-PF grants-paid schedule (name, optional EIN, state, purpose).
  - CANDIDATES: a list of recipient records already in the graph that the fuzzy-match layer surfaced as possible matches.

Decide which candidate is the RAW recipient, or that none are.

RULES (non-negotiable):
1. NEVER guess. If two or more candidates look equally plausible, return chosen_index = -1 (no match).
2. EIN match wins. If RAW.ein matches a candidate's ein exactly, that candidate is chosen with confidence 1.0.
3. State match is a strong signal but not decisive on its own. Two different "YMCA" orgs in the same state are common.
4. The purpose text is sometimes a hint about which org (e.g. "youth violence prevention in West Side Chicago" picks the West Side org over a downtown one).
5. Confidence reflects how sure you are the match is correct:
   - 0.95+: you have an EIN match or another decisive identifier
   - 0.85-0.94: name + state + at least one corroborating signal
   - 0.70-0.84: name + state, no contradictions
   - <0.70: do not return a match — set chosen_index = -1

OUTPUT (ONLY this JSON, no markdown, no prose):
{ "decisions": [ { "raw_index": <int>, "chosen_index": <int or -1>, "confidence": <number>, "reasoning": "<one sentence>" } ] }

raw_index is the 0-indexed position in the RAW input list.
chosen_index is the 0-indexed position in that raw's CANDIDATES list, or -1 for no match.`;

function buildUserMessage(batch: AdjudicationInput[]): string {
  const items = batch.map((b, i) => {
    const cands = b.candidates.map((c, j) => {
      const m = (c.metadata ?? {}) as Record<string, unknown>;
      const state = typeof m.state === 'string' ? m.state : '';
      return `    [${j}] name="${c.name}" ein=${c.ein ?? 'null'} state=${state || 'unknown'} ntee=${c.ntee_code ?? 'null'}`;
    }).join('\n');
    return `RAW[${i}]:
  name:    "${b.raw_name}"
  ein:     ${b.raw_ein ?? 'null'}
  state:   ${b.raw_state ?? 'unknown'}
  purpose: "${b.raw_purpose ?? ''}"
CANDIDATES:
${cands}`;
  }).join('\n\n');
  return items;
}

interface ClaudeDecisionRow {
  raw_index:    number;
  chosen_index: number;
  confidence:   number;
  reasoning:    string;
}

interface ClaudeDecisionsPayload {
  decisions: ClaudeDecisionRow[];
}

/**
 * Adjudicate a batch of up to 10 ambiguous cases. Returns one result
 * per input row (length-preserving). Writes one `identity_adjudications`
 * row per case. Cost is shared across the batch — `cost_micro_cents`
 * is the per-case allocation.
 */
export async function adjudicateBatch(batch: AdjudicationInput[]): Promise<AdjudicationResult[]> {
  if (batch.length === 0) return [];
  if (batch.length > 10)  throw new Error(`adjudicateBatch: batch size ${batch.length} exceeds max 10`);

  const userMsg = buildUserMessage(batch);

  const resp = await client.messages.create({
    model:       MODEL_VERSION,
    max_tokens:  800,
    temperature: 0.0,
    system:      SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  // Cost = input tokens × in-price + output tokens × out-price (µ¢).
  const inTok  = resp.usage?.input_tokens  ?? 0;
  const outTok = resp.usage?.output_tokens ?? 0;
  const total_micro_cents =
      Math.ceil(inTok  * SONNET_IN_PRICE_PER_MTOK_MICROCENTS  / 1_000_000)
    + Math.ceil(outTok * SONNET_OUT_PRICE_PER_MTOK_MICROCENTS / 1_000_000);
  const per_case_cost = Math.ceil(total_micro_cents / batch.length);

  // Parse the JSON response defensively. Claude is reliable but the
  // worker can't crash on a malformed reply during a large backfill.
  const text = resp.content
    .map(b => b.type === 'text' ? b.text : '')
    .join('').trim();
  let parsed: ClaudeDecisionsPayload;
  try {
    // Strip code fences if Claude added them despite instructions.
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    parsed = JSON.parse(cleaned) as ClaudeDecisionsPayload;
  } catch (err) {
    throw new Error(`adjudicateBatch: failed to parse Claude JSON (${err}); raw=${text.slice(0, 200)}`);
  }

  const decisionByIdx = new Map<number, ClaudeDecisionRow>();
  for (const d of parsed.decisions ?? []) decisionByIdx.set(d.raw_index, d);

  const db = createServerClient();
  const results: AdjudicationResult[] = [];

  for (let i = 0; i < batch.length; i++) {
    const input = batch[i];
    const dec   = decisionByIdx.get(i);
    // Default to no_match if Claude didn't return a decision for this row.
    const choseIdx   = dec?.chosen_index ?? -1;
    const confidence = dec?.confidence   ?? 0;
    const reasoning  = dec?.reasoning    ?? 'no decision returned';
    const chosen = (choseIdx >= 0 && choseIdx < input.candidates.length)
      ? input.candidates[choseIdx]
      : null;
    const tier: 'claude' | 'no_match' = chosen ? 'claude' : 'no_match';
    const stored_confidence = chosen ? Math.max(0.70, Math.min(1.0, confidence)) : 0.0;

    // Persist the audit row.
    const { data: auditRow, error: auditErr } = await db
      .from('identity_adjudications')
      .insert({
        raw_name:                input.raw_name,
        raw_ein:                 input.raw_ein,
        raw_state:               input.raw_state,
        candidate_recipient_ids: input.candidates.map(c => c.id),
        chosen_recipient_id:     chosen?.id ?? null,
        tier,
        confidence:              stored_confidence,
        claude_reasoning:        reasoning,
        model_version:           MODEL_VERSION,
        cost_micro_cents:        per_case_cost,
      })
      .select('id')
      .single();
    if (auditErr) throw new Error(`adjudicateBatch: identity_adjudications insert: ${auditErr.message}`);

    results.push({
      chosen,
      confidence:       stored_confidence,
      tier,
      reasoning,
      cost_micro_cents: per_case_cost,
      audit_id:         auditRow.id as string,
    });
  }

  return results;
}
