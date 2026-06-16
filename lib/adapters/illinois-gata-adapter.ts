/**
 * Illinois GATA — Grant Accountability and Transparency Act portal.
 *
 * Phase 5B: live scrape against the Catalog of State Financial Assistance
 * (CSFA) opportunities table at
 *   https://omb.illinois.gov/public/gata/csfa/OpportunityList.aspx
 *
 * The portal returns a server-rendered HTML table (~150-200 active
 * opportunities, refreshed weekly). Each row carries the title, agency
 * code, application window, and award range. Detail-page descriptions
 * are skipped for now to avoid the 150 follow-up HTTP requests — the
 * adapter synthesizes a richer description from (title + agency name +
 * window + range) which the embedding layer scores against the org's
 * program embeddings.
 *
 * The same /api/admin/ingest-region-sources endpoint drives this adapter
 * (no code change there). Phase 5B-cont can swap the title-only
 * description for a detail-page fetch when scoring quality demands it.
 */

import * as cheerio from 'cheerio';
import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'illinois_gata';
const CSFA_LIST_URL = 'https://omb.illinois.gov/public/gata/csfa/OpportunityList.aspx';
const USER_AGENT = 'FundirBot/1.0 (+https://www.fundir.ai)';

// Map GATA agency codes to display names + a one-line mission blurb. The
// embedding layer scores the synthesized description against CYC's
// program embeddings, so richer agency context = better semantic match.
// Agencies not in the map degrade gracefully (display name = code,
// blurb = empty).
const AGENCY_LABELS: Record<string, { name: string; blurb: string; suggests_lmi: boolean }> = {
  DHS:    { name: 'Illinois Department of Human Services',
            blurb: 'state human services and family support funding',
            suggests_lmi: true },
  ICJIA:  { name: 'Illinois Criminal Justice Information Authority',
            blurb: 'violence prevention, reentry, victim services, restorative justice',
            suggests_lmi: true },
  DCEO:   { name: 'Illinois Department of Commerce & Economic Opportunity',
            blurb: 'workforce development, apprenticeship, community development',
            suggests_lmi: true },
  ISBE:   { name: 'Illinois State Board of Education',
            blurb: 'K-12 education, after-school, early childhood, Title I',
            suggests_lmi: true },
  IDOC:   { name: 'Illinois Department of Corrections',
            blurb: 'reentry, transition services',
            suggests_lmi: true },
  IDPH:   { name: 'Illinois Department of Public Health',
            blurb: 'public health, health equity, community health',
            suggests_lmi: true },
  IDOA:   { name: 'Illinois Department on Aging',
            blurb: 'aging services, senior support',
            suggests_lmi: false },
  AGE:    { name: 'Illinois Department on Aging',
            blurb: 'aging services, senior support',
            suggests_lmi: false },
  IEMA:   { name: 'Illinois Emergency Management Agency',
            blurb: 'emergency preparedness, disaster mitigation',
            suggests_lmi: false },
  IEMAOHS:{ name: 'Illinois Emergency Management & Office of Homeland Security',
            blurb: 'emergency preparedness, disaster mitigation',
            suggests_lmi: false },
  IDOT:   { name: 'Illinois Department of Transportation',
            blurb: 'transportation infrastructure',
            suggests_lmi: false },
  IDFPR:  { name: 'Illinois Department of Financial & Professional Regulation',
            blurb: 'regulatory grants',
            suggests_lmi: false },
  ISP:    { name: 'Illinois State Police',
            blurb: 'law enforcement task forces',
            suggests_lmi: false },
  IFA:    { name: 'Illinois Finance Authority',
            blurb: 'climate, energy, finance',
            suggests_lmi: false },
  BHE:    { name: 'Illinois Board of Higher Education',
            blurb: 'higher education access and innovation',
            suggests_lmi: false },
  SBEL:   { name: 'Illinois State Board of Elections',
            blurb: 'elections administration grants',
            suggests_lmi: false },
};

// Title-level keyword heuristic for the requires_lmi field. Conservative
// — only fires when the title itself signals LMI priority. False
// negatives (LMI grants without an LMI-keyword in the title) fall back
// to the matcher's regex over program_areas / target_population.
const LMI_TITLE_REGEX = /\b(low.?income|underserved|youth|workforce|after.?school|community|housing|homeless|violence prevention|reentry|early childhood|pre[-\s]?k|title i)\b/i;

interface ParsedRow {
  title:           string;
  agency_label:    string;            // e.g. "DHS (444)"
  agency_code:     string;            // e.g. "DHS"
  agency_id:       string | null;     // e.g. "444"
  open_date:       string | null;     // ISO
  close_date:      string | null;     // ISO
  amount_min:      number | null;
  amount_max:      number | null;
  external_url:    string | null;     // when row links out to AmpliFund
  nofo_id:         string | null;     // when row uses internal Opportunity.aspx?nofo=ID
}

function parseDateRange(text: string): { open_date: string | null; close_date: string | null } {
  const m = text.trim().match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(.+)$/);
  if (!m) return { open_date: null, close_date: null };
  const open = toIso(m[1]);
  const closeText = m[2].trim();
  if (/^no end date/i.test(closeText)) return { open_date: open, close_date: null };
  return { open_date: open, close_date: toIso(closeText) };
}

function toIso(mdy: string): string | null {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}

function parseAwardRange(text: string): { amount_min: number | null; amount_max: number | null } {
  if (/not applicable/i.test(text)) return { amount_min: null, amount_max: null };
  const m = text.match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
  if (!m) return { amount_min: null, amount_max: null };
  const lo = Number(m[1].replace(/,/g,''));
  const hi = Number(m[2].replace(/,/g,''));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { amount_min: null, amount_max: null };
  if (lo === 0 && hi === 0) return { amount_min: null, amount_max: null };
  return { amount_min: lo, amount_max: hi };
}

function parseAgencyLabel(text: string): { agency_code: string; agency_id: string | null } {
  // "DHS (444)" → code='DHS', id='444'
  const m = text.trim().match(/^([A-Z]+)\s*\((\d+)\)$/);
  if (m) return { agency_code: m[1], agency_id: m[2] };
  return { agency_code: text.trim(), agency_id: null };
}

function parseListPage(html: string): ParsedRow[] {
  const $ = cheerio.load(html);
  const rows: ParsedRow[] = [];

  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 4) return;

    const titleCell = cells.eq(0);
    const anchor    = titleCell.find('a').first();
    const title     = anchor.text().trim();
    if (!title) return;

    const href = anchor.attr('href') ?? null;
    let external_url: string | null = null;
    let nofo_id:      string | null = null;
    if (href) {
      const amplifund = href.match(/url=([^&]+)/);
      if (amplifund) external_url = decodeURIComponent(amplifund[1]);
      const nofo      = href.match(/nofo=(\d+)/);
      if (nofo)      nofo_id      = nofo[1];
    }

    const { agency_code, agency_id } = parseAgencyLabel(cells.eq(1).text());
    const { open_date, close_date }  = parseDateRange(cells.eq(2).text());
    const { amount_min, amount_max } = parseAwardRange(cells.eq(3).text());

    rows.push({
      title,
      agency_label: cells.eq(1).text().trim(),
      agency_code, agency_id,
      open_date,   close_date,
      amount_min,  amount_max,
      external_url, nofo_id,
    });
  });

  return rows;
}

function buildDescription(r: ParsedRow): string {
  const label = AGENCY_LABELS[r.agency_code];
  const agency = label?.name ?? r.agency_label;
  const blurb  = label?.blurb ?? '';
  const range  = r.amount_min != null && r.amount_max != null
    ? `Award range $${r.amount_min.toLocaleString()} - $${r.amount_max.toLocaleString()}.`
    : 'Award amount not specified.';
  const win = r.close_date
    ? `Application window ${r.open_date ?? 'rolling'} through ${r.close_date}.`
    : `Open ${r.open_date ?? 'rolling'} - no end date.`;
  return [
    `Illinois state grant opportunity from ${agency}.`,
    blurb ? `${agency} funds ${blurb}.` : '',
    r.title,
    range, win,
    'Eligible applicants must be GATA-registered. Illinois nonprofits applying for state-administered grants are eligible to apply.',
  ].filter(Boolean).join(' ');
}

function normalize(r: ParsedRow): NormalizedOpportunity {
  const label = AGENCY_LABELS[r.agency_code];
  // requires_lmi: combination of agency-level prior + title-level
  // keyword check. Agency-level prior covers DHS / ICJIA / ISBE / DCEO
  // / IDPH (mandated LMI prioritization); title-level catches LMI
  // grants from agencies our prior map doesn't cover.
  const requires_lmi = (label?.suggests_lmi ?? false) || LMI_TITLE_REGEX.test(r.title);
  const program_areas = label
    ? label.blurb.split(/[,;]\s*/).filter(Boolean)
    : [];
  const external_id = r.external_url ?? (r.nofo_id ? `nofo:${r.nofo_id}` : `title:${r.title.slice(0, 80)}`);
  return {
    external_id,
    reference:    r.external_url ?? (r.nofo_id ? `https://omb.illinois.gov/public/gata/csfa/Opportunity.aspx?nofo=${r.nofo_id}` : null),
    title:        r.title,
    funder_name:  label?.name ?? r.agency_label,
    funder_ein:   null,
    funder_type:  'state_local',
    amount_min:   r.amount_min,
    amount_max:   r.amount_max,
    deadline:     r.close_date,
    open_date:    r.open_date,
    description:  buildDescription(r),
    eligibility_hints: {
      entity_types:      ['nonprofit_501c3'],
      geographic_scope:  'state',
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
  const res = await fetch(CSFA_LIST_URL, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`CSFA list page returned ${res.status}`);
  return res.text();
}

export const illinoisGataAdapter: GrantSourceAdapter = {
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
      warnings.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return { opportunities: [], next_cursor: null, warnings };
    }
    const rows = parseListPage(html);
    if (rows.length === 0) {
      warnings.push('parsed zero rows — portal markup may have changed');
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
