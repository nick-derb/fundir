import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { getHubState } from '@/lib/data-hub';
import { getValidToken } from '@/lib/oauth-tokens';

export interface SnapshotResult {
  snapshotId: string | null;
  rowCount: number;
  /** true when nothing new was stored (not connected, or identical to last). */
  skipped: boolean;
  reason?: 'not_connected' | 'unchanged';
}

/**
 * Take a versioned, timestamped snapshot of the org's OneDrive Data Hub workbook
 * into training_snapshots, so training runs are reproducible and never read a
 * moving target. Deduplicates against the most recent snapshot by content hash.
 *
 * The OneDrive workbook remains the source of truth; this is a read-only copy
 * for the training pipeline (see docs/model-development-plan.md §3).
 */
export async function snapshotDataHub(orgId: string, orgCode: string): Promise<SnapshotResult> {
  const token = await getValidToken(orgCode, 'microsoft');
  if (!token) return { snapshotId: null, rowCount: 0, skipped: true, reason: 'not_connected' };

  const state = await getHubState(token, orgCode);
  const rows = state.rows;
  const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');

  const db = createServerClient();
  const { data: last } = await db
    .from('training_snapshots')
    .select('id, content_hash')
    .eq('org_id', orgId)
    .eq('kind', 'data_hub')
    .order('taken_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last?.content_hash === hash) {
    return { snapshotId: last.id, rowCount: rows.length, skipped: true, reason: 'unchanged' };
  }

  const { data, error } = await db
    .from('training_snapshots')
    .insert({
      org_id: orgId,
      kind: 'data_hub',
      row_count: rows.length,
      content_hash: hash,
      payload: rows,
      meta: { docCount: state.documents.length },
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  return { snapshotId: data.id, rowCount: rows.length, skipped: false };
}
