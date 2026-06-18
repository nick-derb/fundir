/**
 * Cook County, Illinois — Justice Advisory Council (JAC) live scrape.
 *
 * The JAC publishes its open funding opportunities at
 *   https://www.cookcountyil.gov/JACGrants
 * (the older `/service/justice-advisory-council` URL is the agency
 * landing page; opportunities themselves moved to /JACGrants in the
 * 2026 cookcountyil.gov refresh).
 *
 * Page layout: a single `<h2>Open Funding Opportunities</h2>` anchors
 * the active list. Each opportunity is then its own `<h3>` followed by
 * paragraphs, `<h4>` sub-headings (Key Dates, Application
 * Instructions, etc.), and links to the RFQ/RFP documents. We slice
 * forward from the h2 until the next h2 ("Initiatives", "Capacity
 * Building"), and treat each non-blocklisted h3 in that range as one
 * opportunity.
 *
 * Cook County CDBG public-service-activity funding is administered via
 * the Bureau of Economic Development, which doesn't publish a clean
 * machine-readable list; leaving CDBG out of this adapter for now. JAC
 * is the higher-value source for CYC (youth violence prevention,
 * reentry) and the only one currently surfaced on a parseable page.
 */

import * as cheerio from 'cheerio';
import type {
  GrantSourceAdapter, FetchOptions, FetchResult, NormalizedOpportunity,
} from './types';

const ADAPTER_KEY = 'cook_county';
const LIST_URL    = 'https://www.cookcountyil.gov/JACGrants';
const USER_AGENT  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// h3 headings that are sub-sections rather than distinct opportunities.
// "Application" is a generic sub-heading inside the Reentry block;
// "Application Instructions", "Key Dates", etc. are h4s but defensive
// to keep them out anyway.
const SUBSECTION_TITLES = new Set([
  'application', 'application instructions', 'how to apply',
  'apply', 'key dates', 'information and questions',
  'downloads', 'background',
]);

interface ParsedBlock {
  title:        string;
  description:  string;
  reference:    string | null;   // best "more info" URL
  pdfUrl:       string | null;   // RFQ/RFP PDF if present
}

function isSubsection(title: string): boolean {
  return SUBSECTION_TITLES.has(title.toLowerCase().trim());
}

function pickReference(links: { text: string; href: string }[]): { reference: string | null; pdfUrl: string | null } {
  // "viewed as a webpage here" or `/content/...` pages are the most
  // human-readable destinations.
  const webpage = links.find(l =>
    /viewed as a webpage|view (the )?(announcement|opportunity|press release)|read more/i.test(l.text)
    || /\/content\/(request|notice|notice-funding|nofo)/i.test(l.href)
  );
  // The RFQ/RFP PDF in /sites/g/files/.../JAC%20...%20RFQ... is the
  // canonical document; use it as the secondary reference + PDF.
  const pdf = links.find(l => /\.pdf$/i.test(l.href) && /rfq|rfp|nofo/i.test(l.href));
  return {
    reference: webpage?.href ?? pdf?.href ?? null,
    pdfUrl:    pdf?.href   ?? null,
  };
}

function parseListPage(html: string): ParsedBlock[] {
  const $ = cheerio.load(html);
  const blocks: ParsedBlock[] = [];

  const sectionStart = $('h2').filter((_, h) => $(h).text().trim() === 'Open Funding Opportunities').first();
  if (sectionStart.length === 0) return blocks;

  type Current = {
    title:    string;
    parts:    string[];
    links:    { text: string; href: string }[];
  };
  let current: Current | null = null;

  const flush = () => {
    if (!current) return;
    if (!isSubsection(current.title)) {
      const description = current.parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const { reference, pdfUrl } = pickReference(current.links);
      blocks.push({
        title:       current.title,
        description: description.slice(0, 4000),
        reference,
        pdfUrl,
      });
    } else if (blocks.length > 0) {
      // Subsection text belongs to the *previous* opportunity. Append it
      // (subsection paragraphs are real description content).
      const last = blocks[blocks.length - 1];
      const extra = current.parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (extra) last.description = (last.description + ' ' + extra).slice(0, 4000);
      for (const l of current.links) {
        if (!last.reference && /viewed as a webpage|view (the )?(announcement|opportunity)/i.test(l.text)) {
          last.reference = l.href;
        }
        if (!last.pdfUrl && /\.pdf$/i.test(l.href) && /rfq|rfp|nofo/i.test(l.href)) {
          last.pdfUrl = l.href;
        }
      }
    }
    current = null;
  };

  let node = sectionStart.next();
  while (node.length && node[0].tagName !== 'h2') {
    const tag = node[0].tagName;
    if (tag === 'h3') {
      flush();
      current = { title: node.text().trim(), parts: [], links: [] };
    } else if (current) {
      if (tag === 'p' || tag === 'h4' || tag === 'ul' || tag === 'ol' || tag === 'div') {
        const t = node.text().trim().replace(/\s+/g, ' ');
        if (t) current.parts.push(t);
        node.find('a[href]').each((_, a) => {
          const $a = $(a);
          current!.links.push({ text: $a.text().trim(), href: ($a.attr('href') || '').trim() });
        });
      }
    }
    node = node.next();
  }
  flush();

  return blocks;
}

function parseAmountMax(text: string): number | null {
  // "up to $5 million", "$5,000,000", "$500K" — best-effort, only one match.
  const million = text.match(/\$\s*([0-9.,]+)\s*million/i);
  if (million) {
    const n = Number(million[1].replace(/,/g, ''));
    if (Number.isFinite(n)) return Math.round(n * 1_000_000);
  }
  const k = text.match(/\$\s*([0-9.,]+)\s*[Kk]\b/);
  if (k) {
    const n = Number(k[1].replace(/,/g, ''));
    if (Number.isFinite(n)) return Math.round(n * 1_000);
  }
  const dollars = text.match(/\$\s*([0-9][0-9,]{3,})/);
  if (dollars) {
    const n = Number(dollars[1].replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function programAreasFromTitle(title: string): string[] {
  const t = title.toLowerCase();
  const tags: string[] = [];
  if (/reentry|re-entry|justice-involved/.test(t)) tags.push('reentry', 'criminal justice');
  if (/gun violence|violence/.test(t))             tags.push('violence prevention');
  if (/wraparound|wrap-around/.test(t))            tags.push('wraparound services');
  if (/housing|shelter/.test(t))                   tags.push('housing');
  if (/survivor/.test(t))                          tags.push('survivor services');
  if (/youth/.test(t))                             tags.push('youth services');
  if (/mentor/.test(t))                            tags.push('mentoring');
  if (tags.length === 0)                           tags.push('community services');
  return Array.from(new Set(tags));
}

function externalIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function normalize(b: ParsedBlock): NormalizedOpportunity {
  const program_areas = programAreasFromTitle(b.title);
  const amount_max = parseAmountMax(b.description);
  const reference  = b.reference ?? b.pdfUrl ?? LIST_URL;
  const description = [
    `Cook County Justice Advisory Council (JAC) — ${b.title}.`,
    b.description,
    `Eligible applicants: 501(c)(3) community-based organizations serving Cook County residents. JAC funding prioritizes programs in disinvested South and West side neighborhoods and south-suburban Cook.`,
  ].filter(Boolean).join(' ');

  return {
    external_id:  externalIdFromTitle(b.title),
    reference,
    title:        b.title,
    funder_name:  'Cook County Justice Advisory Council',
    funder_ein:   null,
    funder_type:  'state_local',
    amount_min:   null,
    amount_max,
    deadline:     null,
    open_date:    null,
    description,
    eligibility_hints: {
      entity_types:      ['nonprofit_501c3'],
      geographic_scope:  'state',
      geographic_states: ['IL'],
      target_population: ['system-involved', 'survivors of violence', 'low-income communities'],
      program_areas,
      requires_lmi:      true,
    },
    segment_tags: program_areas,
    raw:          b as unknown as Record<string, unknown>,
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
  if (!res.ok) throw new Error(`Cook County JAC page returned ${res.status}`);
  return res.text();
}

export const cookCountyAdapter: GrantSourceAdapter = {
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
      warnings.push(`Cook County JAC fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return { opportunities: [], next_cursor: null, warnings };
    }
    const blocks = parseListPage(html);
    if (blocks.length === 0) {
      warnings.push('parsed zero opportunities — JAC page markup may have changed');
    }
    const limit = opts.limit ?? blocks.length;
    return {
      opportunities: blocks.slice(0, limit).map(normalize),
      next_cursor:   null,
      warnings,
    };
  },
  dedupeKey(opp: NormalizedOpportunity): string {
    return `${ADAPTER_KEY}:${opp.external_id}`;
  },
};
