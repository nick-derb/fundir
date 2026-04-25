'use server';

import { createServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export interface OrgProfileData {
  // Financials — current year (self-reported)
  fiscal_year_end:              string;
  current_annual_budget:        number;
  current_annual_revenue:       number;
  current_govt_revenue_pct:     number;
  current_private_grants_pct:   number;
  current_program_revenue_pct:  number;
  current_other_revenue_pct:    number;
  current_net_assets:           number;
  current_months_reserves:      number;

  // Capacity
  num_full_time_staff:          number;
  num_part_time_staff:          number;
  num_volunteers:               number;
  participants_served_annually: number;
  num_program_sites:            number;

  // Identity & mission
  mission_statement:            string;
  geographic_service_area:      string;
  accreditations:               string[];
  strategic_priorities:         string[];
  capacity_notes:               string;

  // Funding history (structured)
  key_funders:                  string[];
  grant_history:                GrantRecord[];
  pending_grants:               GrantRecord[];
  awarded_grants:               GrantRecord[];
}

export interface GrantRecord {
  id:            string;
  funder:        string;
  program:       string;
  amount:        number;
  year?:         number;
  submitted_date?: string;
  status?:       string;
}

const DEFAULT_PROFILE: OrgProfileData = {
  fiscal_year_end:              'December 31',
  current_annual_budget:        0,
  current_annual_revenue:       0,
  current_govt_revenue_pct:     0,
  current_private_grants_pct:   0,
  current_program_revenue_pct:  0,
  current_other_revenue_pct:    0,
  current_net_assets:           0,
  current_months_reserves:      0,
  num_full_time_staff:          0,
  num_part_time_staff:          0,
  num_volunteers:               0,
  participants_served_annually: 0,
  num_program_sites:            0,
  mission_statement:            '',
  geographic_service_area:      '',
  accreditations:               [],
  strategic_priorities:         [],
  capacity_notes:               '',
  key_funders:                  [],
  grant_history:                [],
  pending_grants:               [],
  awarded_grants:               [],
};

export async function getOrgProfile(orgCode: string): Promise<{
  name: string;
  ein: string;
  profile: OrgProfileData;
  updatedAt: string | null;
  updatedBy: string | null;
} | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('name, ein, profile_data, profile_updated_at, profile_updated_by')
    .eq('org_code', orgCode)
    .single();

  if (!data) return null;

  return {
    name:      data.name,
    ein:       data.ein,
    profile:   { ...DEFAULT_PROFILE, ...(data.profile_data as Partial<OrgProfileData> || {}) },
    updatedAt: data.profile_updated_at,
    updatedBy: data.profile_updated_by,
  };
}

export async function saveOrgProfile(
  orgCode: string,
  profile: Partial<OrgProfileData>,
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  // Validate revenue percentages add up reasonably (soft warning, not hard block)
  const pctSum = (profile.current_govt_revenue_pct ?? 0)
    + (profile.current_private_grants_pct ?? 0)
    + (profile.current_program_revenue_pct ?? 0)
    + (profile.current_other_revenue_pct ?? 0);

  // Get existing profile to merge
  const { data: existing } = await supabase
    .from('organizations')
    .select('profile_data')
    .eq('org_code', orgCode)
    .single();

  const merged = { ...DEFAULT_PROFILE, ...(existing?.profile_data || {}), ...profile };

  const { error } = await supabase
    .from('organizations')
    .update({
      profile_data:       merged,
      profile_updated_at: new Date().toISOString(),
      profile_updated_by: userEmail,
    })
    .eq('org_code', orgCode);

  if (error) return { success: false, error: error.message };

  revalidatePath('/org');
  revalidatePath('/dashboard');

  return {
    success: true,
    ...(Math.abs(pctSum - 100) > 5 && pctSum > 0
      ? { error: `Note: revenue percentages sum to ${pctSum.toFixed(0)}% (should be 100%)` }
      : {}),
  };
}

export async function addGrantRecord(
  orgCode: string,
  list: 'grant_history' | 'pending_grants' | 'awarded_grants',
  record: Omit<GrantRecord, 'id'>,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('organizations')
    .select('profile_data')
    .eq('org_code', orgCode)
    .single();

  const profile = { ...DEFAULT_PROFILE, ...(existing?.profile_data || {}) };
  const newRecord: GrantRecord = { ...record, id: crypto.randomUUID() };
  profile[list] = [...(profile[list] || []), newRecord];

  const { error } = await supabase
    .from('organizations')
    .update({ profile_data: profile, profile_updated_at: new Date().toISOString() })
    .eq('org_code', orgCode);

  if (error) return { success: false, error: error.message };
  revalidatePath('/org');
  return { success: true };
}

export async function removeGrantRecord(
  orgCode: string,
  list: 'grant_history' | 'pending_grants' | 'awarded_grants',
  recordId: string,
): Promise<void> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('organizations')
    .select('profile_data')
    .eq('org_code', orgCode)
    .single();

  const profile = { ...DEFAULT_PROFILE, ...(existing?.profile_data || {}) };
  profile[list] = profile[list].filter((r: GrantRecord) => r.id !== recordId);

  await supabase
    .from('organizations')
    .update({ profile_data: profile, profile_updated_at: new Date().toISOString() })
    .eq('org_code', orgCode);

  revalidatePath('/org');
}
