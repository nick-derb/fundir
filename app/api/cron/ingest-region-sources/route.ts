/**
 * Phase 5B-cont: nightly region-source ingestion cron.
 *
 * Calls ingestRegionSources('chicago-metro') once per night. Each
 * adapter's fetch() either hits a live HTML scrape (GATA, eventually
 * DFSS / Cook County / ISBE) or returns its SEED constants. Idempotent:
 * existing source_id hits skip; only new opportunities embed.
 *
 * Cost: pure OpenAI embeddings (no Claude). For Chicago Metro today
 * that's <\$0.02/night even when GATA refreshes its full ~160 opp list.
 *
 * Auth: bearer-gated against CRON_SECRET, same shape as the other crons.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ingestRegionSources } from '@/lib/discovery/ingest-region';

export const maxDuration = 300;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

/**
 * List every region with at least one enabled state/local source. As
 * more regions seed in (Phase 0 architecture: "adding a new city = one
 * config row"), the cron picks them up automatically — no code edit.
 */
async function getActiveRegionSlugs(): Promise<string[]> {
  const db = createServerClient();
  const { data: regions } = await db
    .from('regions')
    .select(`slug, grant_sources!inner(id, enabled, source_type, region_id)`)
    .eq('grant_sources.enabled', true)
    .eq('grant_sources.source_type', 'state_local');
  const set = new Set<string>();
  for (const r of (regions ?? [])) set.add(r.slug as string);
  return [...set];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const startedAt = Date.now();
  const slugs = await getActiveRegionSlugs();
  if (slugs.length === 0) {
    return NextResponse.json({
      ok: false,
      message: 'no regions with active state_local sources configured',
    });
  }

  const summary: Array<{
    region: string; adapters_run: number;
    scanned: number; inserted: number; skipped_dupe: number;
    errors: string[];
  }> = [];

  for (const slug of slugs) {
    try {
      const result = await ingestRegionSources(slug);
      summary.push({
        region: slug,
        adapters_run: result.adapters_run,
        scanned: result.scanned, inserted: result.inserted,
        skipped_dupe: result.skipped_dupe,
        errors: result.errors,
      });
    } catch (err) {
      summary.push({
        region: slug, adapters_run: 0, scanned: 0, inserted: 0, skipped_dupe: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return NextResponse.json({
    ok:               true,
    duration_sec:     Math.round((Date.now() - startedAt) / 1000),
    regions_processed: summary.length,
    total_inserted:   summary.reduce((s, x) => s + x.inserted, 0),
    summary,
  });
}

export const GET = POST;
