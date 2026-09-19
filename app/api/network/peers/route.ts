import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { isLinkedInConfigured } from '@/lib/network/linkedin';
import { peerStaffStatus, runPeerStaffStep } from '@/lib/network/peer-staff';

// Peer-staff scan: one bounded step per call (≤ 60 API calls) — one peer's
// employee searches, then up to ten profile reads, then graph derivation.
// Drive it from the Peer Network page (admin) or, for an operator run, with
// `Authorization: Bearer $NETWORK_JOB_TOKEN` plus the org code in the body.
export const maxDuration = 300;

async function resolveOrg(req: NextRequest): Promise<{ orgId: string; admin: boolean } | NextResponse> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const token = process.env.NETWORK_JOB_TOKEN;
  if (bearer && token && bearer.length === token.length && bearer === token) {
    const orgCode = req.nextUrl.searchParams.get('org') ?? 'CYC2026';
    const { data } = await createServerClient().from('organizations').select('id').eq('org_code', orgCode).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Unknown org' }, { status: 404 });
    return { orgId: data.id as string, admin: true };
  }
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  return { orgId: ctx.orgId, admin: ctx.isAdmin };
}

export async function GET(req: NextRequest) {
  const r = await resolveOrg(req);
  if (r instanceof NextResponse) return r;
  try { return NextResponse.json(await peerStaffStatus(r.orgId)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Status failed' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const r = await resolveOrg(req);
  if (r instanceof NextResponse) return r;
  if (!r.admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  if (!isLinkedInConfigured()) return NextResponse.json({ error: 'RAPIDAPI_KEY is not configured', notConfigured: true }, { status: 409 });
  const body = await req.json().catch(() => ({})) as { maxEnrich?: unknown; scan?: unknown };
  try {
    const result = await runPeerStaffStep(r.orgId, {
      maxEnrich: typeof body.maxEnrich === 'number' ? Math.max(0, Math.min(20, body.maxEnrich)) : undefined,
      scan: body.scan === false ? false : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Step failed' }, { status: 500 });
  }
}
