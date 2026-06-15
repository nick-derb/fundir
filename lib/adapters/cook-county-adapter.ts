/**
 * Cook County, Illinois — Bureau of Economic Development + Justice
 * Advisory Council.
 *
 * Cook County's nonprofit funding tracks two channels: Community
 * Development Block Grant (CDBG) sub-recipient awards for
 * neighborhood/youth services in suburban Cook, and Justice Advisory
 * Council (JAC) grants for violence-prevention and restorative-justice
 * programs (predominantly in disinvested South + West side communities
 * AND south-suburban Cook).
 *
 * Phase 5A seed. Phase 5B can replace with a scrape against:
 *   https://www.cookcountyil.gov/agency/bureau-economic-development
 *   https://www.cookcountyil.gov/service/justice-advisory-council
 */

import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'cook_county';

interface CookCountySeed {
  external_id:        string;
  title:              string;
  description:        string;
  program_areas:      readonly string[];
  target_population:  readonly string[];
  amount_min:         number | null;
  amount_max:         number | null;
  deadline:           string | null;
  reference_url:      string;
}

const SEED: readonly CookCountySeed[] = [
  {
    external_id:  'cookco_jac_violence_prevention',
    title:        'Cook County Justice Advisory Council — Violence Prevention & Restorative Justice',
    description:  'Cook County Justice Advisory Council funds community-based violence-prevention and restorative-justice programs serving disinvested neighborhoods across Cook County. Priorities: youth violence interruption, group violence intervention, mentoring for system-involved youth, trauma-informed services. Eligible: 501(c)(3) nonprofits with documented community partnerships and a service area in Cook County. Annual cycle. Awards range $25K-$500K per year.',
    program_areas:     ['violence prevention', 'restorative justice', 'youth mentoring', 'trauma-informed services'],
    target_population: ['system-involved youth', 'high-poverty neighborhoods', 'low-income communities', 'underserved'],
    amount_min:        25_000,
    amount_max:        500_000,
    deadline:          null,
    reference_url:     'https://www.cookcountyil.gov/service/justice-advisory-council',
  },
  {
    external_id:  'cookco_cdbg_neighborhood_services',
    title:        'Cook County CDBG Sub-recipient Funding — Public Service Activities',
    description:  'Cook County administers federal Community Development Block Grant (CDBG) sub-recipient awards for public service activities benefiting low-to-moderate income persons in suburban Cook County. Eligible activities: child care, youth services, employment training, services for seniors and persons with disabilities, healthcare access, anti-crime programming. Eligible applicants: 501(c)(3) nonprofits serving suburban Cook County LMI populations. Annual cycle; awards $20K-$150K.',
    program_areas:     ['child care', 'youth services', 'workforce', 'community development', 'public service'],
    target_population: ['low-to-moderate income', 'low-income', 'underserved suburban communities'],
    amount_min:        20_000,
    amount_max:        150_000,
    deadline:          null,
    reference_url:     'https://www.cookcountyil.gov/service/community-development-block-grant',
  },
] as const;

function normalize(seed: CookCountySeed): NormalizedOpportunity {
  return {
    external_id:  seed.external_id,
    reference:    seed.reference_url,
    title:        seed.title,
    funder_name:  'Cook County, Illinois',
    funder_ein:   null,
    funder_type:  'state_local',
    amount_min:   seed.amount_min,
    amount_max:   seed.amount_max,
    deadline:     seed.deadline,
    open_date:    null,
    description:  seed.description,
    eligibility_hints: {
      entity_types:      ['nonprofit_501c3'],
      geographic_scope:  'state',
      geographic_states: ['IL'],
      target_population: [...seed.target_population],
      program_areas:     [...seed.program_areas],
      requires_lmi:      true, // both seeded streams are LMI-targeted by mandate
    },
    segment_tags: [...seed.program_areas],
    raw:          seed as unknown as Record<string, unknown>,
  };
}

export const cookCountyAdapter: GrantSourceAdapter = {
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
