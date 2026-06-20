/**
 * Org-address resolution — Phase 4D.
 *
 * Reads each org's program-site addresses out of profile_data, geocodes
 * them, upserts the resulting tracts into census_tracts (with the LMI
 * status from our seed when known), and writes the consolidated tract +
 * lmi_flag onto organizations.
 *
 * The org's PRIMARY tract is the one with the most program sites — when
 * the matcher needs a single answer ("is this org in an LMI area?"), the
 * primary tract is what it reads.
 *
 * Rate policy: 1 req/sec to Census, sequential. CYC has 7 sites so a
 * full run is <10s.
 */

import { createServerClient } from '@/lib/supabase';
import { geocodeAddress } from './geocoder';
import { upsertTract } from './repo';
import { COOK_COUNTY_LMI_TRACTS } from './seed-data';
import type { LmiStatus } from './types';

const SEEDED_LMI_LOOKUP = new Map<string, LmiStatus>(
  COOK_COUNTY_LMI_TRACTS.map(t => [t.tract_id, t.lmi_status]),
);

const SEEDED_COMMUNITY_LOOKUP = new Map<string, string>(
  COOK_COUNTY_LMI_TRACTS.map(t => [t.tract_id, t.community]),
);

const SLEEP_BETWEEN_GEOCODES_MS = 1100;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * What the resolver pulls out of the org's `profile_data` jsonb. Stays
 * loose because tenants land here with different shapes — some have a
 * `program_sites` array, some have a single `geographic_service_area`
 * string, some have neither yet.
 */
interface OrgAddressSet {
  org_id:    string;
  addresses: string[];
}

function extractAddresses(profileData: Record<string, unknown> | null | undefined): string[] {
  if (!profileData) return [];
  const sites = profileData.program_sites;
  if (!Array.isArray(sites)) return [];
  return sites
    .map(s => {
      if (typeof s !== 'object' || !s) return null;
      const addr = (s as Record<string, unknown>).address;
      return typeof addr === 'string' ? addr : null;
    })
    .filter((s): s is string => !!s);
}

async function loadOrgAddresses(orgId: string): Promise<OrgAddressSet | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('organizations')
    .select('id, profile_data')
    .eq('id', orgId)
    .single();
  if (error || !data) return null;
  return {
    org_id:    data.id,
    addresses: extractAddresses(data.profile_data as Record<string, unknown> | null),
  };
}

export interface ResolveOrgResult {
  org_id:          string;
  addresses_seen:  number;
  tracts_resolved: number;
  primary_tract:   string | null;
  primary_lmi:     LmiStatus;
  /** True iff ANY resolved tract has LMI low/moderate. */
  lmi_flag:        boolean;
  errors:          string[];
}

/**
 * Geocode every program-site address for one org, upsert each tract
 * into census_tracts, decide the org's primary tract, write
 * organizations.{census_tract, lmi_flag}.
 *
 * Tracts not in the seeded LMI lookup land in census_tracts with
 * lmi_status='unknown' — the matcher treats them as neutral. Marking
 * them low/moderate later is a manual update (or, in Phase 4b, a full
 * FFIEC ingest).
 */
export async function resolveOrgAddresses(orgId: string): Promise<ResolveOrgResult> {
  const errors: string[] = [];
  const addressSet = await loadOrgAddresses(orgId);
  if (!addressSet) {
    return {
      org_id: orgId, addresses_seen: 0, tracts_resolved: 0,
      primary_tract: null, primary_lmi: 'unknown', lmi_flag: false,
      errors: ['Org not found or no profile_data'],
    };
  }

  // Tally tracts: how many sites land in each, plus the LMI status.
  const tractTally = new Map<string, { count: number; lmi: LmiStatus }>();

  for (const addr of addressSet.addresses) {
    try {
      const geo = await geocodeAddress(addr);
      if (!geo) {
        errors.push(`No geocode match: ${addr}`);
        await sleep(SLEEP_BETWEEN_GEOCODES_MS);
        continue;
      }
      // Look up the LMI status + community label from our seed. Outside
      // Cook County or outside the seeded list → 'unknown' / no
      // community label, which the matcher treats as neutral evidence.
      const lmi       = SEEDED_LMI_LOOKUP.get(geo.tract_id) ?? 'unknown';
      const community = SEEDED_COMMUNITY_LOOKUP.get(geo.tract_id);
      await upsertTract({
        tract_id:   geo.tract_id,
        lmi_status: lmi,
        metadata: {
          state_fips:    geo.state_fips,
          county_fips:   geo.county_fips,
          matched_from:  addr,
          last_seen_at:  new Date().toISOString(),
          // Only set community when known so unverified tracts don't
          // carry a confidently-wrong label.
          ...(community ? { community } : {}),
        },
      });
      const prior = tractTally.get(geo.tract_id);
      tractTally.set(geo.tract_id, {
        count: (prior?.count ?? 0) + 1,
        lmi:   lmi,
      });
    } catch (err) {
      errors.push(`geocode ${addr}: ${String(err)}`);
    }
    await sleep(SLEEP_BETWEEN_GEOCODES_MS);
  }

  // Pick the org's primary tract — the one with the most sites. Tiebreak
  // by LMI-first (low > moderate > middle > upper > unknown) so the org
  // gets the boost when two tracts tie on site count.
  const LMI_RANK: Record<LmiStatus, number> = {
    low: 0, moderate: 1, middle: 2, upper: 3, unknown: 4,
  };
  let primary: { tract_id: string; lmi: LmiStatus; count: number } | null = null;
  for (const [tract_id, info] of tractTally) {
    if (!primary
      || info.count > primary.count
      || (info.count === primary.count && LMI_RANK[info.lmi] < LMI_RANK[primary.lmi])) {
      primary = { tract_id, lmi: info.lmi, count: info.count };
    }
  }

  const lmi_flag = [...tractTally.values()].some(t => t.lmi === 'low' || t.lmi === 'moderate');

  // Persist on the org row. lmi_flag is denormalized for fast filtering;
  // the canonical source is the join into census_tracts.
  const db = createServerClient();
  const { error: updateErr } = await db
    .from('organizations')
    .update({
      census_tract: primary?.tract_id ?? null,
      lmi_flag,
    })
    .eq('id', orgId);
  if (updateErr) errors.push(`update org: ${updateErr.message}`);

  return {
    org_id:          orgId,
    addresses_seen:  addressSet.addresses.length,
    tracts_resolved: tractTally.size,
    primary_tract:   primary?.tract_id ?? null,
    primary_lmi:     primary?.lmi      ?? 'unknown',
    lmi_flag,
    errors,
  };
}

/**
 * Helper for the demo: CYC's lib/cyc-live-data.ts CYC_SITES const carries
 * the 7 site addresses but they're NOT yet copied into
 * organizations.profile_data.program_sites for every tenant. This
 * function reads them straight out of the constant for the CYC seed
 * tenant so the demo path doesn't depend on prior profile editing.
 *
 * Out-of-band by design — the production path is `extractAddresses` from
 * profile_data above; this is the one-time bridge.
 */
export async function resolveOrgAddressesFromCycLiveData(orgCode: string): Promise<ResolveOrgResult> {
  if (orgCode !== 'CYC2026') {
    return resolveOrgAddresses(orgCode);
  }

  // Pull addresses straight from the fixture for CYC.
  // Dynamic import keeps cyc-live-data out of the bundle for other tenants.
  const { CYC_SITES } = await import('@/lib/cyc-live-data');

  const db = createServerClient();
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, profile_data')
    .eq('org_code', 'CYC2026')
    .single();
  if (orgErr || !org) {
    return {
      org_id: '', addresses_seen: 0, tracts_resolved: 0,
      primary_tract: null, primary_lmi: 'unknown', lmi_flag: false,
      errors: ['CYC org not found'],
    };
  }

  // Stitch the addresses into profile_data so future resolveOrgAddresses
  // calls find them at the standard path. Idempotent.
  const profile = (org.profile_data ?? {}) as Record<string, unknown>;
  const existingSites = Array.isArray(profile.program_sites) ? profile.program_sites : [];
  const addressSet = new Set<string>();
  for (const s of existingSites) {
    if (typeof s === 'object' && s) {
      const a = (s as Record<string, unknown>).address;
      if (typeof a === 'string') addressSet.add(a);
    }
  }
  for (const site of CYC_SITES) {
    addressSet.add(site.address);
  }
  const program_sites = [...addressSet].map(address => ({ address }));
  const { error: updErr } = await db
    .from('organizations')
    .update({ profile_data: { ...profile, program_sites } })
    .eq('id', org.id);
  if (updErr) {
    return {
      org_id: org.id, addresses_seen: 0, tracts_resolved: 0,
      primary_tract: null, primary_lmi: 'unknown', lmi_flag: false,
      errors: [`pre-populate profile_data: ${updErr.message}`],
    };
  }

  return resolveOrgAddresses(org.id);
}
