/**
 * Admin: one-shot CYC graph seed.
 *
 * Idempotent — applies the hand-curated CYC peer set + funder→peer edges
 * to recipients / peer_orgs / grants_made. After this lands, the
 * funder-affinity factor has real data to score against for CYC's
 * foundation and bank matches.
 *
 * Bearer-gated against CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedCycGraph } from '@/lib/graph/seed-cyc-runner';

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
    const result = await seedCycGraph();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
