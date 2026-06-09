/**
 * GrantSource adapter contract.
 *
 * Every external data source — Grants.gov, ProPublica 990-PF, City of
 * Chicago DFSS, Cook County, Illinois GATA, ISBE, future cities — implements
 * this interface. Adding a new source = one adapter file + one row in
 * `grant_sources`. No business-logic edits.
 *
 * The contract has three responsibilities:
 *   1. fetch:     pull a page (or batch) of opportunities from the source
 *   2. normalize: shape each raw record into a NormalizedOpportunity
 *   3. dedupeKey: a deterministic per-record key the ingestion pipeline
 *                  uses to avoid storing duplicates
 *
 * Adapters do NOT score, embed, or write to the DB. Those are the
 * pipeline's job and live one layer up.
 */

import type { GrantSourceRow } from '@/lib/config/types';

export interface NormalizedOpportunity {
  /** The source's own ID for this record (Grants.gov oppId, EIN, etc). */
  external_id:        string;

  /** Human-facing identifier (opportunity_number, application URL, etc). */
  reference:          string | null;

  title:              string;
  funder_name:        string;
  funder_ein:         string | null;
  funder_type:        'federal_agency' | 'private_foundation' | 'community_foundation' | 'corporate' | 'bank' | 'state_local';

  amount_min:         number | null;
  amount_max:         number | null;
  deadline:           string | null;     // ISO date
  open_date:          string | null;     // ISO date

  /** Free-text description the embedding pipeline will use. */
  description:        string;

  /** Structured eligibility hints the adapter can extract cheaply.
   *  Anything the adapter doesn't know stays absent — extraction layer fills in. */
  eligibility_hints:  {
    entity_types?:      string[];
    geographic_scope?:  'national' | 'state' | 'city' | 'international' | 'foreign' | null;
    geographic_states?: string[];
    target_population?: string[];
    program_areas?:     string[];
    requires_lmi?:      boolean;
  };

  /** Source-classification tags useful for filtering. */
  segment_tags:       string[];

  /** Original payload, persisted on the opportunity row for audit. */
  raw:                Record<string, unknown>;
}

export interface FetchOptions {
  /** Caller-supplied free-text query, used by sources that support it. */
  query?:    string;
  /** Hard cap on records to return in this call. */
  limit?:    number;
  /** Opaque cursor for resumable pagination. */
  cursor?:   string | null;
  /** Region the caller is interested in; sources that span multiple regions can filter. */
  region?:   { slug: string; states?: string[]; counties?: string[]; };
  /** Segment the caller is interested in; sources that support keyword profiles can use it. */
  segment?:  { slug: string; ntee_codes?: string[]; keyword_profiles?: { keyword: string; rows: number }[]; funder_categories?: string[]; };
}

export interface FetchResult {
  opportunities: NormalizedOpportunity[];
  /** Cursor to pass into the next fetch call; null when no more records. */
  next_cursor:   string | null;
  /** Adapter-reported issues that didn't fail the whole call. */
  warnings:      string[];
}

export interface GrantSourceAdapter {
  /** Must match `grant_sources.adapter_key`. */
  adapterKey: string;

  /** Static metadata — region, source_type, etc. — for callers that need it without a DB hit. */
  describe(): { source_type: string; supports_keyword_query: boolean; supports_region_filter: boolean };

  fetch(opts: FetchOptions, source: GrantSourceRow): Promise<FetchResult>;

  /**
   * Stable dedupe key. The ingestion pipeline writes this on the opportunity
   * row and reads it on subsequent runs to skip duplicates without touching
   * downstream tables.
   *
   * Common pattern: `${adapterKey}:${external_id}`.
   */
  dedupeKey(opp: NormalizedOpportunity): string;
}
