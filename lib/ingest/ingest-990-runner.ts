/**
 * 990 ingest worker — Workstream B2.
 *
 * End-to-end runner for one (funder_ein × fiscal_year) batch:
 *   fetch XML → parse → upsert funder → resolve each recipient (Tier 1-4)
 *   → upsert grants_made edge → tally cost.
 *
 * Caller manages the batch list + global budget. This function never
 * spends more than ~$1 per filing in practice (rough cap: 50 grants
 * average, 10% Tier-3 rate, batched). Returns a structured result so
 * the admin endpoint can sum spend across the batch.
 *
 * Cost reporting:
 *   total_cost_micro_cents = sum of identity_adjudications.cost_micro_cents
 *                            for rows written in this run.
 */

import { fetchReturnXml, FetchError } from './990pf-fetcher';
import { parse990Xml } from './990pf-parser';
import { upsertFunder, upsertGrantsMade } from '@/lib/graph/repo';
import { resolveRecipient } from '@/lib/graph/identity';
import type { FunderType } from '@/lib/graph/types';

export interface IngestOneResult {
  funder_ein:        string;
  fiscal_year:       number;
  form_type:         '990PF' | '990' | 'other';
  source_url:        string;
  funder_id:         string;
  grants_parsed:     number;
  edges_upserted:    number;
  resolve_breakdown: { ein_exact: number; fuzzy: number; claude: number; inserted: number };
  cost_micro_cents:  number;
  warnings:          string[];
  error?:            string;
}

/**
 * Classify a funder type from the form_type + EIN-based heuristics.
 * 990-PF filers are private foundations or community foundations; the
 * existing classifier in lib/graph/seed-foundations.ts uses name-regex
 * for community vs private. We default to private_foundation for 990-PF
 * and let the seed-bridge pattern correct it later if name matches the
 * community-foundation regex.
 */
function classifyFunderType(formType: '990PF' | '990' | 'other', name: string): FunderType {
  if (/community trust|community foundation|community fund/i.test(name)) return 'community_foundation';
  if (formType === '990PF') return 'private_foundation';
  return 'private_foundation';   // 990 filers can also be foundations; safe default
}

const SOURCE_PREFIX = '990xml';

export async function ingestOne(funder_ein: string, fiscal_year: number): Promise<IngestOneResult> {
  const cleanEin = funder_ein.replace(/\D/g, '');
  const breakdown = { ein_exact: 0, fuzzy: 0, claude: 0, inserted: 0 };
  let cost_micro_cents = 0;
  const warnings: string[] = [];

  // 1. Fetch.
  let xmlPacket: Awaited<ReturnType<typeof fetchReturnXml>>;
  try {
    xmlPacket = await fetchReturnXml(cleanEin, fiscal_year);
  } catch (err) {
    const e = err as FetchError;
    return {
      funder_ein: cleanEin, fiscal_year, form_type: 'other', source_url: '',
      funder_id: '', grants_parsed: 0, edges_upserted: 0, resolve_breakdown: breakdown,
      cost_micro_cents: 0, warnings,
      error: `fetch failed: ${e.message}`,
    };
  }

  // 2. Parse.
  let parsed: ReturnType<typeof parse990Xml>;
  try {
    parsed = parse990Xml(xmlPacket.xml);
  } catch (err) {
    return {
      funder_ein: cleanEin, fiscal_year, form_type: xmlPacket.form_type,
      source_url: xmlPacket.url, funder_id: '', grants_parsed: 0, edges_upserted: 0,
      resolve_breakdown: breakdown, cost_micro_cents: 0, warnings,
      error: `parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  warnings.push(...parsed.warnings);

  // 3. Upsert the funder row.
  const funderRow = await upsertFunder({
    ein:         parsed.funder_ein,
    name:        parsed.funder_name,
    funder_type: classifyFunderType(xmlPacket.form_type, parsed.funder_name),
    metadata: {
      source:           `${SOURCE_PREFIX}:propublica`,
      last_filing_year: parsed.fiscal_year,
      last_seen_at:     new Date().toISOString(),
    },
  });

  // 4. Resolve each recipient + upsert the edge.
  //    Per-grant sequential to keep ProPublica + identity layer simple.
  //    For B2 pilot (5 filings × ~50 grants = 250 calls), this is fine.
  //    For B4 backfill we can batch by candidate-pool fingerprint later.
  const source = `${SOURCE_PREFIX}:${cleanEin}:${parsed.fiscal_year}`;
  let edges_upserted = 0;

  for (const g of parsed.grants) {
    const resolved = await resolveRecipient({
      ein:       g.recipient_ein,
      name:      g.recipient_name,
      state:     g.recipient_state,
      purpose:   g.purpose,
      metadata: {
        city: g.recipient_city,
        ...(g.irc_section ? { irc_section: g.irc_section } : {}),
      },
    });

    breakdown[resolved.source === 'ein-exact' ? 'ein_exact' : resolved.source] += 1;
    if (resolved.adjudication) cost_micro_cents += resolved.adjudication.cost_micro_cents;

    try {
      await upsertGrantsMade({
        funder_id:      funderRow.id,
        recipient_id:   resolved.recipient.id,
        amount:         g.amount,
        fiscal_year:    parsed.fiscal_year,
        purpose:        g.purpose,
        source,
        data_freshness: new Date().toISOString().slice(0, 10),
        confidence:     resolved.confidence,
        raw:            { recipient_state: g.recipient_state, irc_section: g.irc_section, source_url: xmlPacket.url },
      });
      edges_upserted += 1;
    } catch (err) {
      warnings.push(`edge upsert (${g.recipient_name}, ${parsed.fiscal_year}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    funder_ein:        cleanEin,
    fiscal_year:       parsed.fiscal_year,
    form_type:         xmlPacket.form_type,
    source_url:        xmlPacket.url,
    funder_id:         funderRow.id,
    grants_parsed:     parsed.grants.length,
    edges_upserted,
    resolve_breakdown: breakdown,
    cost_micro_cents,
    warnings,
  };
}

export interface IngestBatchInput {
  ein:         string;
  fiscal_year: number;
}

export interface IngestBatchResult {
  total_filings_seen:     number;
  total_grants_parsed:    number;
  total_edges_upserted:   number;
  total_cost_micro_cents: number;
  per_filing:             IngestOneResult[];
}

/**
 * Run a list of (ein, fy) batches sequentially. Aborts early when
 * `cost_cap_micro_cents` is set and the running total would exceed it.
 */
export async function ingestBatch(
  batches: IngestBatchInput[],
  opts?: { cost_cap_micro_cents?: number },
): Promise<IngestBatchResult> {
  const per_filing: IngestOneResult[] = [];
  let total_grants_parsed = 0;
  let total_edges_upserted = 0;
  let total_cost_micro_cents = 0;
  const cap = opts?.cost_cap_micro_cents ?? Number.POSITIVE_INFINITY;

  for (const b of batches) {
    if (total_cost_micro_cents >= cap) {
      per_filing.push({
        funder_ein: b.ein, fiscal_year: b.fiscal_year, form_type: 'other',
        source_url: '', funder_id: '', grants_parsed: 0, edges_upserted: 0,
        resolve_breakdown: { ein_exact: 0, fuzzy: 0, claude: 0, inserted: 0 },
        cost_micro_cents: 0, warnings: [],
        error: `cost cap reached (${total_cost_micro_cents} >= ${cap})`,
      });
      continue;
    }
    const r = await ingestOne(b.ein, b.fiscal_year);
    per_filing.push(r);
    total_grants_parsed    += r.grants_parsed;
    total_edges_upserted   += r.edges_upserted;
    total_cost_micro_cents += r.cost_micro_cents;
  }

  return {
    total_filings_seen:     batches.length,
    total_grants_parsed,
    total_edges_upserted,
    total_cost_micro_cents,
    per_filing,
  };
}
