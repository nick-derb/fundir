/**
 * Ingest a region's state/local adapters into grant_opportunities.
 *
 * Reads all `grant_sources` rows whose region_id matches the supplied
 * region slug, resolves each one to its registered adapter, runs the
 * adapter's `fetch()`, normalizes each opportunity into the
 * grant_opportunities schema, embeds the description via OpenAI, and
 * INSERTs into grant_opportunities. Idempotent — duplicate detection
 * uses the adapter's stable dedupeKey via `source_id`.
 *
 * Cost: OpenAI embedding only (no Claude). ~$0.0001 per opportunity.
 * Phase 5A's seed yields ~10 opportunities across 4 adapters = ~$0.001.
 */

import { createServerClient } from '@/lib/supabase';
import { generateEmbedding, buildGrantText } from '@/lib/embeddings';
import { getAdapter } from '@/lib/adapters/registry';
import { getRegion, listEnabledSources } from '@/lib/config/loader';
import type { NormalizedOpportunity } from '@/lib/adapters/types';
import type { ExtractedFields } from '@/types';
import crypto from 'crypto';

function buildExtractedFields(opp: NormalizedOpportunity): ExtractedFields {
  const h = opp.eligibility_hints;
  return {
    eligible_entity_types: h.entity_types  ?? ['nonprofit_501c3'],
    geographic_scope:      h.geographic_scope ?? null,
    geographic_states:     h.geographic_states ?? [],
    target_population:     h.target_population ?? [],
    program_areas:         h.program_areas ?? [],
    award_floor:           opp.amount_min,
    award_ceiling:         opp.amount_max,
    requires_lmi:          h.requires_lmi ?? null,
    lmi_evidence:          null, // adapter doesn't carry evidence text
    compliance_frameworks: [],
    key_requirements:      [],
    financial_requirements: {},
    confidence_score:      0.9, // hand-curated seed; high confidence
  };
}

export interface IngestRegionResult {
  region_slug:  string;
  adapters_run: number;
  scanned:      number;
  inserted:     number;
  skipped_dupe: number;
  errors:       string[];
}

export async function ingestRegionSources(regionSlug: string): Promise<IngestRegionResult> {
  const errors: string[] = [];
  const region = await getRegion(regionSlug);
  if (!region) {
    return {
      region_slug: regionSlug, adapters_run: 0, scanned: 0, inserted: 0, skipped_dupe: 0,
      errors: [`region not found: ${regionSlug}`],
    };
  }

  // Every grant_source row whose region_id matches → eligible for ingest.
  const sources = await listEnabledSources({ region_id: region.id });
  const db = createServerClient();

  let scanned = 0;
  let inserted = 0;
  let skipped_dupe = 0;

  for (const src of sources) {
    const adapter = getAdapter(src.adapter_key);
    if (!adapter) {
      errors.push(`no adapter registered for ${src.adapter_key}`);
      continue;
    }

    let fetched: { opportunities: NormalizedOpportunity[] };
    try {
      fetched = await adapter.fetch({}, src);
    } catch (err) {
      errors.push(`${src.adapter_key} fetch: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (const opp of fetched.opportunities) {
      scanned += 1;
      const dedupeKey = adapter.dedupeKey(opp);

      // Dedupe: source_id is the adapter's dedupeKey. If we've seen
      // this opportunity before, skip the insert.
      const { data: existing } = await db
        .from('grant_opportunities')
        .select('id')
        .eq('source_id', dedupeKey)
        .maybeSingle();
      if (existing) {
        skipped_dupe += 1;
        continue;
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
          source:                src.adapter_key,
          source_id:             dedupeKey,
          opportunity_number:    opp.reference ?? opp.external_id,
          title:                 opp.title,
          agency_code:           src.adapter_key.toUpperCase(),
          agency_name:           opp.funder_name,
          open_date:             opp.open_date,
          close_date:            opp.deadline,
          status:                'posted',
          aln_codes:             [],
          synopsis:              '',
          full_text:             opp.description.slice(0, 20_000),
          extracted_fields:      fields,
          extraction_confidence: fields.confidence_score ?? 0.9,
          embedding:             `[${embedding.join(',')}]`,
          content_hash:          contentHash,
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
  }

  return {
    region_slug:  regionSlug,
    adapters_run: sources.length,
    scanned, inserted, skipped_dupe, errors,
  };
}
