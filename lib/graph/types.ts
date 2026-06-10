/**
 * 990 graph types — Phase 2A schema mirror.
 *
 * The funder→recipient graph is shared reference (every authenticated
 * tenant reads the same rows). NO tenant-scoped logic lives in here.
 */

export type FunderType =
  | 'federal_agency'
  | 'private_foundation'
  | 'community_foundation'
  | 'corporate'
  | 'bank'
  | 'state_local';

export interface FunderRow {
  id:          string;
  ein:         string | null;
  name:        string;
  funder_type: FunderType;
  metadata:    Record<string, unknown>;
  created_at:  string;
}

export interface RecipientRow {
  id:              string;
  ein:             string | null;
  name:            string;
  ntee_code:       string | null;
  organization_id: string | null;
  metadata:        Record<string, unknown>;
  created_at:      string;
}

export interface GrantsMadeRow {
  id:             string;
  funder_id:      string;
  recipient_id:   string;
  amount:         number;
  fiscal_year:    number;
  purpose:        string | null;
  source:         string;
  data_freshness: string;          // ISO date
  /** 0 < confidence ≤ 1. < 1 means a fuzzy-matched recipient. */
  confidence:     number;
  raw:            Record<string, unknown> | null;
  ingested_at:    string;
}
