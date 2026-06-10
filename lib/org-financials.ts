/**
 * Org financial profile resolution.
 *
 * Returns the (computed, org, history) triple from whichever source has the
 * freshest data:
 *   1. A code-resident fixture for tenants that have one (transitional —
 *      CYC's hand-audited FY2025 data lives here until Phase 2 promotes
 *      it into a normalized financial-history table)
 *   2. The org's `financial_data` jsonb in the organizations table
 *
 * This replaces the inlined `if (orgCode === 'CYC2025') return CYC_…` checks
 * that used to live in `actions/discovery.ts` and
 * `app/api/financial-verdict/route.ts`.
 */

import { createServerClient } from '@/lib/supabase';
import { CYC_FINANCIAL_PROFILE, buildCycIntelligenceContext } from '@/lib/cyc-live-data';
import type { ComputedFinancials, OrgProfile } from '@/lib/propublica';

export interface OrgFinancialProfile {
  computed:     ComputedFinancials;
  org:          OrgProfile;
  history?:     Array<{ tax_prd_yr: number; totrevenue: number; totfuncexpns: number; compnsatncurrofcr: number }>;
  profileData?: Record<string, number>;
  /** Where the data came from — useful when surfacing freshness in the UI. */
  source:       'fixture' | 'organizations.financial_data';
  /** Rich org-specific prose for the advisor system prompt (optional, fixture-only). */
  buildIntelligenceContext?: () => string;
}

interface FixtureRecord {
  computed: ComputedFinancials;
  org:      OrgProfile;
  history?: OrgFinancialProfile['history'];
  /** Optional org-specific intelligence-context builder for the chat advisor. */
  buildIntelligenceContext?: () => string;
}

// Transitional registry: org_codes that have a code-resident fixture. This
// is the ONE place in business logic that knows fixtures exist by org_code
// — every other call site asks getOrgFinancialProfile() rather than
// branching on a literal. Phase 2 migrates each fixture to a DB row.
const FIXTURES: Record<string, FixtureRecord> = {
  CYC2025: {
    ...CYC_FINANCIAL_PROFILE,
    buildIntelligenceContext: buildCycIntelligenceContext,
  },
};

export async function getOrgFinancialProfile(orgCode: string): Promise<OrgFinancialProfile | null> {
  const fixture = FIXTURES[orgCode];
  if (fixture) return { ...fixture, source: 'fixture' };

  const db = createServerClient();
  const { data } = await db
    .from('organizations')
    .select('financial_data, profile_data')
    .eq('org_code', orgCode)
    .single();

  const fd = data?.financial_data as
    { computed?: ComputedFinancials; org?: OrgProfile; history?: OrgFinancialProfile['history'] } | null;
  if (!fd?.computed || !fd?.org) return null;

  return {
    computed:    fd.computed,
    org:         fd.org,
    history:     fd.history,
    profileData: (data?.profile_data as Record<string, number>) || undefined,
    source:      'organizations.financial_data',
  };
}
