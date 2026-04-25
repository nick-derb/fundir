'use server';

import { searchOrgs, OrgSearchResult } from '@/lib/propublica';

export async function searchOrgAction(query: string, state?: string): Promise<OrgSearchResult[]> {
  return searchOrgs(query, state);
}
