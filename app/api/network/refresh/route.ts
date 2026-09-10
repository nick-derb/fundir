import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { isLinkedInConfigured } from '@/lib/network/linkedin';
import { runRefreshStep, estimateRefresh, type RefreshCategory } from '@/lib/network/refresh';

// One bounded refresh step (≤ ~40 API calls): enrich stale board profiles
// first, then scan up to two employers for warm second-order paths. The UI
// re-invokes until `done` — same batch pattern as Refresh AI Analysis. This is
// deliberately on-demand only; there is no cron, and quarterly is plenty.
export const maxDuration = 300;

// GET — the pre-flight: what a refresh would do and cost before any call is made.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json(await estimateRefresh(ctx.orgId)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Estimate failed' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  if (!isLinkedInConfigured()) {
    return NextResponse.json({
      error: 'RapidAPI is not configured. Add RAPIDAPI_KEY to the environment (Vercel → Settings → Environment Variables) and redeploy.',
      notConfigured: true,
    }, { status: 409 });
  }
  const body = await req.json().catch(() => ({})) as { categories?: unknown };
  const categories = (Array.isArray(body.categories) ? body.categories : []).filter((c): c is RefreshCategory => c === 'people' || c === 'employers');

  try {
    const result = await runRefreshStep(ctx.orgId, { categories });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Refresh failed' }, { status: 500 });
  }
}
