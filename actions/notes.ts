'use server';

import { createServerClient } from '@/lib/supabase';

export async function getNote(grantId: string): Promise<{ id: string; body: string; updated_at: string } | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('grant_notes')
    .select('id, body, updated_at')
    .eq('grant_id', grantId)
    .single();
  return data;
}

export async function saveNote(grantId: string, body: string): Promise<{ success: boolean; updated_at?: string }> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('grant_notes')
    .upsert({ grant_id: grantId, body, updated_at: now }, { onConflict: 'grant_id' })
    .select('updated_at')
    .single();
  if (error) return { success: false };
  return { success: true, updated_at: data?.updated_at };
}
