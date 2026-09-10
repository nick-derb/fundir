import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { pickBmfFields } from '@/lib/prospecting/irs-bmf';

// Replace the IRS Business Master File sheet (Prospecting → "Replace IRS
// data"). The browser parses the dropped file and drives a small state
// machine here:
//   start   → open a run
//   stage   → push a batch of normalized rows into staging (repeat)
//   preview → diff staging against the live sheet
//   apply   → swap the sheet + rejoin the derived CYC sheets on EIN
//   cancel  → drop the run and its staged rows
// The heavy lifting (diff, apply) is one SQL function call each, so a
// 75k-row swap is set-based and transactional.

export const maxDuration = 60;

const MAX_BATCH = 2500;
/** Refuse to apply a file that would remove more than this share of the sheet. */
const MIN_COVERAGE = 0.5;

type Body =
  | { action: 'start'; fileName?: string; sourceRows?: number }
  | { action: 'stage'; runId: string; rows: Record<string, unknown>[] }
  | { action: 'preview'; runId: string; skippedRows?: number }
  | { action: 'apply'; runId: string }
  | { action: 'cancel'; runId: string };

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(ctx.isAdmin || ctx.role === 'admin')) {
    return NextResponse.json({ error: 'Only an organization admin can replace the shared IRS sheets.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const db = createServerClient();

  // Every action but `start` addresses a run this user opened.
  const loadRun = async (runId: unknown) => {
    if (!isUuid(runId)) return null;
    const { data } = await db.from('irs_bmf_runs').select('id, status, user_id, staged_rows').eq('id', runId).maybeSingle();
    if (!data || data.user_id !== ctx.userId) return null;
    return data as { id: string; status: string; user_id: string; staged_rows: number };
  };

  try {
    switch (body.action) {
      case 'start': {
        const { data, error } = await db.from('irs_bmf_runs').insert({
          org_id: ctx.orgId, user_id: ctx.userId, user_email: ctx.email,
          file_name: String(body.fileName ?? '').slice(0, 200) || null,
          source_rows: Math.max(0, Math.floor(Number(body.sourceRows) || 0)),
        }).select('id').single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ runId: data.id });
      }

      case 'stage': {
        const run = await loadRun(body.runId);
        if (!run) return NextResponse.json({ error: 'Unknown run' }, { status: 404 });
        if (run.status !== 'staging') return NextResponse.json({ error: `Run is ${run.status}` }, { status: 409 });
        const input = Array.isArray(body.rows) ? body.rows.slice(0, MAX_BATCH) : [];
        const rows = input.map(pickBmfFields).filter((r): r is NonNullable<typeof r> => r != null)
          .map(r => ({ run_id: run.id, ...r }));
        if (rows.length) {
          const { error } = await db.from('irs_bmf_staging').upsert(rows, { onConflict: 'run_id,ein' });
          if (error) throw new Error(error.message);
        }
        return NextResponse.json({ staged: rows.length });
      }

      case 'preview': {
        const run = await loadRun(body.runId);
        if (!run) return NextResponse.json({ error: 'Unknown run' }, { status: 404 });
        if (run.status === 'applied') return NextResponse.json({ error: 'Run already applied' }, { status: 409 });
        const { data, error } = await db.rpc('irs_bmf_diff', { p_run: run.id });
        if (error) throw new Error(error.message);
        const diff = data as { staged: number; current: number };
        if (Number.isFinite(Number(body.skippedRows))) {
          await db.from('irs_bmf_runs').update({ skipped_rows: Math.max(0, Math.floor(Number(body.skippedRows))) }).eq('id', run.id);
        }
        const coverage = diff.current ? diff.staged / diff.current : 1;
        return NextResponse.json({ ...diff, canApply: diff.staged > 0 && coverage >= MIN_COVERAGE, minCoverage: MIN_COVERAGE });
      }

      case 'apply': {
        const run = await loadRun(body.runId);
        if (!run) return NextResponse.json({ error: 'Unknown run' }, { status: 404 });
        if (run.status !== 'previewed') return NextResponse.json({ error: 'Preview the diff before applying it.' }, { status: 409 });
        const { count } = await db.from('irs_bmf_il').select('ein', { count: 'exact', head: true });
        const current = count ?? 0;
        if (run.staged_rows <= 0 || (current && run.staged_rows / current < MIN_COVERAGE)) {
          return NextResponse.json({
            error: `The file has ${run.staged_rows.toLocaleString('en-US')} usable rows but the current sheet has ${current.toLocaleString('en-US')}. Applying it would remove more than half the sheet, so it was not applied. Check that you dropped the full Illinois file.`,
          }, { status: 409 });
        }
        const { data, error } = await db.rpc('irs_bmf_apply', { p_run: run.id });
        if (error) throw new Error(error.message);
        return NextResponse.json({ applied: true, ...(data as Record<string, number>) });
      }

      case 'cancel': {
        const run = await loadRun(body.runId);
        if (run && run.status !== 'applied') {
          await db.from('irs_bmf_runs').delete().eq('id', run.id); // staging cascades
        }
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Replacement failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
