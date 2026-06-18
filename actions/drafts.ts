'use server';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';

export type DraftStatus = 'drafting' | 'review' | 'final' | 'discarded';

const VALID_STATUSES: readonly DraftStatus[] = ['drafting', 'review', 'final', 'discarded'];

export async function setDraftStatus(
  draftId: string,
  newStatus: DraftStatus,
  grantId?: string,
): Promise<{ success: boolean; status?: DraftStatus; updated_at?: string; error?: string }> {
  if (!VALID_STATUSES.includes(newStatus)) {
    return { success: false, error: 'invalid status' };
  }
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: 'unauthenticated' };

  const supabase = createServerClient();
  // RLS gates this: only members of the draft's org can update, and the
  // "members update status own org" policy in phase6cont_drafts.sql is
  // what authorizes the write. content/source_citations remain
  // service-role-only.
  const { data, error } = await supabase
    .from('drafts')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('organization_id', ctx.orgId)
    .select('status, updated_at')
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'not found or not authorized' };
  }
  if (grantId) revalidatePath(`/grant/${grantId}`);
  return { success: true, status: data.status as DraftStatus, updated_at: data.updated_at as string };
}
