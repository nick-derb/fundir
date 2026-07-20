import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken } from '@/lib/oauth-tokens';
import { appendRow } from '@/lib/data-hub';

export const maxDuration = 60;

// Reads are served by GET /api/data-hub/state (rows + documents + health in one
// resolve). This route is append-only.

/** POST — append one submission to the shared workbook. */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = await getValidToken(ctx.orgCode, 'microsoft');
  if (!token) {
    return NextResponse.json({ error: 'Microsoft 365 is not connected for this organization' }, { status: 409 });
  }

  const body = await req.json() as {
    site?: string; period?: string; metric?: string; value?: string; notes?: string;
  };

  const clean = (s: string | undefined, max: number) => (s ?? '').toString().trim().slice(0, max);
  const site   = clean(body.site,   120);
  const period = clean(body.period, 40);
  const metric = clean(body.metric, 120);
  const value  = clean(body.value,  200);
  const notes  = clean(body.notes,  500);

  if (!site || !metric || !value) {
    return NextResponse.json({ error: 'Site, metric, and value are required' }, { status: 400 });
  }

  try {
    await appendRow(token, ctx.orgCode, {
      submittedBy: ctx.email,
      site, period, metric, value, notes,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not write to the shared workbook';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
