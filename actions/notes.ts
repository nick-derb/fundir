'use server';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

export async function getNote(grantId: string): Promise<{ id: string; body: string; updated_at: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const supabase = createServerClient();
  // Notes are now scoped to (grant_id, org_id). Prior to the RLS hardening
  // migration the schema kept a single global note per grant — two orgs
  // viewing the same grant would have seen each other's private notes.
  const { data } = await supabase
    .from('grant_notes')
    .select('id, body, updated_at')
    .eq('grant_id', grantId)
    .eq('org_id', ctx.orgId)
    .maybeSingle();
  return data;
}

export async function saveNote(grantId: string, body: string): Promise<{ success: boolean; updated_at?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false };
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('grant_notes')
    .upsert(
      { grant_id: grantId, org_id: ctx.orgId, body, updated_at: now },
      { onConflict: 'grant_id,org_id' },
    )
    .select('updated_at')
    .single();
  if (error) return { success: false };
  return { success: true, updated_at: data?.updated_at };
}
