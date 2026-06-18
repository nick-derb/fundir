/**
 * 990 / 990-PF XML fetcher — Workstream B1.
 *
 * Given a funder EIN + a fiscal year, return the e-filed XML for that
 * filing. Two-tier strategy:
 *
 *   Tier 1: ProPublica Nonprofit Explorer API
 *     - Free, no auth, ~1 req/s polite rate.
 *     - Lists every filing the org has on file, with direct XML URLs.
 *     - Endpoint: GET /organizations/{ein}.json → filings_with_data[]
 *     - Each filing has `xml_url` (S3 link) + tax_period (YYYYMM)
 *
 *   Tier 2: Direct IRS S3 by Object-Id
 *     - Used when ProPublica's lag means a filing isn't yet listed but
 *       we know its Object-Id from an external manifest.
 *     - URL: https://s3.amazonaws.com/irs-form-990/<object-id>_public.xml
 *
 * Phase B2 calls fetchReturnXml(ein, fy) and gets back the raw XML
 * string. Errors are typed so the worker can decide whether to retry,
 * skip, or surface.
 *
 * Rate limiting: 1 request per second to ProPublica (their unofficial
 * limit). Sequential by design — concurrent fetches against ProPublica
 * trigger 429s.
 */

const PP_BASE = 'https://projects.propublica.org/nonprofits/api/v2';
const RATE_DELAY_MS = 1000;
let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_DELAY_MS) {
    await new Promise(r => setTimeout(r, RATE_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

interface PPFiling {
  tax_prd_yr?:    number;
  tax_prd?:       number;          // YYYYMM
  pdf_url?:       string;
  xml_url?:       string;
  formtype_str?:  string;
}

interface PPOrgResponse {
  organization?: { name?: string; ein?: number };
  filings_with_data?: PPFiling[];
  filings_without_data?: PPFiling[];
}

export class FetchError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

/**
 * List every filing ProPublica has on file for an EIN, with form type
 * and a direct XML URL when available.
 */
export async function listFilings(ein: string): Promise<PPFiling[]> {
  const cleanEin = ein.replace(/\D/g, '');
  if (cleanEin.length !== 9) throw new Error(`listFilings: invalid EIN ${ein}`);

  await rateLimit();
  const res = await fetch(`${PP_BASE}/organizations/${cleanEin}.json`, {
    headers: { 'User-Agent': 'FundirBot/1.0 (+https://www.fundir.ai)', 'Accept': 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 404) return [];
  if (res.status === 429) throw new FetchError(`ProPublica 429 (rate limited) for EIN ${cleanEin}`, true);
  if (!res.ok)             throw new FetchError(`ProPublica ${res.status} for EIN ${cleanEin}`, false);
  const json = (await res.json()) as PPOrgResponse;
  return [...(json.filings_with_data ?? []), ...(json.filings_without_data ?? [])];
}

/**
 * Fetch the raw XML for a specific (EIN, fiscal_year). Returns the XML
 * string. Throws FetchError if the filing isn't available or the
 * downstream blob fetch fails.
 */
export async function fetchReturnXml(ein: string, fiscalYear: number): Promise<{
  xml:       string;
  form_type: '990PF' | '990' | 'other';
  source:    'propublica';
  url:       string;
}> {
  const filings = await listFilings(ein);
  // Match by tax year (prefer exact). ProPublica's tax_prd_yr is the FY
  // for an FY-end filing; tax_prd is YYYYMM.
  const candidate = filings.find(f => f.tax_prd_yr === fiscalYear && f.xml_url)
                 ?? filings.find(f => f.tax_prd && Math.floor(f.tax_prd / 100) === fiscalYear && f.xml_url);
  if (!candidate?.xml_url) {
    throw new FetchError(`no XML for EIN ${ein} FY${fiscalYear}`, false);
  }

  await rateLimit();
  const xmlRes = await fetch(candidate.xml_url, {
    headers: { 'User-Agent': 'FundirBot/1.0 (+https://www.fundir.ai)' },
    cache: 'no-store',
  });
  if (!xmlRes.ok) throw new FetchError(`XML fetch ${xmlRes.status} for ${candidate.xml_url}`, xmlRes.status >= 500);
  const xml = await xmlRes.text();

  const form_type: '990PF' | '990' | 'other' =
      (candidate.formtype_str ?? '').toUpperCase().includes('990PF') ? '990PF'
    : (candidate.formtype_str ?? '').toUpperCase().includes('990')   ? '990'
                                                                     : 'other';

  return { xml, form_type, source: 'propublica', url: candidate.xml_url };
}
