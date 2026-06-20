/**
 * Admin: B6 — generate a brief for one (org, funder) pair, or for the
 * top-N funders by prospect_score if `top_n` is set.
 *
 * POST { org_code, funder_id?, top_n? }
 *
 * Cost: ~$0.07/brief. With top_n=30 ≈ $2.10. Caller responsible for
 * BUDGET.md gating.
 *
 * Cache: per BUDGET.md lever 5, regenerates only if brief_edge_hash has
 * changed since the last write. To force regeneration pass force=true.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateBriefForPair } from '@/lib/funder-intel/brief-generator';

export const maxDuration = 300;
export const dynamic     = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { org_code?: string; funder_id?: string; top_n?: number; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const orgCode = body.org_code ?? 'CYC2026';
  const force   = body.force ?? false;

  const db = createServerClient();
  const { data: org } = await db.from('organizations')
    .select('id').eq('org_code', orgCode).maybeSingle();
  if (!org) return NextResponse.json({ ok: false, error: `org ${orgCode} not found` }, { status: 404 });

  // Determine which funders to brief.
  let funderIds: string[] = [];
  if (body.funder_id) {
    funderIds = [body.funder_id];
  } else if (body.top_n) {
    const { data: top } = await db.from('funder_intel')
      .select('funder_id, prospect_score, brief_edge_hash')
      .eq('organization_id', org.id)
      .order('prospect_score', { ascending: false })
      .limit(body.top_n);
    funderIds = (top ?? []).map(t => t.funder_id as string);
  } else {
    return NextResponse.json({ ok: false, error: 'need funder_id or top_n' }, { status: 400 });
  }

  const results: Array<{ funder_id: string; status: string; cost_micro_cents?: number; todo_count?: number }> = [];
  let total_cost = 0;
  let generated  = 0;
  let cached     = 0;
  let skipped    = 0;

  for (const funder_id of funderIds) {
    // Check cache: if the brief_edge_hash matches the current edge set,
    // skip regeneration (unless force=true).
    if (!force) {
      const { data: existing } = await db.from('funder_intel')
        .select('brief, brief_edge_hash')
        .eq('organization_id', org.id)
        .eq('funder_id', funder_id)
        .maybeSingle();
      if (existing?.brief && existing.brief_edge_hash) {
        // Quick hash recompute — same as brief-generator.computeEdgeHash.
        const { data: edges } = await db.from('grants_made')
          .select('id').eq('funder_id', funder_id);
        const { default: crypto } = await import('crypto');
        const sorted = (edges ?? []).map(e => e.id as string).sort();
        const hash = crypto.createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 32);
        if (hash === existing.brief_edge_hash) {
          cached += 1;
          results.push({ funder_id, status: 'cached' });
          continue;
        }
      }
    }

    const { brief, reason_skipped } = await generateBriefForPair(orgCode, funder_id);
    if (!brief) {
      skipped += 1;
      results.push({ funder_id, status: `skipped: ${reason_skipped}` });
      continue;
    }

    // Persist brief fields only — never overwrite prospect_score (set by B5).
    // We use UPDATE on the expected-existing row rather than UPSERT so we
    // don't accidentally clobber B5's score with our zero default. If the
    // row doesn't exist yet (no B5 run), we INSERT with score=0; B5 will
    // set it correctly on its next run.
    const briefRow = {
      brief:              { sections: brief.sections, citations: brief.citations, todo_count: brief.todo_marker_count },
      brief_generated_at: new Date().toISOString(),
      brief_edge_hash:    brief.edge_hash,
      refreshed_at:       new Date().toISOString(),
    };
    let upErr: { message: string } | null = null;
    const { data: existingRow } = await db.from('funder_intel')
      .select('organization_id').eq('organization_id', org.id).eq('funder_id', funder_id).maybeSingle();
    if (existingRow) {
      const { error } = await db.from('funder_intel')
        .update(briefRow)
        .eq('organization_id', org.id)
        .eq('funder_id', funder_id);
      upErr = error;
    } else {
      const { error } = await db.from('funder_intel').insert({
        organization_id:    org.id,
        funder_id,
        prospect_score:     0,            // placeholder until B5 runs
        peer_overlap_count: brief.citations.length,
        ...briefRow,
      });
      upErr = error;
    }

    if (upErr) {
      results.push({ funder_id, status: `error: ${upErr.message}` });
      continue;
    }
    generated += 1;
    total_cost += brief.cost_micro_cents;
    results.push({
      funder_id, status: 'generated',
      cost_micro_cents: brief.cost_micro_cents,
      todo_count:       brief.todo_marker_count,
    });
  }

  return NextResponse.json({
    ok: true,
    org_id: org.id,
    requested: funderIds.length,
    generated, cached, skipped,
    total_cost_micro_cents: total_cost,
    total_cost_dollars:     `$${(total_cost / 100_000).toFixed(4)}`,
    results,
  });
}

export const GET = POST;
