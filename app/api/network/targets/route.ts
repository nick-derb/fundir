import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { isLinkedInConfigured } from '@/lib/network/linkedin';
import { targetStatus, runTargetStep, addTarget, removeTarget, seedStarter, listTargets, finalizeTargets, CHICAGO_STARTER } from '@/lib/network/targets';

// Target companies: the list CYC wants community-affairs and giving contacts
// at, and the bounded LinkedIn scan that finds them. GET returns the list and
// what a run would cost; POST manages the list or runs ONE step (≤ ~60 API
// calls). The panel re-invokes until `done` or its credit cap, same batch
// pattern as the network refresh. On demand only; no cron.
export const maxDuration = 300;

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json({ ...(await targetStatus(ctx.orgId)), starter: CHICAGO_STARTER }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Status failed' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { action?: string; name?: string; searchName?: string; category?: string; id?: string; derive?: boolean };
  const db = createServerClient();
  try {
    switch (body.action) {
      case 'seed': {
        const added = await seedStarter(db, ctx.orgId, ctx.email ?? null);
        return NextResponse.json({ ok: true, added, targets: await listTargets(db, ctx.orgId) });
      }
      case 'add': {
        if (!body.name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
        const r = await addTarget(db, ctx.orgId, { name: body.name, searchName: body.searchName ?? null, category: body.category, createdBy: ctx.email ?? null });
        return NextResponse.json({ ok: true, ...r, targets: await listTargets(db, ctx.orgId) });
      }
      case 'remove': {
        if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
        await removeTarget(db, ctx.orgId, body.id);
        return NextResponse.json({ ok: true, targets: await listTargets(db, ctx.orgId) });
      }
      case 'step': {
        if (!isLinkedInConfigured()) {
          return NextResponse.json({ error: 'RapidAPI is not configured. Add RAPIDAPI_KEY to the environment (Vercel → Settings → Environment Variables) and redeploy.', notConfigured: true }, { status: 409 });
        }
        const result = await runTargetStep(ctx.orgId, { derive: body.derive === true, createdBy: ctx.email ?? null });
        return NextResponse.json({ ok: true, ...result });
      }
      case 'finalize': {
        // No credits: derive edges and recompute leads from what is already read.
        const result = await finalizeTargets(ctx.orgId);
        return NextResponse.json({ ok: true, ...result });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
