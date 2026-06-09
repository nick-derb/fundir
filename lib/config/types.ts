/**
 * Config primitives — Phase 1A schema.
 *
 * These shapes mirror the regions/segments/grant_sources tables. The DB is
 * the source of truth; this file just gives the rest of the codebase a
 * typed handle on what's coming back. NO Chicago or Youth literals
 * anywhere — those are SEED rows, never types.
 */

export interface RegionGeoScope {
  states?:   string[];
  counties?: string[];
  cities?:   string[];
  metro?:    string | null;
}

export interface Region {
  id:         string;
  slug:       string;
  name:       string;
  geo_scope:  RegionGeoScope;
  created_at: string;
}

export interface KeywordProfile {
  name:    string;
  keyword: string;
  rows:    number;
}

export interface RecommendationThresholds {
  pursue: number;
  maybe:  number;
}

export interface SegmentPeerRules {
  budget_bands?:              string[];
  ages_served?:               string;
  baseline_win_rate?:         number;
  baseline_state_code?:       string;
  baseline_state_label?:      string;
  recommendation_thresholds?: RecommendationThresholds;
  keyword_profiles?:          KeywordProfile[];
}

export interface FactorWeights {
  semantic:        number;
  eligibility:     number;
  financial_990:   number;
  funder_affinity: number;
  strategic:       number;
  historical:      number;
}

export interface SegmentExclusionRules {
  agencies?:        string[];
  agency_prefixes?: string[];
  keywords?:        string[];
}

export interface Segment {
  id:                string;
  slug:              string;
  name:              string;
  ntee_codes:        string[];
  peer_rules:        SegmentPeerRules;
  funder_categories: string[];
  factor_weights:    FactorWeights;
  exclusion_rules:   SegmentExclusionRules;
  created_at:        string;
}

export type GrantSourceType = 'federal' | 'foundation' | 'state_local' | 'corporate' | 'bank';

export interface GrantSourceConfig {
  base_url?:       string;
  rate_limit_qps?: number;
  static?:         boolean;
  [k: string]:     unknown;
}

export interface GrantSourceRow {
  id:           string;
  adapter_key:  string;
  name:         string;
  source_type:  GrantSourceType;
  region_id:    string | null;
  config:       GrantSourceConfig;
  enabled:      boolean;
  created_at:   string;
}

export interface OrgConfigShape {
  region_id:    string | null;
  segment_id:   string | null;
  ntee_code:    string | null;
  budget_band:  string | null;
  census_tract: string | null;
  lmi_flag:     boolean | null;
}
