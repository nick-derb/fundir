/**
 * Admin: resolve one org's program-site addresses to census tracts.
 * Updates organizations.census_tract + lmi_flag, populates
 * census_tracts for the resolved tracts.
 *
 * Body (JSON):
 *   { org_code: "CYC2025" }     // resolves CYC; for the seed tenant it
 *                                // also pre-populates profile_data with
 *                                // the addresses from CYC_SITES if they
 *                                // aren't already there.
 *
 * Auth: bearer-gated against CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  resolveOrgAddresses, resolveOrgAddressesFromCycLiveData,
} from '@/lib/cra/resolve-org';

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

  let body: { org_code?: string; org_id?: string } = {};
  try {
    body = await req.json();
  } catch { /* allow empty body */ }

  // Resolve to an org_id (the resolver works on UUIDs).
  let org_id = body.org_id ?? null;
  if (!org_id && body.org_code) {
    if (body.org_code === 'CYC2025') {
      // Special path: pulls addresses from CYC_SITES and writes them
      // through profile_data before resolving.
      const result = await resolveOrgAddressesFromCycLiveData('CYC2025');
      return NextResponse.json({ ok: true, ...result });
    }
    const db = createServerClient();
    const { data } = await db
      .from('organizations')
      .select('id')
      .eq('org_code', body.org_code)
      .maybeSingle();
    org_id = (data?.id as string) ?? null;
  }

  if (!org_id) {
    return NextResponse.json(
      { ok: false, error: 'Missing org_id or unknown org_code' },
      { status: 400 },
    );
  }

  try {
    const result = await resolveOrgAddresses(org_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
