/**
 * Admin: re-score an org's existing match_results against the current
 * matcher state. Use after landing a new factor (Phase 4 CRA, future
 * Phase 3 funder-affinity) so the new signal propagates onto rows that
 * were scored before the factor existed.
 *
 * Zero external API cost — embeddings and extracted fields come straight
 * off grant_opportunities; Claude/OpenAI are never called.
 *
 * Auth: bearer-gated against CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { rescoreOrgCorpus } from '@/lib/discovery/rescore';

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

  let body: { org_code?: string; org_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  let org_id = body.org_id ?? null;
  let org_code = body.org_code ?? null;

  if (!org_id && org_code) {
    const db = createServerClient();
    const { data } = await db
      .from('organizations')
      .select('id')
      .eq('org_code', org_code)
      .maybeSingle();
    org_id = (data?.id as string) ?? null;
  }
  if (org_id && !org_code) {
    const db = createServerClient();
    const { data } = await db
      .from('organizations')
      .select('org_code')
      .eq('id', org_id)
      .maybeSingle();
    org_code = (data?.org_code as string) ?? null;
  }

  if (!org_id || !org_code) {
    return NextResponse.json({ ok: false, error: 'org_id or org_code required' }, { status: 400 });
  }

  try {
    const result = await rescoreOrgCorpus(org_id, org_code);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
