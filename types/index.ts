export interface GrantOpportunity {
  id: string;
  source: string;
  source_id: string;
  opportunity_number: string;
  title: string;
  agency_code: string;
  agency_name: string;
  open_date: string | null;
  close_date: string | null;
  status: string;
  aln_codes: string[];
  synopsis: string;
  full_text: string;
  extracted_fields: ExtractedFields;
  extraction_confidence: number;
  content_hash: string;
  ingested_at: string;
}

/**
 * The grant's own financial bar — what an applicant must be able to absorb,
 * float, or comply with. Reverse-screened against the org's actual 990.
 */
export interface FinancialRequirements {
  cost_share_required?:        boolean | null;
  cost_share_pct?:             number | null;
  cost_share_type?:            'cash' | 'in-kind' | 'both' | null;
  payment_structure?:          'reimbursement' | 'advance' | 'mixed' | null;
  indirect_cost_cap_pct?:      number | null;
  single_audit_required?:      boolean | null;
  audit_required?:             boolean | null;
  min_org_budget?:             number | null;
  min_operating_history_years?: number | null;
  reporting_burden?:           'low' | 'moderate' | 'high' | null;
}

export interface ExtractedFields {
  eligible_entity_types?: string[];
  geographic_scope?: 'national' | 'state' | 'city' | 'international' | 'foreign' | null;
  geographic_states?: string[];
  target_population?: string[];
  program_areas?: string[];
  award_floor?: number | null;
  award_ceiling?: number | null;
  cost_sharing_required?: boolean | null;
  cost_sharing_percentage?: number | null;
  grant_duration_months?: number | null;
  compliance_frameworks?: string[];
  key_requirements?: string[];
  /**
   * Phase 4 cont.: Claude-extracted flag for "this grant explicitly
   * prioritizes LMI populations/communities." Drives the CRA eligibility
   * +0.15 boost. Null on older rows extracted before this field existed —
   * the matcher's grantRequiresLmi() falls back to a regex over
   * target_population/program_areas/key_requirements in that case.
   */
  requires_lmi?: boolean | null;
  /** Captured quote/paraphrase from the grant text that justified
   *  requires_lmi=true. Null otherwise. Surfaced under the LMI evidence
   *  bullet so the user can audit the claim. */
  lmi_evidence?: string | null;
  financial_requirements?: FinancialRequirements;
  confidence_score?: number;
}

export interface MatchResult {
  id: string;
  grant_id: string;
  org_id: string | null;
  composite_score: number;
  semantic_similarity: number;
  eligibility_score: number;
  financial_score: number;
  historical_score: number;
  strategic_score: number;
  pipeline_stage: PipelineStage;
  eligibility_flags: string[];
  financial_signals: import('@/lib/990-screener').EligibilitySignal[];
  recommendation: string;
  matched_at: string;
  grant?: GrantOpportunity;
}

export type PipelineStage = 'discovered' | 'reviewing' | 'preparing' | 'drafting' | 'submitted' | 'awarded' | 'rejected';

export interface PipelineRun {
  id: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  grants_discovered: number;
  grants_new: number;
  high_matches: number;
  medium_matches: number;
  duration_seconds: number | null;
  errors: string[];
}

export interface ScoreBreakdown {
  composite: number;
  semantic: number;
  eligibility: number;
  financial_990: number;
  historical: number;
  strategic: number;
  /**
   * The name of the program within the org that this grant best matched
   * (from per-program embedding scoring). Optional for backwards-compat
   * with older match_results rows scored before per-program embeddings.
   */
  matchedProgram?: string;
  /**
   * Phase 4 CRA evidence. Carried on the breakdown so the evidence-list
   * surface in match-reasons can render the "your service area
   * qualifies under CRA" bullet without re-running the heuristic.
   */
  craEvidence?: {
    /** true when org.lmi_flag AND grant prioritizes LMI populations. */
    lmi_match:     boolean;
    /** Org's primary tract LMI status: 'low' | 'moderate' | 'middle' | 'upper' | 'unknown'. */
    lmi_status:    string;
    /** Names of bank funders whose CRA AA covers the org's tract (up to 6). */
    bank_funders:  string[];
    /** Community label for the org's primary tract, when known. */
    community?:    string | null;
  };
}

export interface FederalProgram {
  name: string;
  aln: string;
  amount: number;
  risk: 'critical' | 'elevated' | 'moderate' | 'low';
  riskReason: string;
}
