/**
 * Admin: ingest the foundation_seed adapter into grant_opportunities.
 *
 * One-shot; idempotent. Each foundation_seed row becomes a
 * grant_opportunity with funder_id resolved against funders (Phase 2
 * populated foundations + Phase 4 populated banks). After this:
 *
 *   POST /api/admin/rescore-corpus { org_code }
 *
 * picks up the new rows and produces match_results — and the Phase 3
 * funder-affinity factor finally has match rows where it can score
 * non-zero.
 *
 * Bearer-gated against CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestFoundations } from '@/lib/discovery/ingest-foundations';

export const maxDuration = 120;
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
  try {
    const result = await ingestFoundations();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
