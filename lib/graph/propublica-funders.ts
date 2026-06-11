/**
 * ProPublica funder ingestion — Phase 2B.
 *
 * Pulls private foundations (NTEE code starting with "T") from
 * ProPublica's Nonprofit Explorer API, filtered to the states a Fundir
 * region covers, and upserts them into `funders`.
 *
 * Honest scope note: ProPublica's public API exposes 990 filing metadata
 * (totals, NTEE, location, last-filed year) but NOT 990-PF Schedule I —
 * the grant-recipient detail that powers funder→recipient edges. Phase
 * 2B populates funders; edges (grants_made) come from Phase 2E's
 * SEED_FOUNDATIONS bridge for the day-one demo, and from Phase 4b's
 * PDF-parsing work for the long tail.
 *
 * Rate-limit policy: 1 request per second, sequential. ProPublica
 * doesn't publish a quota but throttles aggressive scrapers. The cron
 * (Phase 2D) ingests one state per nightly run so a region with 50
 * states would take ~5 minutes at this pace — well inside maxDuration.
 */

import { upsertFunder } from './repo';
import type { FunderType } from './types';

const BASE = 'https://projects.propublica.org/nonprofits/api/v2';

interface PPOrgSearchHit {
  ein:            string;
  name:           string;
  city:           string;
  state:          string;
  ntee_code:      string;
  income_amount:  number;
  asset_amount:   number;
  revenue_amount: number;
}

interface PPSearchResponse {
  total_results:    number;
  num_pages:        number;
  cur_page:         number;
  organizations:    PPOrgSearchHit[];
}

const SLEEP_BETWEEN_REQUESTS_MS = 1100; // 1 qps, slightly under

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * One page of foundation search results from ProPublica.
 * - ntee[major]=T narrows to philanthropy/grantmaking foundations.
 * - state[id]=XX narrows to one state.
 * - page is 0-indexed.
 */
async function fetchFoundersPage(state: string, page: number): Promise<PPSearchResponse> {
  const url = `${BASE}/search.json?ntee[id]=8&state[id]=${encodeURIComponent(state)}&page=${page}`;
  // ntee[id]=8 in ProPublica's enum = "T - Philanthropy, Voluntarism, &
  // Grantmaking Foundations". That's the category we want; 990-PF filers
  // overwhelmingly live here.

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ProPublica search ${state} page ${page}: ${res.status}`);
  const json = (await res.json()) as PPSearchResponse;
  return json;
}

function classifyFunderType(hit: PPOrgSearchHit): FunderType {
  const lower = hit.name.toLowerCase();
  if (/community trust|community foundation|community fund/.test(lower)) {
    return 'community_foundation';
  }
  if (/bank|trust company|bancorp/.test(lower) && hit.ntee_code?.startsWith('W')) {
    return 'bank';
  }
  // Corporate giving programs frequently share a name with the parent
  // company. We don't have a strong heuristic from search alone; default
  // to private_foundation and let downstream tooling refine.
  return 'private_foundation';
}

export interface IngestFundersResult {
  state:        string;
  pages_seen:   number;
  funders_seen: number;
  funders_kept: number;
  errors:       string[];
  /** Page index to resume on next run. null when finished. */
  next_cursor:  string | null;
}

/**
 * Ingest one state's foundations, starting from `startPage`. Bounded by
 * `maxPages` so a single cron invocation doesn't blow the wall-clock
 * budget. Returns a cursor (next page index as a string) for the
 * resumable runner to persist.
 *
 * Idempotent — every funder is upserted on EIN, so re-running this is
 * safe and only triggers writes for changed metadata.
 */
export async function ingestFundersForState(
  state: string,
  startPage: number = 0,
  maxPages: number = 5,
): Promise<IngestFundersResult> {
  const errors: string[] = [];
  let funders_seen = 0;
  let funders_kept = 0;
  let pages_seen   = 0;
  let nextPage:    number | null = null;

  for (let p = startPage; p < startPage + maxPages; p++) {
    let pageResult: PPSearchResponse;
    try {
      pageResult = await fetchFoundersPage(state, p);
    } catch (err) {
      errors.push(`${state} page ${p}: ${String(err)}`);
      // A page failure is not fatal — save the cursor so the next run
      // picks up here and try the cron again.
      nextPage = p;
      break;
    }
    pages_seen += 1;

    for (const hit of pageResult.organizations) {
      funders_seen += 1;
      if (!hit.ein) continue; // can't dedupe without EIN
      try {
        await upsertFunder({
          ein:         hit.ein,
          name:        hit.name,
          funder_type: classifyFunderType(hit),
          metadata: {
            city:           hit.city,
            state:          hit.state,
            ntee_code:      hit.ntee_code,
            income_amount:  hit.income_amount,
            asset_amount:   hit.asset_amount,
            revenue_amount: hit.revenue_amount,
            source:         'propublica_990pf',
            last_seen_at:   new Date().toISOString(),
          },
        });
        funders_kept += 1;
      } catch (err) {
        errors.push(`upsert ${hit.ein}: ${String(err)}`);
      }
    }

    // Done if we've consumed the last page.
    if (p >= pageResult.num_pages - 1) {
      nextPage = null;
      break;
    }
    nextPage = p + 1;
    await sleep(SLEEP_BETWEEN_REQUESTS_MS);
  }

  return {
    state,
    pages_seen,
    funders_seen,
    funders_kept,
    errors,
    next_cursor: nextPage == null ? null : String(nextPage),
  };
}
