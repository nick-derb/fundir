const BASE_URL = process.env.GRANTS_GOV_BASE_URL || 'https://api.grants.gov';

export interface SearchParams {
  keyword?: string;
  fundingCategories?: string;
  oppStatuses?: string;
  rows?: number;
  startRecordNum?: number;
}

export interface GrantHit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;          // API returns "agency" not "agencyName"
  agencyName: string;      // we'll normalize this in the adapter
  openDate: string;
  closeDate: string;
  oppStatus: string;
  docType: string;
  cfdaList: string[];      // API returns "cfdaList" not "alnlist"
  alnlist: string[];       // normalized alias
}

export interface SearchResponse {
  data: {
    hitCount: number;
    oppHits: GrantHit[];
  };
}

export async function searchGrants(params: SearchParams): Promise<SearchResponse> {
  const response = await fetch(`${BASE_URL}/v1/api/search2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: params.keyword || '',
      oppStatuses: 'posted',
      rows: params.rows || 25,
      startRecordNum: params.startRecordNum || 0,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Grants.gov search failed: ${response.status}`);
  }

  const json = await response.json();

  // Normalize field names so the rest of the app uses consistent keys
  if (json.data?.oppHits) {
    json.data.oppHits = json.data.oppHits.map((hit: Record<string, unknown>) => ({
      ...hit,
      agencyName: (hit.agency ?? hit.agencyName ?? '') as string,
      alnlist: (hit.cfdaList ?? hit.alnlist ?? []) as string[],
    }));
  }

  return json as SearchResponse;
}

export async function fetchOpportunity(oppId: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/v1/api/fetchOpportunity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oppId }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Grants.gov fetch failed: ${response.status}`);
  }

  return response.json();
}
