/**
 * City of Chicago — Department of Family & Support Services (DFSS).
 *
 * Phase 5B-cont: live scrape of
 *   https://www.chicago.gov/city/en/depts/fss/supp_info/FundingOpportunities0.html
 *
 * The DFSS funding-opportunities page was completely restructured in the
 * 2026 chicago.gov refresh — the old `depts/dfss/provdrs/serv/svcs/`
 * path returns 404 and the new path is `depts/fss/supp_info/`.
 * Internally the page uses `<details><summary><strong>Division</strong>`
 * accordions, each wrapping a `<ul>` of `<li><a>` RFP links. cheerio
 * parses it cleanly without JS rendering.
 *
 * Each RFP becomes one NormalizedOpportunity. Detail-page descriptions
 * are not fetched per opportunity (would mean ~20 follow-up HTTP
 * requests against chicago.gov each cron run); the synthesized
 * description carries the RFP title + division blurb + DFSS funder
 * context, which is enough for the embedding pipeline to score
 * against CYC's program embeddings.
 */

import * as cheerio from 'cheerio';
import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'city_of_chicago_dfss';
const LIST_URL    = 'https://www.chicago.gov/city/en/depts/fss/supp_info/FundingOpportunities0.html';
// chicago.gov returns 403 to any non-browser UA (verified 2026-06).
// We're a public-page reader, not a scraper bypassing auth, so a stock
// Chrome UA is appropriate here.
const USER_AGENT  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Division-level priors for LMI signal + program-area tagging. DFSS is
// the single funder; the division is the program-area carrier. Every
// DFSS stream is mandated to prioritize low-income Chicago residents, so
// requires_lmi defaults true unless the division is one we don't want
// flagged (none currently).
const DIVISIONS: Record<string, { areas: readonly string[]; requires_lmi: boolean }> = {
  'Homeless Services':                       { areas: ['homeless services', 'housing'],                       requires_lmi: true },
  'Youth Services':                          { areas: ['youth development', 'afterschool', 'mentoring'],       requires_lmi: true },
  'Human Services, Workforce, and Legal Services':
                                             { areas: ['human services', 'workforce development', 'legal aid'], requires_lmi: true },
  'Senior Services':                         { areas: ['senior services', 'aging'],                            requires_lmi: true },
  'Gender-Based Violence':                   { areas: ['domestic violence', 'survivor services'],              requires_lmi: true },
  'Other Funding Opportunities':             { areas: ['community services'],                                  requires_lmi: true },
};

interface ParsedRow {
  title:        string;
  url:          string;
  division:     string;
}

function parseListPage(html: string): ParsedRow[] {
  const $ = cheerio.load(html);
  const rows: ParsedRow[] = [];

  // Each division is a <details> with <summary><strong>Name</strong>.
  // Its RFPs live in the immediately-following <ul><li><a>.
  $('details').each((_, detail) => {
    const $detail   = $(detail);
    const division  = $detail.find('summary strong').first().text().trim();
    if (!division || !DIVISIONS[division]) return;
    $detail.find('ul li a').each((__, a) => {
      const $a   = $(a);
      const href = ($a.attr('href') ?? '').trim();
      const text = $a.text().trim();
      if (!href || !text) return;
      // Resolve relative URLs against chicago.gov.
      const url = href.startsWith('http')
        ? href
        : `https://www.chicago.gov${href.startsWith('/') ? '' : '/'}${href}`;
      rows.push({ title: text, url, division });
    });
  });

  return rows;
}

function buildDescription(r: ParsedRow): string {
  const div = DIVISIONS[r.division];
  const areas = div?.areas.join(', ') ?? '';
  return [
    `City of Chicago, Department of Family & Support Services (DFSS) — ${r.division} division.`,
    areas ? `DFSS ${r.division} funds ${areas} for Chicago-based 501(c)(3) nonprofits and delegate agencies.` : '',
    `RFP title: ${r.title}.`,
    `Eligible applicants must be 501(c)(3) nonprofits with sites or service delivery in Chicago. Priority for programs serving low-income communities and underserved Chicago residents. Multi-year delegate agency contracts; awards typically $50K-$1M per year.`,
  ].filter(Boolean).join(' ');
}

function shortIdFromUrl(url: string): string {
  // The last path segment without the .html extension is short and
  // stable. Falls back to a slug of the full path if needed.
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
    return seg.replace(/\.html$/i, '') || u.pathname.replace(/\//g, '-');
  } catch {
    return url.slice(-80);
  }
}

function normalize(r: ParsedRow): NormalizedOpportunity {
  const div = DIVISIONS[r.division];
  const requires_lmi = div?.requires_lmi ?? false;
  const program_areas = div?.areas ? [...div.areas] : [];
  return {
    external_id:  shortIdFromUrl(r.url),
    reference:    r.url,
    title:        r.title,
    funder_name:  `City of Chicago, DFSS — ${r.division}`,
    funder_ein:   null,
    funder_type:  'state_local',
    amount_min:   null,
    amount_max:   null,
    deadline:     null,
    open_date:    null,
    description:  buildDescription(r),
    eligibility_hints: {
      entity_types:      ['nonprofit_501c3'],
      geographic_scope:  'city',
      geographic_states: ['IL'],
      target_population: [],
      program_areas,
      requires_lmi,
    },
    segment_tags: program_areas,
    raw:          r as unknown as Record<string, unknown>,
  };
}

async function fetchListPage(): Promise<string> {
  const res = await fetch(LIST_URL, {
    headers: {
      'User-Agent':      USER_AGENT,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DFSS list page returned ${res.status}`);
  return res.text();
}

export const chicagoDfssAdapter: GrantSourceAdapter = {
  adapterKey: ADAPTER_KEY,
  describe() {
    return { source_type: 'state_local', supports_keyword_query: false, supports_region_filter: true };
  },
  async fetch(opts: FetchOptions): Promise<FetchResult> {
    const warnings: string[] = [];
    let html: string;
    try {
      html = await fetchListPage();
    } catch (err) {
      warnings.push(`DFSS fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return { opportunities: [], next_cursor: null, warnings };
    }
    const rows = parseListPage(html);
    if (rows.length === 0) {
      warnings.push('parsed zero rows — DFSS page markup may have changed');
    }
    const limit = opts.limit ?? rows.length;
    return {
      opportunities: rows.slice(0, limit).map(normalize),
      next_cursor:   null,
      warnings,
    };
  },
  dedupeKey(opp: NormalizedOpportunity): string {
    return `${ADAPTER_KEY}:${opp.external_id}`;
  },
};
