import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { indexCycContext } from '@/lib/cyc-context/build';
import { getValidToken } from '@/lib/oauth-tokens';
import { getHubState } from '@/lib/data-hub';
import { reconcileDocuments } from '@/lib/cyc-context/documents';

export const maxDuration = 300;

// GET — how many advisor-knowledge chunks are indexed for the admin's org.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = createServerClient();
  const { count } = await db
    .from('cyc_context_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', ctx.orgId);
  return NextResponse.json({ chunks: count ?? 0 });
}

// POST — rebuild the RAG index from current proprietary data.
export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const result = await indexCycContext(ctx.orgId, ctx.orgCode);

    // Also reconcile uploaded documents (index new/changed, drop deleted) so a
    // manual rebuild catches files dropped straight into the OneDrive folder.
    let documents: { indexed: number; removed: number } | null = null;
    const token = await getValidToken(ctx.orgCode, 'microsoft');
    if (token) {
      try {
        const hub = await getHubState(token, ctx.orgCode);
        documents = await reconcileDocuments(
          ctx.orgId, token,
          hub.documents.map(d => ({ id: d.id, name: d.name })),
        );
      } catch (e) {
        console.error('doc reconcile failed', e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true, ...result, documents });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
