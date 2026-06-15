/**
 * Admin: ingest a region's state/local grant sources into the corpus.
 *
 * POST body:
 *   { region_slug: "chicago-metro" }
 *
 * Reads every grant_sources row whose region_id matches the slug,
 * runs each adapter's fetch(), inserts unique opportunities into
 * grant_opportunities (skipping by source_id dedupe key). Cost:
 * OpenAI embedding only — no Claude calls. ~$0.0001 per opportunity.
 *
 * After this, run /api/admin/rescore-corpus { org_code } so the
 * region's tenant orgs pick up scores against the newly-ingested
 * opportunities.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestRegionSources } from '@/lib/discovery/ingest-region';

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

  let body: { region_slug?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const regionSlug = body.region_slug ?? 'chicago-metro';

  try {
    const result = await ingestRegionSources(regionSlug);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = POST;
