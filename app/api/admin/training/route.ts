import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { snapshotDataHub } from '@/lib/training/snapshot';
import { exportTrainingExamples, FEATURE_SPEC_VERSION } from '@/lib/training/feature-export';

export const maxDuration = 60;

// GET — training-data status for the admin's current org (counts only, no PII).
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const db = createServerClient();
  const [snapsRes, examplesRes] = await Promise.all([
    db.from('training_snapshots')
      .select('id, taken_at, row_count', { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .order('taken_at', { ascending: false })
      .limit(1),
    db.from('training_examples')
      .select('label')
      .eq('org_id', ctx.orgId)
      .eq('feature_spec_version', FEATURE_SPEC_VERSION),
  ]);

  const ex = examplesRes.data ?? [];
  const awarded = ex.filter(e => e.label === 'awarded').length;
  const rejected = ex.filter(e => e.label === 'rejected').length;

  return NextResponse.json({
    featureSpecVersion: FEATURE_SPEC_VERSION,
    snapshots: { count: snapsRes.count ?? 0, latest: snapsRes.data?.[0] ?? null },
    examples: { total: ex.length, awarded, rejected },
  });
}

// POST { action: 'snapshot' | 'export' } — run a training-pipeline step.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { action } = await req.json().catch(() => ({ action: null }));

  try {
    if (action === 'snapshot') {
      const r = await snapshotDataHub(ctx.orgId, ctx.orgCode);
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === 'export') {
      // Snapshot the Data Hub first (best-effort) so examples reference the
      // current proprietary-data snapshot; then materialize features.
      const snap = await snapshotDataHub(ctx.orgId, ctx.orgCode).catch(() => null);
      const r = await exportTrainingExamples(ctx.orgId, snap?.snapshotId ?? null);
      return NextResponse.json({ ok: true, snapshot: snap, ...r });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
