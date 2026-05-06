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
}

export interface FederalProgram {
  name: string;
  aln: string;
  amount: number;
  risk: 'critical' | 'elevated' | 'moderate' | 'low';
  riskReason: string;
}
