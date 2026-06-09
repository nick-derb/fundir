/**
 * Grants.gov adapter — wraps the existing lib/grants-gov.ts client in the
 * common GrantSource interface so the ingestion pipeline can iterate
 * adapters without knowing this one is special.
 *
 * Phase 1B parity: this adapter intentionally matches what
 * actions/discovery.ts has been doing — keyword search, normalize agency
 * fields, return a flat list. The richer Claude extraction still runs in
 * the pipeline (one layer up), not here.
 */

import { searchGrants, type GrantHit } from '@/lib/grants-gov';
import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'grants_gov';

function toISODate(d: string | null | undefined): string | null {
  if (!d) return null;
  // Grants.gov returns MM/DD/YYYY; tolerate already-ISO.
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function normalizeHit(hit: GrantHit): NormalizedOpportunity {
  return {
    external_id:  hit.id,
    reference:    hit.number ?? null,
    title:        hit.title ?? '',
    funder_name:  hit.agencyName ?? hit.agency ?? '',
    funder_ein:   null,                          // federal agencies don't carry an EIN here
    funder_type:  'federal_agency',
    amount_min:   null,                          // Grants.gov search2 doesn't return amounts; extraction backfills
    amount_max:   null,
    deadline:     toISODate(hit.closeDate),
    open_date:    toISODate(hit.openDate),
    description:  [hit.title, hit.agencyName, (hit.alnlist ?? []).join(', ')].filter(Boolean).join('\n'),
    eligibility_hints: {
      geographic_scope: null,                    // unknown until extraction
    },
    segment_tags: hit.alnlist ?? [],             // ALN codes are useful tags up front
    raw:          hit as unknown as Record<string, unknown>,
  };
}

export const grantsGovAdapter: GrantSourceAdapter = {
  adapterKey: ADAPTER_KEY,

  describe() {
    return {
      source_type:           'federal',
      supports_keyword_query: true,
      supports_region_filter: false,
    };
  },

  async fetch(opts: FetchOptions): Promise<FetchResult> {
    const warnings: string[] = [];
    const opportunities: NormalizedOpportunity[] = [];

    // Phase 1B: when the caller passes a segment with keyword_profiles, run
    // each profile as a separate search. This mirrors what
    // actions/discovery.ts has been doing with TARGETED_SEARCHES, but now
    // the keywords come from the segment config row, not a code constant.
    const profiles = opts.segment?.keyword_profiles ?? [];
    const fallback = profiles.length === 0 && opts.query
      ? [{ keyword: opts.query, rows: opts.limit ?? 25 }]
      : profiles;

    if (fallback.length === 0) {
      warnings.push('grants_gov: no query or keyword_profiles supplied; nothing to fetch');
      return { opportunities: [], next_cursor: null, warnings };
    }

    for (const p of fallback) {
      try {
        const resp = await searchGrants({ keyword: p.keyword, rows: p.rows });
        for (const hit of resp.data?.oppHits ?? []) {
          opportunities.push(normalizeHit(hit));
        }
      } catch (err) {
        warnings.push(`grants_gov search "${p.keyword}" failed: ${String(err)}`);
      }
    }

    return { opportunities, next_cursor: null, warnings };
  },

  dedupeKey(opp: NormalizedOpportunity): string {
    return `${ADAPTER_KEY}:${opp.external_id}`;
  },
};
