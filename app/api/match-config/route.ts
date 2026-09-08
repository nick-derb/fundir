import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import {
  getMatchConfig, saveMatchConfig, validateMatchConfig,
  WEIGHT_KEYS, type MatchConfig, type MatchWeights,
} from '@/lib/match-config';

export const maxDuration = 60;

// GET — the org's current weights + minimum-score floor.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(await getMatchConfig(ctx.orgId));
}

// PUT — save weights + floor, then re-score the org's stored matches so the
// change is visible everywhere immediately.
export async function PUT(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // An impersonating admin is explicitly read-only — never write as someone else.
  if (ctx.impersonating) {
    return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  }

  let body: { minScore?: unknown; weights?: Record<string, unknown> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const weights = {} as MatchWeights;
  for (const k of WEIGHT_KEYS) weights[k] = Number(body.weights?.[k]);
  const cfg: MatchConfig = { minScore: Number(body.minScore), weights };

  const invalid = validateMatchConfig(cfg);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const { rescored } = await saveMatchConfig(ctx.orgId, cfg, ctx.email);
    return NextResponse.json({ ok: true, ...cfg, rescored });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
}
