/**
 * Vercel cron: nightly ProPublica metadata refresh for every funder +
 * recipient row with a verified EIN. Free; bearer-gated against
 * CRON_SECRET (Vercel sets x-vercel-cron + Authorization automatically).
 *
 * Schedule: vercel.json — `0 4 * * *` (04:00 UTC daily).
 *
 * Soft-fails on individual EIN errors; logs total counts. The runner
 * is rate-limited to 1 req/s so a corpus of ~1K funders takes ~17 min
 * — well inside the 5-minute Vercel default... wait. Vercel's hobby
 * plan caps maxDuration at 60s. So this runner has to be sized for
 * partial passes per cron tick.
 *
 * Mitigation: pass funder_limit=200 and rotate (i.e., the first 200
 * tonight, the next 200 tomorrow). Since freshness on metadata is
 * weekly-relevant not minute-relevant, a 5-day rotation cycle is fine.
 *
 * If/when budget supports a Vercel Pro plan (5-min cron timeout) or a
 * Fly worker, drop the limit and refresh everything in one pass.
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshFromPropublica } from '@/lib/graph/refresh-from-propublica';

export const maxDuration = 60;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    // Per-tick cap so we fit inside 60s. ~1 req/s for funders + recipients
    // → ~50 records inside the budget with headroom.
    const result = await refreshFromPropublica({ funder_limit: 30, recipient_limit: 20 });
    return NextResponse.json({ ok: true, source: 'cron', ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
