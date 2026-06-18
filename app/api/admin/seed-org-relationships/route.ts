/**
 * Admin: seed org → funder relationships.
 *
 * Bridges `lib/cra/seed-relationships.ts` (CYC's 4 known existing bank
 * relationships: Northern Trust, BMO, Wintrust, Huntington) into the
 * `org_funder_relationships` table. Idempotent — re-runs UPSERT on
 * (organization_id, funder_id).
 *
 * Run once after applying supabase/phase7_funder_intelligence.sql and
 * supabase/phase4_cra_layer.sql (the latter populates funders, which
 * this seed needs to resolve banks by FDIC id).
 *
 * Auth: bearer-gated against CRON_SECRET, same shape as the other
 * admin endpoints (seed-cra, seed-cyc-graph, seed-graph).
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedOrgFunderRelationships } from '@/lib/cra/seed-relationships';

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
    const result = await seedOrgFunderRelationships();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
