/**
 * Ingest the foundation_seed adapter into grant_opportunities — Phase 3C.
 *
 * Phase 1B's foundation_seed adapter has been live in nl-search via the
 * in-process foundation-corpus cache, but each foundation has NOT been
 * inserted as a row in grant_opportunities. That meant the matcher
 * never produced match_results for foundations, and the Phase 3
 * funder-affinity factor had nothing to score against.
 *
 * This pass walks the foundation_seed adapter once, embeds each
 * foundation's description, resolves its funder_id by EIN lookup in
 * funders, and INSERTs a grant_opportunities row. After this lands, the
 * existing rescore-corpus endpoint will produce CYC match_results for
 * each foundation — and those are exactly the matches where the
 * funder-affinity factor lights up.
 *
 * Idempotent — dedupes by source_id (adapter dedupeKey).
 */

import { createServerClient } from '@/lib/supabase';
import { generateEmbedding, buildGrantText } from '@/lib/embeddings';
import { getAdapter } from '@/lib/adapters/registry';
import { findFunderByEin } from '@/lib/graph/repo';
import type { NormalizedOpportunity } from '@/lib/adapters/types';
import type { ExtractedFields } from '@/types';
import crypto from 'crypto';

const ADAPTER_KEY = 'foundation_seed';

function buildExtractedFields(opp: NormalizedOpportunity): ExtractedFields {
  const h = opp.eligibility_hints;
  return {
    eligible_entity_types: h.entity_types ?? ['nonprofit_501c3'],
    geographic_scope:      h.geographic_scope ?? null,
    geographic_states:     h.geographic_states ?? [],
    target_population:     h.target_population ?? [],
    program_areas:         h.program_areas ?? [],
    award_floor:           opp.amount_min,
    award_ceiling:         opp.amount_max,
    // Foundations vary on LMI prioritization — leave null so the
    // matcher's grantRequiresLmi() falls back to the regex over
    // program_areas (which often mention 'underserved' or 'low-income'
    // for Chicago youth-focused foundations).
    requires_lmi:          null,
    lmi_evidence:          null,
    compliance_frameworks: [],
    key_requirements:      [],
    financial_requirements: {},
    confidence_score:      0.85,
  };
}

export interface IngestFoundationsResult {
  scanned:           number;
  inserted:          number;
  skipped_dupe:      number;
  funder_resolved:   number;
  funder_unresolved: number;
  errors:            string[];
}

export async function ingestFoundations(): Promise<IngestFoundationsResult> {
  const errors: string[] = [];
  const adapter = getAdapter(ADAPTER_KEY);
  if (!adapter) {
    return {
      scanned: 0, inserted: 0, skipped_dupe: 0,
      funder_resolved: 0, funder_unresolved: 0,
      errors: [`adapter not registered: ${ADAPTER_KEY}`],
    };
  }

  const db = createServerClient();

  // Resolve the adapter's grant_sources row id (so source_id on the
  // grant_opportunities row points to a registry entry, consistent with
  // the Phase 5 region ingestion).
  const { data: srcRow } = await db
    .from('grant_sources')
    .select('id')
    .eq('adapter_key', ADAPTER_KEY)
    .maybeSingle();

  const fetched = await adapter.fetch({ limit: 200 }, srcRow as never);

  let scanned = 0;
  let inserted = 0;
  let skipped_dupe = 0;
  let funder_resolved = 0;
  let funder_unresolved = 0;

  for (const opp of fetched.opportunities) {
    scanned += 1;
    const dedupeKey = adapter.dedupeKey(opp);

    // Skip if already ingested.
    const { data: existing } = await db
      .from('grant_opportunities')
      .select('id')
      .eq('source_id', dedupeKey)
      .maybeSingle();
    if (existing) {
      skipped_dupe += 1;
      continue;
    }

    // Resolve funder by EIN. Foundations are populated by Phase 2 seeds;
    // EIN match is expected for every entry in the seed list.
    let funder_id: string | null = null;
    if (opp.funder_ein) {
      const normalized = opp.funder_ein.replace(/\D/g, '');
      const funder = await findFunderByEin(normalized);
      if (funder) {
        funder_id = funder.id;
        funder_resolved += 1;
      } else {
        funder_unresolved += 1;
        errors.push(`unresolved funder EIN ${normalized} for ${opp.funder_name}`);
      }
    }

    try {
      const fields = buildExtractedFields(opp);
      const text = buildGrantText(
        opp.title,
        opp.funder_name,
        opp.description,
        fields as Record<string, unknown>,
      );
      const embedding = await generateEmbedding(text);
      const contentHash = crypto
        .createHash('sha256')
        .update(`${dedupeKey}:${opp.title}`)
        .digest('hex');

      const { error: insErr } = await db.from('grant_opportunities').insert({
        source:                ADAPTER_KEY,
        source_id:             dedupeKey,
        opportunity_number:    opp.reference ?? opp.external_id,
        title:                 opp.title,
        agency_code:           'FOUNDATION',
        agency_name:           opp.funder_name,
        open_date:             null,
        close_date:            null,        // foundations are rolling/cycle
        status:                'posted',
        aln_codes:             [],
        synopsis:              '',
        full_text:             opp.description.slice(0, 20_000),
        extracted_fields:      fields,
        extraction_confidence: 0.85,
        embedding:             `[${embedding.join(',')}]`,
        content_hash:          contentHash,
        funder_id,                            // Phase 3C linkage
      });
      if (insErr) {
        errors.push(`insert ${dedupeKey}: ${insErr.message}`);
        continue;
      }
      inserted += 1;
    } catch (err) {
      errors.push(`${dedupeKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    scanned, inserted, skipped_dupe,
    funder_resolved, funder_unresolved,
    errors,
  };
}
