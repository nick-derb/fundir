import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { isLinkedInConfigured } from '@/lib/network/linkedin';
import { runRefreshStep } from '@/lib/network/refresh';

// One bounded refresh step (≤ ~40 API calls): enrich stale board profiles
// first, then scan up to two employers for warm second-order paths. The UI
// re-invokes until `done` — same batch pattern as Refresh AI Analysis. This is
// deliberately on-demand only; there is no cron, and quarterly is plenty.
export const maxDuration = 300;

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  if (!isLinkedInConfigured()) {
    return NextResponse.json({
      error: 'RapidAPI is not configured. Add RAPIDAPI_KEY to the environment (Vercel → Settings → Environment Variables) and redeploy.',
      notConfigured: true,
    }, { status: 409 });
  }

  try {
    const result = await runRefreshStep(ctx.orgId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Refresh failed' }, { status: 500 });
  }
}
