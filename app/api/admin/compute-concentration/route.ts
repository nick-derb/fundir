/**
 * Admin: compute + persist a concentration snapshot for one org.
 *
 * POST { org_code }. Returns the computed snapshot + the persisted id.
 *
 * Auth: bearer-gated against CRON_SECRET. Re-running over an existing
 * org appends a new historical row; the dashboard reads the latest
 * via loadLatestConcentration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeConcentration, persistConcentrationSnapshot } from '@/lib/discovery/concentration';

export const maxDuration = 30;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let body: { org_code?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  if (!body.org_code) {
    return NextResponse.json({ ok: false, error: 'org_code required' }, { status: 400 });
  }
  try {
    const snap = await computeConcentration(body.org_code);
    if (!snap) {
      return NextResponse.json({ ok: false, error: 'org not found or no financial profile' }, { status: 404 });
    }
    const { id } = await persistConcentrationSnapshot(snap);
    return NextResponse.json({ ok: true, snapshot_id: id, ...snap });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
