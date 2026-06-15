/**
 * City of Chicago — Department of Family & Support Services (DFSS).
 *
 * DFSS is Chicago's largest funder of nonprofit human-services delivery —
 * youth, workforce, early learning, domestic violence prevention, senior
 * services. Their funding opportunities run on multi-year cycles with
 * annual RFP releases.
 *
 * Phase 5A scope: hand-curated seed of currently recurring opportunity
 * streams. Each entry represents a recurring funding line — not a
 * specific one-off RFP. The dedupe key keeps re-ingestion idempotent;
 * the ingest endpoint updates amount/deadline metadata as the stream
 * changes year over year. Phase 5B can replace the seed with a real
 * scrape against:
 *   https://www.chicago.gov/city/en/depts/dfss/provdrs/serv/svcs/funding-opportunities.html
 */

import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'city_of_chicago_dfss';

interface ChicagoDfssSeed {
  external_id:        string;
  title:              string;
  description:        string;
  program_areas:      readonly string[];
  target_population:  readonly string[];
  amount_min:         number | null;
  amount_max:         number | null;
  /** ISO date or null for rolling/annual cycle. */
  deadline:           string | null;
  reference_url:      string;
}

const SEED: readonly ChicagoDfssSeed[] = [
  {
    external_id:  'dfss_youth_services_recurring',
    title:        'DFSS Youth Services Delivery System',
    description:  'City of Chicago Department of Family & Support Services funds a multi-year delegate agency contract system for youth services: out-of-school time programming, mentoring, leadership development, summer programs, and workforce readiness for ages 6-24, prioritizing low-income youth in high-poverty community areas. Annual RFP cycle. Eligible: 501(c)(3) nonprofits with sites in Chicago. Typical contracts $50K-$500K per year, renewable for the cycle.',
    program_areas:     ['youth development', 'afterschool', 'mentoring', 'workforce', 'summer programs'],
    target_population: ['youth', 'low-income youth', 'underserved communities', 'ages 6-24'],
    amount_min:        50_000,
    amount_max:        500_000,
    deadline:          null, // annual cycle, no fixed date here
    reference_url:     'https://www.chicago.gov/city/en/depts/dfss/provdrs/youth.html',
  },
  {
    external_id:  'dfss_workforce_services_recurring',
    title:        'DFSS Workforce Services',
    description:  'City of Chicago Department of Family & Support Services funds workforce services delivery: job-readiness training, sectoral training, employment placement, and supportive services for adults and youth in low-income Chicago neighborhoods. Multi-year delegate agency contracts. Eligible: 501(c)(3) nonprofits operating in Chicago with a track record in workforce development. Contracts $75K-$750K per year.',
    program_areas:     ['workforce development', 'job training', 'employment'],
    target_population: ['low-income adults', 'opportunity youth', 'underserved'],
    amount_min:        75_000,
    amount_max:        750_000,
    deadline:          null,
    reference_url:     'https://www.chicago.gov/city/en/depts/dfss/provdrs/workforce.html',
  },
  {
    external_id:  'dfss_early_learning_recurring',
    title:        'DFSS Early Learning Delegate Agency Funding',
    description:  'City of Chicago Department of Family & Support Services funds delegate agencies operating Head Start, Early Head Start, and Chicago Early Learning sites. Multi-year cycle. Eligible: 501(c)(3) nonprofits with capacity to operate licensed center-based early learning programs. Substantial funding — typical delegate agency awards $1M+ per year.',
    program_areas:     ['early childhood education', 'head start', 'pre-kindergarten'],
    target_population: ['low-income families', 'children 0-5', 'high-poverty communities'],
    amount_min:        500_000,
    amount_max:        5_000_000,
    deadline:          null,
    reference_url:     'https://www.chicago.gov/city/en/depts/dfss/provdrs/early.html',
  },
] as const;

function normalize(seed: ChicagoDfssSeed): NormalizedOpportunity {
  return {
    external_id:  seed.external_id,
    reference:    seed.reference_url,
    title:        seed.title,
    funder_name:  'City of Chicago, Department of Family & Support Services',
    funder_ein:   null,
    funder_type:  'state_local',
    amount_min:   seed.amount_min,
    amount_max:   seed.amount_max,
    deadline:     seed.deadline,
    open_date:    null,
    description:  seed.description,
    eligibility_hints: {
      entity_types:      ['nonprofit_501c3'],
      geographic_scope:  'city',
      geographic_states: ['IL'],
      target_population: [...seed.target_population],
      program_areas:     [...seed.program_areas],
      // DFSS prioritizes low-income Chicago neighborhoods — this is true
      // across every DFSS stream, so it's safe to set on the adapter.
      requires_lmi:      true,
    },
    segment_tags: [...seed.program_areas],
    raw:          seed as unknown as Record<string, unknown>,
  };
}

export const chicagoDfssAdapter: GrantSourceAdapter = {
  adapterKey: ADAPTER_KEY,
  describe() {
    return { source_type: 'state_local', supports_keyword_query: false, supports_region_filter: true };
  },
  async fetch(opts: FetchOptions): Promise<FetchResult> {
    return {
      opportunities: SEED.slice(0, opts.limit ?? SEED.length).map(normalize),
      next_cursor:   null,
      warnings:      [],
    };
  },
  dedupeKey(opp: NormalizedOpportunity): string {
    return `${ADAPTER_KEY}:${opp.external_id}`;
  },
};
