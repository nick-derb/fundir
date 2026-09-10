import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { graphOverview, graphNeighborhood, findNode } from '@/lib/network/queries';

export const maxDuration = 30;

// GET — the map. No params: the overview (paths behind the strongest leads).
// ?kind=person|org&id=…: that node's neighbourhood. ?q=…: resolve a name first.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const db = createServerClient();
  try {
    let kind = sp.get('kind') as 'person' | 'org' | null, id = sp.get('id');
    if (sp.get('q')) { const hit = await findNode(db, ctx.orgId, sp.get('q')!); if (!hit) return NextResponse.json({ error: `Nothing in the graph matches “${sp.get('q')}”` }, { status: 404 }); kind = hit.kind; id = hit.id; }
    if (kind && id && (kind === 'person' || kind === 'org')) return NextResponse.json(await graphNeighborhood(db, ctx.orgId, { kind, id }));
    return NextResponse.json(await graphOverview(db, ctx.orgId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
