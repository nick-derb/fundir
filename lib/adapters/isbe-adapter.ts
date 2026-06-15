/**
 * Illinois State Board of Education (ISBE).
 *
 * ISBE flows substantial federal pass-through funding (Title I, Title
 * IV-A, 21st CCLC, Early Childhood Block Grant) plus state-funded
 * After School Matters–style programs. Community-based 501(c)(3)s are
 * eligible for many of these as sub-grantees or direct applicants —
 * particularly the after-school and early-childhood streams.
 *
 * Phase 5A seed. Phase 5B can replace with a scrape against:
 *   https://www.isbe.net/Pages/Grants.aspx
 */

import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'isbe';

interface IsbeSeed {
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

const SEED: readonly IsbeSeed[] = [
  {
    external_id:  'isbe_21cclc_state_portion',
    title:        'ISBE 21st Century Community Learning Centers (state administration)',
    description:  'Illinois State Board of Education administers federal 21st Century Community Learning Centers funding for before/after-school and summer enrichment in high-poverty Title I attendance areas. 5-year cycle. Eligible: 501(c)(3) nonprofits and LEAs serving Illinois students. Priority for programs serving schools where 40% or more of students are from low-income families. Awards $50K-$300K per year per site.',
    program_areas:     ['afterschool', '21st century learning', 'youth enrichment', 'summer programs'],
    target_population: ['low-income youth', 'Title I students', 'high-poverty schools', 'underserved'],
    amount_min:        50_000,
    amount_max:        300_000,
    deadline:          null,
    reference_url:     'https://www.isbe.net/Pages/21stCCLC.aspx',
  },
  {
    external_id:  'isbe_early_childhood_block_grant',
    title:        'ISBE Early Childhood Block Grant (Preschool For All)',
    description:  'Illinois State Board of Education funds the Early Childhood Block Grant covering Preschool For All, Prevention Initiative (birth to 3), and other early-learning streams. Priorities: at-risk children, low-income families, and English Learner households. Eligible: 501(c)(3) nonprofits operating licensed early-learning programs and LEAs. Substantial multi-year awards; community-based agencies typically receive $200K-$2M+ per year.',
    program_areas:     ['early childhood education', 'preschool', 'birth-to-3', 'school readiness'],
    target_population: ['low-income families', 'at-risk children', 'English Learners', 'underserved'],
    amount_min:        200_000,
    amount_max:        2_000_000,
    deadline:          null,
    reference_url:     'https://www.isbe.net/Pages/EarlyChildhood.aspx',
  },
] as const;

function normalize(seed: IsbeSeed): NormalizedOpportunity {
  return {
    external_id:  seed.external_id,
    reference:    seed.reference_url,
    title:        seed.title,
    funder_name:  'Illinois State Board of Education',
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
      requires_lmi:      true, // both ISBE seeds explicitly prioritize LMI
    },
    segment_tags: [...seed.program_areas],
    raw:          seed as unknown as Record<string, unknown>,
  };
}

export const isbeAdapter: GrantSourceAdapter = {
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
