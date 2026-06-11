/**
 * Phase 2D — daily funder-graph ingestion cron.
 *
 * Walks every Fundir region's states, picks up where the last run left
 * off (via ingest_state cursor), pulls foundations from ProPublica,
 * upserts them into `funders`. Designed to be safe to re-run — the
 * underlying repo UPSERTs on EIN, so a crash mid-batch just rewinds to
 * the saved cursor on the next tick.
 *
 * Auth: same bearer-token gate as the corpus-refresh cron. Set
 * CRON_SECRET in Vercel project env before enabling the schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ingestFundersForState } from '@/lib/graph/propublica-funders';
import { readIngestState, writeIngestState } from '@/lib/graph/repo';

export const maxDuration = 300;
export const dynamic     = 'force-dynamic';

const ADAPTER_KEY  = 'propublica_990pf';
const MAX_PAGES_PER_BATCH = 5;     // pages per (state) per cron invocation
const SOFT_TIME_BUDGET_S  = 270;   // leave a 30s safety margin under maxDuration

interface RegionRow { slug: string; geo_scope: { states?: string[] } }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

async function getStatesAcrossRegions(): Promise<string[]> {
  // Service-role read; bypasses RLS.
  const db = createServerClient();
  const { data } = await db.from('regions').select('slug, geo_scope');
  const rows = (data as RegionRow[]) ?? [];
  const out = new Set<string>();
  for (const r of rows) {
    for (const s of r.geo_scope?.states ?? []) {
      if (typeof s === 'string' && s.length === 2) out.add(s.toUpperCase());
    }
  }
  return [...out];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const startedAt = Date.now();
  const states   = await getStatesAcrossRegions();
  if (states.length === 0) {
    return NextResponse.json({
      ok: false,
      message: 'No regions configured (run supabase/phase1_config_foundation.sql).',
    });
  }

  const summary: Array<{
    state: string; pages_seen: number; funders_seen: number;
    funders_kept: number; cursor_after: string | null; errors: string[];
  }> = [];

  for (const state of states) {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed > SOFT_TIME_BUDGET_S) break;

    // Resume from saved cursor, or 0.
    const prior = await readIngestState(ADAPTER_KEY, state);
    const startPage = prior?.cursor ? parseInt(prior.cursor, 10) || 0 : 0;

    try {
      const result = await ingestFundersForState(state, startPage, MAX_PAGES_PER_BATCH);

      await writeIngestState({
        adapter_key:  ADAPTER_KEY,
        batch_key:    state,
        cursor:       result.next_cursor,
        records_seen: (prior?.records_seen ?? 0) + result.funders_seen,
        records_kept: (prior?.records_kept ?? 0) + result.funders_kept,
        errors:       (prior?.errors ?? 0) + result.errors.length,
        last_error:   result.errors[0] ?? prior?.last_error ?? null,
      });

      summary.push({
        state,
        pages_seen:   result.pages_seen,
        funders_seen: result.funders_seen,
        funders_kept: result.funders_kept,
        cursor_after: result.next_cursor,
        errors:       result.errors,
      });
    } catch (err) {
      summary.push({
        state,
        pages_seen: 0, funders_seen: 0, funders_kept: 0,
        cursor_after: prior?.cursor ?? null,
        errors:       [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return NextResponse.json({
    ok:               true,
    duration_sec:     Math.round((Date.now() - startedAt) / 1000),
    states_processed: summary.length,
    total_seen:       summary.reduce((s, x) => s + x.funders_seen, 0),
    total_kept:       summary.reduce((s, x) => s + x.funders_kept, 0),
    summary,
  });
}

// Allow GET so manual admin runs work too (still bearer-gated).
export const GET = POST;
