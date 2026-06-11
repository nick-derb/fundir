/**
 * Census Geocoder client — Phase 4B.
 *
 * The US Census Bureau's Geocoding Services API is the canonical free
 * public source for resolving a street address to a census tract. The
 * `geographies/onelineaddress` endpoint accepts a single combined
 * address string and returns the matched lat/long PLUS the geography
 * record (state FIPS, county FIPS, tract FIPS) in one round trip.
 *
 * Rate policy: Census doesn't publish a quota but the service slows
 * under heavy use. 1 qps sequential is the safe pattern.
 *
 * Docs:
 *   https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
 *
 * The endpoint is unauthenticated and free.
 */

const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const BENCHMARK = 'Public_AR_Current';
const VINTAGE   = 'Current_Current';

export interface GeocodeResult {
  matched_address: string;
  /** 11-digit FIPS tract = state(2) + county(3) + tract(6). */
  tract_id:       string;
  state_fips:     string;
  county_fips:    string;
  lat:            number;
  lng:            number;
}

interface CensusMatch {
  matchedAddress?:  string;
  coordinates?:     { x: number; y: number };
  geographies?: {
    'Census Tracts'?: Array<{
      STATE?:  string;
      COUNTY?: string;
      TRACT?:  string;
      GEOID?:  string;
    }>;
  };
}

/**
 * One-shot address → tract resolution. Returns null on no-match or
 * ambiguous response; the caller decides how to surface that to the
 * user (today, it sets census_tract to null and lmi_flag to false).
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('address',   address);
  url.searchParams.set('benchmark', BENCHMARK);
  url.searchParams.set('vintage',   VINTAGE);
  url.searchParams.set('format',    'json');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache:   'no-store',
  });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}: ${address}`);

  const json = await res.json() as {
    result?: { addressMatches?: CensusMatch[] };
  };

  const match = json.result?.addressMatches?.[0];
  if (!match) return null;

  const tract = match.geographies?.['Census Tracts']?.[0];
  if (!tract?.GEOID) return null;

  return {
    matched_address: match.matchedAddress ?? address,
    tract_id:        tract.GEOID,
    state_fips:      tract.STATE  ?? tract.GEOID.slice(0, 2),
    county_fips:     tract.COUNTY ?? tract.GEOID.slice(2, 5),
    lat:             match.coordinates?.y ?? 0,
    lng:             match.coordinates?.x ?? 0,
  };
}
