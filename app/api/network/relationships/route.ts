import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { listRelationships } from '@/lib/network/queries';

export const maxDuration = 30;

// GET ?type=&verification=&limit= — the edge explorer.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(1000, Math.max(20, Number(sp.get('limit')) || 400));
  try {
    const edges = await listRelationships(createServerClient(), ctx.orgId, { type: sp.get('type'), verification: sp.get('verification'), limit });
    return NextResponse.json({ edges });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
