/**
 * Admin: one-shot CRA bootstrap. Seeds:
 *   - 9 Chicago Metro bank funders → `funders`
 *   - ~40 South/West Chicago LMI tracts → `census_tracts`
 *   - Bank × tract AA links → `bank_assessment_areas`
 *
 * Run once after applying supabase/phase4_cra_layer.sql. Idempotent;
 * subsequent runs are cheap no-ops on unchanged data.
 *
 * Auth: bearer-gated against CRON_SECRET, same shape as the other
 * admin endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedCraFromConstants } from '@/lib/cra/seed-runner';

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
    const result = await seedCraFromConstants();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
