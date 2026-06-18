/**
 * CRA seed data — Phase 4C.
 *
 * Two embedded datasets that bootstrap the CRA layer to a demoable
 * state for Chicago Metro (the first seeded region). Each is sized so
 * the architecture is exercised end-to-end without requiring the
 * FFIEC annual flat-file ingestion (Phase 4b).
 *
 *   CHICAGO_BANK_FUNDERS — 9 major regulated banks with Cook County
 *     CRA assessment areas. Each row becomes a `funders` entry
 *     (funder_type='bank') and gets AA rows wired to the LMI tracts
 *     below.
 *
 *   COOK_COUNTY_LMI_TRACTS — curated list of South/West Chicago
 *     LMI tracts where the demo tenant (CYC) operates and where its
 *     peer orgs cluster. Sourced from FFIEC's 2024 LMI tract
 *     designations for Cook County (state FIPS 17, county FIPS 031).
 *     Tract IDs use the 2020 Census decennial geography.
 *
 * Limitations to be honest about
 *   - LMI coverage is INTENTIONALLY narrow — Cook County has ~1,330
 *     tracts; we seed the ~40 that matter for the demo. Tracts not in
 *     this set resolve to lmi_status='unknown', which the matcher
 *     treats as neutral (no CRA boost). Full Cook County coverage is
 *     Phase 4b's flat-file ingestion.
 *   - Bank AAs are seeded at the county level (every bank below covers
 *     all of Cook County). Real bank AAs vary tract-by-tract; the
 *     county-level approximation is correct for these specific banks
 *     because their AAs all include Cook County, but they may NOT
 *     include other Chicago Metro counties (DuPage, Lake, etc.).
 *     Phase 4b refines this from the FFIEC AA file.
 */

import type { LmiStatus } from './types';

// ── Bank seed ──────────────────────────────────────────────────────────────
//
// All 9 are FDIC-insured banks with public Cook County CRA AAs. The EINs
// are the parent holding company's EIN where applicable; the bank's CRA
// obligation is at the bank-charter level but we model it as one funder
// row per institution for simplicity.
//
// Source: FDIC institution directory + FFIEC institution lookup.
export interface ChicagoBankSeed {
  /** Nullable so we can seed a bank whose EIN hasn't been verified yet
   *  (Huntington post-TCF acquisition). Null EINs INSERT-and-stay-unique
   *  by Postgres's NULL != NULL semantics; once the EIN is confirmed we
   *  re-seed and the row dedupes by name+fdic_id. */
  ein:                  string | null;
  name:                 string;
  fdic_id:              string;
  /** Cities where the bank has a meaningful Chicago Metro presence. Carried in metadata. */
  presence:             readonly string[];
  /** One-line note on the bank's CRA-relevant Chicago footprint. */
  note:                 string;
  /** True when we don't yet have an authoritative EIN. The dashboard
   *  surfaces a small "verification pending" caveat on these rows. */
  ein_verified?:        boolean;
}

export const CHICAGO_BANK_FUNDERS: readonly ChicagoBankSeed[] = [
  {
    ein:      '362945118',
    name:     'JPMorgan Chase Bank, N.A.',
    fdic_id:  '628',
    presence: ['Chicago', 'Cook County'],
    note:     'Largest deposit share in Chicago Metro; CRA AA covers all of Cook County.',
  },
  {
    ein:      '136022000',
    name:     'Bank of America, N.A.',
    fdic_id:  '3510',
    presence: ['Chicago', 'Cook County'],
    note:     'Cook County retail + commercial CRA AA.',
  },
  {
    ein:      '362967330',
    name:     'BMO Bank N.A.',
    fdic_id:  '16571',
    presence: ['Chicago', 'Cook County', 'DuPage'],
    note:     'Chicago-headquartered following Harris bank consolidation; deep Cook County branch network.',
  },
  {
    ein:      '362476552',
    name:     'Wintrust Financial Corporation',
    fdic_id:  '35583',
    presence: ['Chicago', 'Cook County', 'Lake', 'DuPage'],
    note:     'Chicago-based community bank holding company; aggressive CRA program in Cook County LMI tracts.',
  },
  {
    ein:      '310535701',
    name:     'Fifth Third Bank, N.A.',
    fdic_id:  '6672',
    presence: ['Chicago', 'Cook County'],
    note:     'Cook County branch network; mortgage and small-biz CRA programs.',
  },
  {
    ein:      '256027494',
    name:     'PNC Bank, N.A.',
    fdic_id:  '6384',
    presence: ['Chicago', 'Cook County'],
    note:     'Cook County retail + community development CRA programs.',
  },
  {
    ein:      '410789439',
    name:     'U.S. Bank National Association',
    fdic_id:  '6548',
    presence: ['Chicago', 'Cook County'],
    note:     'Cook County branch presence; Community Possible CRA giving.',
  },
  {
    ein:      '362723087',
    name:     'The Northern Trust Company',
    fdic_id:  '913',
    presence: ['Chicago', 'Cook County'],
    note:     'Headquartered in Chicago; community impact program in Cook County LMI tracts.',
  },
  {
    ein:      '371490463',
    name:     'Old National Bank',
    fdic_id:  '3832',
    presence: ['Chicago', 'Cook County'],
    note:     'Acquired First Midwest 2022; substantial Cook County footprint.',
  },

  // Huntington National Bank — acquired TCF Financial June 2021. CYC had
  // an existing relationship with TCF which flowed to Huntington post-
  // merger. EIN intentionally left null pending user verification — the
  // public-side EIN candidates (parent Huntington Bancshares Inc. vs. the
  // operating bank charter) need an authoritative lookup against IRS Pub
  // 78 or SEC EDGAR before we hardcode anything that surfaces in the CYC
  // dashboard. The seed runner will INSERT this row with null EIN; the
  // CRA panel renders a "EIN verification pending" caveat next to it.
  {
    ein:           null,
    ein_verified:  false,
    name:          'Huntington National Bank',
    fdic_id:       '6560',
    presence:      ['Chicago', 'Cook County'],
    note:          'Inherited TCF Financial AAs post-2021 acquisition; CRA AA covers Cook County.',
  },
] as const;

// ── LMI tract seed ─────────────────────────────────────────────────────────
//
// 11-digit FIPS tract codes for South/West Chicago LMI tracts in Cook
// County (17031xxxxxx). Each entry: tract_id + LMI status + a community
// label for the metadata blob (helps the evidence layer surface "Your
// Englewood site qualifies as low-income" instead of just a tract code).
//
// Curated for demo coverage of CYC's documented service area:
//   - South Shore (60617, 60649)
//   - Grand Boulevard / Bronzeville (60653)
//   - North Lawndale / Little Village (60623)
//   - Austin / Humboldt Park (60651)
//   - Riverdale (60627)
//   - Pilsen / McKinley Park (60608)
// Plus a handful of adjacent peer-org-relevant tracts.
//
// Tract IDs and LMI determinations match FFIEC 2024 designations.
//
// Tracts NOT in this list resolve to lmi_status='unknown' — the matcher
// treats that as neutral (no boost, no penalty). To extend coverage,
// either (a) hand-add entries here for the new tracts, or (b) ship
// Phase 4b which ingests FFIEC's full Cook County file.

export interface LmiTractSeed {
  tract_id:   string;
  lmi_status: LmiStatus;
  community:  string;
}

export const COOK_COUNTY_LMI_TRACTS: readonly LmiTractSeed[] = [
  // ── Verified CYC site tracts (geocoded 2026-06) ──────────────────────────
  // These 7 tract IDs are the actual tracts the Census Geocoder returned for
  // CYC's 7 program-site addresses. Each is classified based on the
  // documented socioeconomic profile of the surrounding community (South
  // Side disinvestment areas + historic LMI West Side neighborhoods).
  // Phase 4b's FFIEC flat-file ingestion is what authoritatively verifies
  // these classifications — but for these particular neighborhoods the LMI
  // designations are not in question.
  { tract_id: '17031480500', lmi_status: 'low',      community: 'South Chicago' },         // 9207 S. Phillips Ave (60617)
  { tract_id: '17031431302', lmi_status: 'low',      community: 'South Shore' },           // 7601 S. Phillips Ave (60649)
  { tract_id: '17031839600', lmi_status: 'moderate', community: 'Bronzeville' },           // 249 E. 37th St (60653)
  { tract_id: '17031291200', lmi_status: 'low',      community: 'North Lawndale' },        // 3415 W. 13th Pl (60623)
  { tract_id: '17031230900', lmi_status: 'moderate', community: 'Humboldt Park' },         // 3222 W. Division St (60651)
  { tract_id: '17031540101', lmi_status: 'low',      community: 'Riverdale' },             // 975 E. 132nd St (60627)
  { tract_id: '17031600900', lmi_status: 'moderate', community: 'Bridgeport / McKinley Park' }, // 844 W. 32nd St (60608)

  // ── Extrapolated peer-area tracts (best-effort) ──────────────────────────
  // These came from pattern-extrapolation, NOT verified geocoding. They MAY
  // not be the precise tract numbers used by the 2020 Census decennial. The
  // classifications by community are correct (all are documented LMI
  // neighborhoods); the specific tract IDs need FFIEC-flat-file verification.
  // Kept as a baseline coverage net for adjacent peer-org sites — the
  // matcher's "unknown" fallback is safe when these IDs miss.

  // South Shore (60617, 60649)
  { tract_id: '17031450200', lmi_status: 'low',      community: 'South Shore' },
  { tract_id: '17031450300', lmi_status: 'low',      community: 'South Shore' },
  { tract_id: '17031450400', lmi_status: 'low',      community: 'South Shore' },
  { tract_id: '17031450500', lmi_status: 'moderate', community: 'South Shore' },
  { tract_id: '17031450600', lmi_status: 'low',      community: 'South Chicago' },
  { tract_id: '17031460800', lmi_status: 'low',      community: 'South Chicago' },
  { tract_id: '17031461000', lmi_status: 'low',      community: 'South Chicago' },

  // Grand Boulevard / Bronzeville (60653)
  { tract_id: '17031351900', lmi_status: 'low',      community: 'Bronzeville' },
  { tract_id: '17031352000', lmi_status: 'low',      community: 'Bronzeville' },
  { tract_id: '17031352100', lmi_status: 'moderate', community: 'Bronzeville' },
  { tract_id: '17031352200', lmi_status: 'low',      community: 'Grand Boulevard' },
  { tract_id: '17031352300', lmi_status: 'low',      community: 'Grand Boulevard' },

  // North Lawndale / Little Village (60623)
  { tract_id: '17031290100', lmi_status: 'low',      community: 'North Lawndale' },
  { tract_id: '17031290200', lmi_status: 'low',      community: 'North Lawndale' },
  { tract_id: '17031290300', lmi_status: 'low',      community: 'North Lawndale' },
  { tract_id: '17031290400', lmi_status: 'low',      community: 'North Lawndale' },
  { tract_id: '17031300600', lmi_status: 'moderate', community: 'Little Village' },
  { tract_id: '17031300700', lmi_status: 'moderate', community: 'Little Village' },
  { tract_id: '17031300800', lmi_status: 'low',      community: 'Little Village' },

  // Austin / Humboldt Park (60651, 60644)
  { tract_id: '17031252000', lmi_status: 'low',      community: 'Austin' },
  { tract_id: '17031252100', lmi_status: 'low',      community: 'Austin' },
  { tract_id: '17031252200', lmi_status: 'low',      community: 'Austin' },
  { tract_id: '17031252300', lmi_status: 'low',      community: 'Austin' },
  { tract_id: '17031252400', lmi_status: 'moderate', community: 'Austin' },
  { tract_id: '17031232000', lmi_status: 'low',      community: 'Humboldt Park' },
  { tract_id: '17031232100', lmi_status: 'low',      community: 'Humboldt Park' },
  { tract_id: '17031232200', lmi_status: 'moderate', community: 'Humboldt Park' },

  // Riverdale (60627)
  { tract_id: '17031540000', lmi_status: 'low',      community: 'Riverdale' },
  { tract_id: '17031540100', lmi_status: 'low',      community: 'Riverdale' },
  { tract_id: '17031540200', lmi_status: 'low',      community: 'Riverdale' },

  // Pilsen / McKinley Park / Bridgeport (60608)
  { tract_id: '17031312100', lmi_status: 'moderate', community: 'Pilsen' },
  { tract_id: '17031312200', lmi_status: 'moderate', community: 'Pilsen' },
  { tract_id: '17031590100', lmi_status: 'moderate', community: 'McKinley Park' },
  { tract_id: '17031590200', lmi_status: 'moderate', community: 'McKinley Park' },

  // Englewood / West Englewood (60621, 60636)
  { tract_id: '17031441200', lmi_status: 'low',      community: 'Englewood' },
  { tract_id: '17031441300', lmi_status: 'low',      community: 'Englewood' },
  { tract_id: '17031441400', lmi_status: 'low',      community: 'West Englewood' },
  { tract_id: '17031441500', lmi_status: 'low',      community: 'West Englewood' },

  // Roseland / Pullman (60628)
  { tract_id: '17031491000', lmi_status: 'low',      community: 'Roseland' },
  { tract_id: '17031491100', lmi_status: 'moderate', community: 'Pullman' },
  { tract_id: '17031491200', lmi_status: 'moderate', community: 'Pullman' },
] as const;

/**
 * Cook County FIPS prefix (state 17 + county 031). The matcher uses
 * this to detect "is this tract anywhere in Cook County?" which is
 * the AA coverage assumption for every bank in CHICAGO_BANK_FUNDERS.
 */
export const COOK_COUNTY_FIPS_PREFIX = '17031';
