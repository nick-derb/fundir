/**
 * Admin: B5 — compute prospect_score for every funder × org with peer
 * overlap, write to funder_intel. No Claude. No embeddings. $0.
 *
 * POST { org_code: "CYC2025" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { scoreFunderIntelForOrg } from '@/lib/funder-intel/score';

export const maxDuration = 120;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { org_code?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const orgCode = body.org_code ?? 'CYC2025';

  try {
    const result = await scoreFunderIntelForOrg(orgCode);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
