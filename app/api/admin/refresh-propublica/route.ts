/**
 * Admin: refresh funder + recipient metadata from ProPublica Nonprofit
 * Explorer. Free, no Claude. Same logic as the nightly cron.
 *
 * POST { funder_limit?, recipient_limit? }  (optional caps for testing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshFromPropublica } from '@/lib/graph/refresh-from-propublica';

export const maxDuration = 300;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: { funder_limit?: number; recipient_limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  try {
    const result = await refreshFromPropublica(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = POST;
