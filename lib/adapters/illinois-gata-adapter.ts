/**
 * Illinois GATA — Grant Accountability and Transparency Act portal.
 *
 * GATA is the central Illinois state portal where every state agency
 * posts grant opportunities for nonprofit applicants. Coverage spans
 * DHS (Department of Human Services), IDPH (Department of Public
 * Health), DCEO (Department of Commerce & Economic Opportunity), and
 * ICJIA (Illinois Criminal Justice Information Authority). All require
 * GATA registration as a precondition for application.
 *
 * Phase 5A seed. Phase 5B can replace with a scrape against:
 *   https://gata.illinois.gov/
 */

import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'illinois_gata';

interface GataSeed {
  external_id:        string;
  title:              string;
  agency:             string;
  description:        string;
  program_areas:      readonly string[];
  target_population:  readonly string[];
  amount_min:         number | null;
  amount_max:         number | null;
  deadline:           string | null;
  requires_lmi:       boolean;
  reference_url:      string;
}

const SEED: readonly GataSeed[] = [
  {
    external_id:  'gata_dhs_after_school',
    title:        'Illinois DHS After School Programs',
    agency:       'Illinois Department of Human Services',
    description:  'Illinois DHS funds 21st-Century-style after-school and summer programs for school-age youth across Illinois, prioritizing low-income communities and youth at risk of involvement in violence. Eligible: 501(c)(3) nonprofits in Illinois with GATA registration. Multi-year cycle. Awards $50K-$300K per year per site.',
    program_areas:     ['afterschool', 'youth development', 'summer programs', '21st century learning'],
    target_population: ['low-income youth', 'at-risk youth', 'underserved'],
    amount_min:        50_000,
    amount_max:        300_000,
    deadline:          null,
    requires_lmi:      true,
    reference_url:     'https://www.dhs.state.il.us/page.aspx?item=29739',
  },
  {
    external_id:  'gata_icjia_violence_prev',
    title:        'ICJIA Violence Prevention & Reentry Grants',
    agency:       'Illinois Criminal Justice Information Authority',
    description:  'ICJIA funds community-based programs in violence prevention, reentry services, victim services, and trauma-informed support, with priority funding for communities most impacted by violence in Illinois — disproportionately South and West Side Chicago and select South Suburban areas. Eligible: 501(c)(3) nonprofits with GATA registration. Annual cycle. Awards $75K-$1M per year.',
    program_areas:     ['violence prevention', 'reentry services', 'trauma-informed care', 'victim services'],
    target_population: ['high-poverty communities', 'system-involved adults and youth', 'low-income', 'underserved'],
    amount_min:        75_000,
    amount_max:        1_000_000,
    deadline:          null,
    requires_lmi:      true,
    reference_url:     'https://icjia.illinois.gov/about/funding/',
  },
  {
    external_id:  'gata_dceo_workforce',
    title:        'DCEO Apprenticeship Illinois & Workforce Equity',
    agency:       'Illinois Department of Commerce & Economic Opportunity',
    description:  'Illinois DCEO funds apprenticeship intermediary organizations, workforce-equity sectoral training, and youth career exploration programs. Priority for programs serving low-income workers, returning citizens, and underrepresented populations in high-demand sectors. Eligible: 501(c)(3) nonprofits, community colleges, and intermediary organizations with GATA registration. Awards typically $100K-$500K per year.',
    program_areas:     ['workforce development', 'apprenticeship', 'sectoral training', 'career exploration'],
    target_population: ['low-income workers', 'returning citizens', 'underrepresented populations'],
    amount_min:        100_000,
    amount_max:        500_000,
    deadline:          null,
    requires_lmi:      true,
    reference_url:     'https://dceo.illinois.gov/workforcedevelopment.html',
  },
] as const;

function normalize(seed: GataSeed): NormalizedOpportunity {
  return {
    external_id:  seed.external_id,
    reference:    seed.reference_url,
    title:        seed.title,
    funder_name:  seed.agency,
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
      requires_lmi:      seed.requires_lmi,
    },
    segment_tags: [...seed.program_areas],
    raw:          seed as unknown as Record<string, unknown>,
  };
}

export const illinoisGataAdapter: GrantSourceAdapter = {
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
