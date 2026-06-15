/**
 * Admin: re-extract the stored grant corpus against the current
 * extraction prompt. Use after editing the prompt so existing rows pick
 * up new structured fields without a fresh discovery pass.
 *
 * Cost: ~$0.005 per grant (Claude). Bearer-gated against CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { reExtractCorpus } from '@/lib/discovery/re-extract';

export const maxDuration = 300;
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
  let body: { limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  try {
    const result = await reExtractCorpus({ limit: body.limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
