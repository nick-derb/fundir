/**
 * Admin one-shot: seed the funder graph from the legacy
 * SEED_FOUNDATIONS const so the funders table has day-one data without
 * waiting for the nightly ProPublica cron.
 *
 * Auth: same bearer-token gate as the crons (CRON_SECRET). The user
 * triggers it once after applying supabase/phase2_funder_graph.sql;
 * subsequent runs are idempotent and safe but unnecessary.
 *
 * No 990-PF Schedule I data is included — see the comment in
 * lib/graph/seed-foundations.ts. This only populates funders, not
 * grants_made.
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedFundersFromConstants } from '@/lib/graph/seed-foundations';

export const maxDuration = 60;
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
    const result = await seedFundersFromConstants();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
