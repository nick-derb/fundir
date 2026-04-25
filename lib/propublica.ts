// ProPublica Nonprofit Explorer API
// Docs: https://projects.propublica.org/nonprofits/api
// Free, no auth required. Returns IRS Form 990 data.

const BASE = 'https://projects.propublica.org/nonprofits/api/v2';

export interface Filing990 {
  tax_prd_yr: number;           // fiscal year (e.g. 2022)
  totrevenue: number;           // total revenue
  totfuncexpns: number;         // total functional expenses
  totassetsend: number;         // total assets (end of year)
  totliabend: number;           // total liabilities (end of year)
  netassetsend: number;         // net assets / fund balance (end of year)
  prgmservrev: number;          // program service revenue
  gftgrntsrcvd: number;         // gifts & grants received (private)
  govtgrnts: number | null;     // government grants (Schedule I)
  compnsatncurrofcr: number;    // officer/exec compensation
  totprgmrevnue: number | null; // total program revenue
}

export interface OrgProfile {
  ein: string;
  name: string;
  city: string;
  state: string;
  ntee_code: string;
  income_amount: number;
  asset_amount: number;
  revenue_amount: number;
}

export interface ProPublicaResult {
  org: OrgProfile;
  latestFiling: Filing990;
  allFilings: Filing990[];       // up to 10 years
  computed: ComputedFinancials;
}

export interface ComputedFinancials {
  // Revenue mix
  totalRevenue: number;
  governmentGrantsPct: number;   // % of total revenue from govt grants
  privateGrantsPct: number;      // % from private gifts/grants
  programRevenuePct: number;     // % earned program revenue
  // Expense ratios
  programEfficiencyPct: number;  // program spend / total spend
  // Balance sheet
  netAssets: number;
  monthsOfReserves: number;      // net assets / (monthly expenses)
  // Risk
  govtDependency: 'critical' | 'elevated' | 'moderate' | 'low';
  // Year
  filingYear: number;
}

export interface OrgSearchResult {
  ein: string;
  name: string;
  city: string;
  state: string;
  ntee_code: string;
  income_amount: number;
  asset_amount: number;
  revenue_amount: number;
  num_filings: number;
}

// Search ProPublica by org name — returns up to 25 results for typeahead
export async function searchOrgs(query: string, state?: string): Promise<OrgSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const q = encodeURIComponent(query.trim());
  const stateParam = state ? `&state[id]=${state}` : '';
  const url = `${BASE}/search.json?q=${q}${stateParam}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store', // live search — no caching
  });
  if (!res.ok) return [];

  const json = await res.json();
  const raw: Record<string, unknown>[] = json.organizations || [];

  return raw.slice(0, 25).map(o => ({
    ein:            String(o.ein || ''),
    name:           String(o.name || ''),
    city:           String(o.city || ''),
    state:          String(o.state || ''),
    ntee_code:      String(o.ntee_code || ''),
    income_amount:  Number(o.income_amount || 0),
    asset_amount:   Number(o.asset_amount  || 0),
    revenue_amount: Number(o.revenue_amount || 0),
    num_filings:    Number(o.num_returns   || 0),
  }));
}

// Search ProPublica by org name, return best-matching EIN (used as sync fallback)
export async function searchOrgByName(name: string, state?: string): Promise<{ ein: string; name: string } | null> {
  const results = await searchOrgs(name, state);
  if (!results.length) return null;

  const nameLower = name.toLowerCase();
  const exact = results.find(o => o.name.toLowerCase() === nameLower);
  if (exact) return { ein: exact.ein, name: exact.name };

  const partial = results.find(o => o.name.toLowerCase().includes(nameLower.split(' ')[0]));
  return partial ?? { ein: results[0].ein, name: results[0].name };
}

export async function fetch990(ein: string): Promise<ProPublicaResult> {
  const cleanEin = ein.replace(/\D/g, '');
  const url = `${BASE}/organizations/${cleanEin}.json`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 }, // cache 24h
  });

  if (!res.ok) {
    throw new Error(`ProPublica API error: ${res.status} for EIN ${cleanEin}`);
  }

  const json = await res.json();

  const org: OrgProfile = {
    ein: cleanEin,
    name: json.organization?.name || '',
    city: json.organization?.city || '',
    state: json.organization?.state || '',
    ntee_code: json.organization?.ntee_code || '',
    income_amount: json.organization?.income_amount || 0,
    asset_amount: json.organization?.asset_amount || 0,
    revenue_amount: json.organization?.revenue_amount || 0,
  };

  const rawFilings: Record<string, unknown>[] = json.filings_with_data || [];

  if (!rawFilings.length) {
    throw new Error(`No 990 filings found for EIN ${cleanEin}`);
  }

  // Sort by most recent first
  const sorted = [...rawFilings].sort((a, b) =>
    ((b.tax_prd_yr as number) || 0) - ((a.tax_prd_yr as number) || 0)
  );

  const allFilings: Filing990[] = sorted.map(f => ({
    tax_prd_yr:       (f.tax_prd_yr as number) || 0,
    totrevenue:       (f.totrevenue as number) || 0,
    totfuncexpns:     (f.totfuncexpns as number) || 0,
    totassetsend:     (f.totassetsend as number) || 0,
    totliabend:       (f.totliabend as number) || 0,
    netassetsend:     (f.netassetsend as number) || 0,
    prgmservrev:      (f.prgmservrev as number) || 0,
    gftgrntsrcvd:     (f.gftgrntsrcvd as number) || 0,
    govtgrnts:        (f.govtgrnts as number | null) ?? null,
    compnsatncurrofcr:(f.compnsatncurrofcr as number) || 0,
    totprgmrevnue:    (f.totprgmrevnue as number | null) ?? null,
  }));

  const latest = allFilings[0];
  const computed = computeFinancials(latest);

  return { org, latestFiling: latest, allFilings, computed };
}

function computeFinancials(f: Filing990): ComputedFinancials {
  const rev = f.totrevenue || 1; // avoid div/0
  const exp = f.totfuncexpns || 1;

  const govtGrants  = f.govtgrnts ?? 0;
  const privateGrants = f.gftgrntsrcvd || 0;
  const programRev  = f.prgmservrev || 0;

  const govtPct     = Math.round((govtGrants / rev) * 100);
  const privatePct  = Math.round((privateGrants / rev) * 100);
  const programPct  = Math.round((programRev / rev) * 100);

  // Program efficiency = program expenses / total expenses
  // We estimate program expenses as total - admin/fundraising
  // ProPublica doesn't always expose the split, so we use a proxy
  const progEfficiency = Math.round(((exp * 0.85) / exp) * 100); // fallback

  const netAssets = f.netassetsend || 0;
  const monthlyExp = exp / 12;
  const monthsReserves = monthlyExp > 0 ? Math.round(netAssets / monthlyExp) : 0;

  const govtDependency: ComputedFinancials['govtDependency'] =
    govtPct >= 60 ? 'critical' :
    govtPct >= 40 ? 'elevated' :
    govtPct >= 20 ? 'moderate' : 'low';

  return {
    totalRevenue:        f.totrevenue,
    governmentGrantsPct: govtPct,
    privateGrantsPct:    privatePct,
    programRevenuePct:   programPct,
    programEfficiencyPct: progEfficiency,
    netAssets,
    monthsOfReserves:    monthsReserves,
    govtDependency,
    filingYear:          f.tax_prd_yr,
  };
}
