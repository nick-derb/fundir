/**
 * Curated foundation seed adapter.
 *
 * Phase 1B status: wraps the legacy in-process SEED_FOUNDATIONS list in
 * the common GrantSource interface. The list itself is a transitional
 * data source — Phase 2 migrates it into the `funders` table, at which
 * point this adapter's data source swaps from the const to a DB read but
 * the interface stays the same.
 *
 * Foundations don't have a single hard deadline like federal NOFOs, so
 * each foundation becomes one "opportunity" with deadline=null and an
 * amount range pulled from grantRange. Whether to surface it on a given
 * date is the matcher's call, not the adapter's.
 */

import { SEED_FOUNDATIONS } from '@/lib/foundation-intelligence';
import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'foundation_seed';

function buildDescription(f: typeof SEED_FOUNDATIONS[number]): string {
  return [
    `Foundation: ${f.name}`,
    `Based in ${f.city}, ${f.state}.`,
    `Focus areas: ${f.focusAreas.join(', ')}.`,
    `Geographic focus: ${f.geographicFocus.join(', ')}.`,
    `Typical grant size: $${f.avgGrantAmount.toLocaleString()} (range $${f.grantRange.min.toLocaleString()} to $${f.grantRange.max.toLocaleString()}).`,
    `Annual giving: $${f.totalGrantsGiven.toLocaleString()}.`,
    `Deadline pattern: ${f.deadlinePattern}.`,
  ].join('\n');
}

function classifyFunderType(name: string): NormalizedOpportunity['funder_type'] {
  // Community foundations explicitly tag themselves; everything else is private.
  if (/community|trust/i.test(name)) return 'community_foundation';
  return 'private_foundation';
}

function normalize(f: typeof SEED_FOUNDATIONS[number]): NormalizedOpportunity {
  return {
    external_id:  f.ein,
    reference:    f.applicationUrl,
    title:        f.name,
    funder_name:  f.name,
    funder_ein:   f.ein,
    funder_type:  classifyFunderType(f.name),
    amount_min:   f.grantRange.min,
    amount_max:   f.grantRange.max,
    deadline:     null,                         // foundations: rolling / cycle / annual — no hard date
    open_date:    null,
    description:  buildDescription(f),
    eligibility_hints: {
      geographic_scope:  'state',
      geographic_states: [f.state],
      program_areas:     [...f.focusAreas],
    },
    segment_tags: [...f.focusAreas],
    raw:          f as unknown as Record<string, unknown>,
  };
}

export const foundationSeedAdapter: GrantSourceAdapter = {
  adapterKey: ADAPTER_KEY,

  describe() {
    return {
      source_type:           'foundation',
      supports_keyword_query: false,
      supports_region_filter: true,
    };
  },

  async fetch(opts: FetchOptions): Promise<FetchResult> {
    const wantedStates = opts.region?.states;
    const filtered = SEED_FOUNDATIONS.filter(f => {
      // National foundations (geographicFocus contains 'national') always pass.
      const isNational = f.geographicFocus.some(g => /national/i.test(g));
      if (isNational) return true;
      if (!wantedStates?.length) return true;
      return wantedStates.includes(f.state);
    });
    const limit = opts.limit ?? filtered.length;
    return {
      opportunities: filtered.slice(0, limit).map(normalize),
      next_cursor:   null,
      warnings:      [],
    };
  },

  dedupeKey(opp: NormalizedOpportunity): string {
    return `${ADAPTER_KEY}:${opp.external_id}`;
  },
};
