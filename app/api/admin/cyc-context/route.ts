import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { indexCycContext } from '@/lib/cyc-context/build';

export const maxDuration = 120;

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
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
