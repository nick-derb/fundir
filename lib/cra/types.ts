/**
 * CRA layer types — Phase 4A schema mirror.
 */

export type LmiStatus = 'low' | 'moderate' | 'middle' | 'upper' | 'unknown';

export interface CensusTractRow {
  tract_id:   string;     // 11-digit FIPS
  region_id:  string | null;
  lmi_status: LmiStatus;
  metadata:   Record<string, unknown>;
  created_at: string;
}

export type BankAaSource = 'ffiec_aa' | 'cra_pe_pdf' | 'manual_seed';

export interface BankAssessmentAreaRow {
  id:         string;
  funder_id:  string;
  tract_id:   string;
  source:     BankAaSource;
  created_at: string;
}

/**
 * The shape the matcher consumes when scoring an org/grant pair.
 * Pre-joined for the hot path — saves a per-row query.
 */
export interface OrgCraSnapshot {
  org_id:       string;
  census_tract: string | null;
  lmi_status:   LmiStatus;
  /** Human label for the tract, e.g. "Englewood" or "Bronzeville". */
  community:    string | null;
  /** Bank funders whose CRA assessment area covers the org's tract. */
  bank_funders: Array<{
    funder_id: string;
    name:      string;
    source:    BankAaSource;
  }>;
}
