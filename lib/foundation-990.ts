/**
 * Foundation 990 Financials — real IRS filing history from ProPublica.
 *
 * The seed foundation list (foundation-intelligence.ts) carries hand-entered
 * estimates and some stale/duplicated EINs. This module fetches the actual
 * multi-year filing record from ProPublica's free Nonprofit Explorer API, and
 * resolves foundations by NAME so a wrong seed EIN never surfaces wrong data.
 */

const BASE = 'https://projects.propublica.org/nonprofits/api/v2';

export interface FoundationYear {
  year:     number;
  revenue:  number;   // total revenue
  expenses: number;   // total functional expenses — grants paid + operations
  assets:   number;   // total assets, end of year
}

export interface FoundationFinancials {
  ein:            string;
  name:           string;
  nteeCode:       string | null;
  latestYear:     number;
  totalAssets:    number;
  latestRevenue:  number;
  latestExpenses: number;            // annual deployment (grants + operations)
  deploymentCagr: number;            // CAGR of expenses across the window
  assetTrend:     'growing' | 'stable' | 'declining';
  yearsOfData:    number;
  history:        FoundationYear[];  // oldest → newest
  pdfUrl:         string | null;     // link to the most recent 990 PDF
  proPublicaUrl:  string;
}

async function fetchOrgJson(ein: string): Promise<Record<string, unknown> | null> {
  const clean = ein.replace(/\D/g, '');
  if (clean.length !== 9) return null;
  try {
    const res = await fetch(`${BASE}/organizations/${clean}.json`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },   // 24h cache
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveEin(name: string, state?: string): Promise<string | null> {
  const q = encodeURIComponent(name.trim());
  const stateParam = state ? `&state[id]=${state}` : '';
  try {
    const res = await fetch(`${BASE}/search.json?q=${q}${stateParam}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const orgs: Array<{ ein?: string | number; name?: string }> = json.organizations || [];
    if (!orgs.length) return null;

    const nl    = name.toLowerCase();
    const first = nl.split(' ')[0];
    const exact   = orgs.find(o => (o.name || '').toLowerCase() === nl);
    const partial = orgs.find(o => {
      const on = (o.name || '').toLowerCase();
      return on.includes(first) || nl.includes(on.split(' ')[0]);
    });
    const pick = exact || partial || orgs[0];
    return pick.ein != null ? String(pick.ein) : null;
  } catch {
    return null;
  }
}

function parseHistory(json: Record<string, unknown>): FoundationYear[] {
  const raw = (json.filings_with_data as Record<string, unknown>[]) || [];
  return raw
    .map(f => ({
      year:     Number(f.tax_prd_yr)   || 0,
      revenue:  Number(f.totrevenue)   || 0,
      expenses: Number(f.totfuncexpns) || 0,
      assets:   Number(f.totassetsend) || 0,
    }))
    .filter(y => y.year > 0 && (y.expenses > 0 || y.assets > 0))
    .sort((a, b) => a.year - b.year);
}

function orgName(json: Record<string, unknown>): string {
  return String((json.organization as Record<string, unknown> | undefined)?.name ?? '');
}

/**
 * Returns the real IRS filing history for a foundation. Tries the hint EIN
 * first, but validates the returned org name actually matches — and falls back
 * to a ProPublica name search if the hint is stale, wrong, or yields no data.
 */
export async function fetchFoundationFinancials(
  name: string,
  state?: string,
  hintEin?: string,
): Promise<FoundationFinancials | null> {
  let json    = hintEin ? await fetchOrgJson(hintEin) : null;
  let usedEin = hintEin?.replace(/\D/g, '') ?? '';

  // Guard against the stale/duplicated seed EINs pointing at the wrong org.
  const hintMatches = (() => {
    if (!json) return false;
    const hn = orgName(json).toLowerCase();
    const first = name.toLowerCase().split(' ')[0];
    return !!hn && (hn.includes(first) || name.toLowerCase().includes(hn.split(' ')[0]));
  })();

  if (!json || !hintMatches || parseHistory(json).length === 0) {
    const resolved = await resolveEin(name, state);
    if (resolved) {
      const reJson = await fetchOrgJson(resolved);
      if (reJson && parseHistory(reJson).length > 0) {
        json    = reJson;
        usedEin = resolved;
      }
    }
  }

  if (!json) return null;
  const history = parseHistory(json);
  if (!history.length) return null;

  const org    = (json.organization as Record<string, unknown>) || {};
  const latest = history[history.length - 1];
  const first  = history[0];
  const years  = latest.year - first.year;

  const deploymentCagr = years > 0 && first.expenses > 0
    ? Math.pow(latest.expenses / first.expenses, 1 / years) - 1
    : 0;

  const assetChange = first.assets > 0 ? (latest.assets - first.assets) / first.assets : 0;
  const assetTrend: FoundationFinancials['assetTrend'] =
    assetChange > 0.15 ? 'growing' : assetChange < -0.15 ? 'declining' : 'stable';

  const latestFiling = ((json.filings_with_data as Record<string, unknown>[]) || [])
    .find(f => Number(f.tax_prd_yr) === latest.year);

  return {
    ein:            usedEin,
    name:           String(org.name || name),
    nteeCode:       org.ntee_code ? String(org.ntee_code) : null,
    latestYear:     latest.year,
    totalAssets:    latest.assets,
    latestRevenue:  latest.revenue,
    latestExpenses: latest.expenses,
    deploymentCagr,
    assetTrend,
    yearsOfData:    history.length,
    history,
    pdfUrl:         latestFiling?.pdf_url ? String(latestFiling.pdf_url) : null,
    proPublicaUrl:  `https://projects.propublica.org/nonprofits/organizations/${usedEin}`,
  };
}
