'use server';

import { createServerClient } from '@/lib/supabase';
import { fetch990, searchOrgByName, ProPublicaResult } from '@/lib/propublica';

export interface SyncResult {
  success: boolean;
  orgName?: string;
  filingYear?: number;
  totalRevenue?: number;
  error?: string;
}

/**
 * Fetches the latest 990 from ProPublica for a given org code and stores it in Supabase.
 * Called from the Settings page "Sync Financials" button.
 */
export async function syncFinancials(orgCode: string): Promise<SyncResult> {
  const supabase = createServerClient();

  // 1. Look up the org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, ein, city, state')
    .eq('org_code', orgCode.toUpperCase().trim())
    .single();

  if (orgError || !org) {
    return { success: false, error: 'Organization not found.' };
  }

  if (!org.ein) {
    return {
      success: false,
      error: `No EIN on file for ${org.name}. Add it to the organizations table first.`,
    };
  }

  // 2. Fetch from ProPublica — try direct EIN first, fall back to name search
  let result: ProPublicaResult;
  let resolvedEin = org.ein;
  try {
    result = await fetch990(org.ein);
  } catch (firstErr) {
    // EIN lookup failed — try searching by org name
    try {
      const found = await searchOrgByName(org.name, org.state ?? 'IL');
      if (!found) throw new Error(`Organization not found on ProPublica for EIN ${org.ein} or name "${org.name}". They may file a 990-N (postcard) or not yet have an e-filed return indexed.`);
      resolvedEin = found.ein;
      result = await fetch990(found.ein);
    } catch (searchErr) {
      const msg = String(searchErr);
      // Surface the most useful error
      return {
        success: false,
        error: msg.startsWith('Organization not found') ? msg : `EIN lookup failed (${String(firstErr)}). Name search also failed: ${msg}`,
      };
    }
  }

  // 3. Store in Supabase — update EIN if name search resolved a different one
  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      ...(resolvedEin !== org.ein ? { ein: resolvedEin } : {}),
      financial_data: {
        org:      result.org,
        latest:   result.latestFiling,
        computed: result.computed,
        history:  result.allFilings.slice(0, 5), // last 5 years
      },
      financial_year:       result.latestFiling.tax_prd_yr,
      financial_fetched_at: new Date().toISOString(),
    })
    .eq('id', org.id);

  if (updateError) {
    return { success: false, error: `DB update failed: ${updateError.message}` };
  }

  return {
    success: true,
    orgName:      result.org.name,
    filingYear:   result.latestFiling.tax_prd_yr,
    totalRevenue: result.latestFiling.totrevenue,
  };
}

/**
 * Sync using a specific EIN selected from the ProPublica search UI.
 * Skips the DB EIN entirely — uses the EIN the user explicitly chose.
 * Also writes the resolved EIN back to the DB so future syncs work.
 */
export async function syncFinancialsByEin(orgCode: string, ein: string): Promise<SyncResult> {
  const supabase = createServerClient();

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, ein')
    .eq('org_code', orgCode.toUpperCase().trim())
    .single();

  if (orgError || !org) {
    return { success: false, error: 'Organization not found in database.' };
  }

  let result: ProPublicaResult;
  try {
    result = await fetch990(ein);
  } catch (err) {
    return {
      success: false,
      error: `ProPublica returned no data for EIN ${ein}. This org may file a 990-N (postcard) or not yet have an indexed e-filing.`,
    };
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      ein,  // write back the correct EIN
      financial_data: {
        org:      result.org,
        latest:   result.latestFiling,
        computed: result.computed,
        history:  result.allFilings.slice(0, 5),
      },
      financial_year:       result.latestFiling.tax_prd_yr,
      financial_fetched_at: new Date().toISOString(),
    })
    .eq('id', org.id);

  if (updateError) {
    return { success: false, error: `DB update failed: ${updateError.message}` };
  }

  return {
    success:      true,
    orgName:      result.org.name,
    filingYear:   result.latestFiling.tax_prd_yr,
    totalRevenue: result.latestFiling.totrevenue,
  };
}

/**
 * Reads the stored 990 snapshot for an org — used by server components.
 */
export async function getFinancialSnapshot(orgCode: string) {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('organizations')
    .select('name, ein, financial_data, financial_year, financial_fetched_at')
    .eq('org_code', orgCode.toUpperCase().trim())
    .single();

  return data ?? null;
}
