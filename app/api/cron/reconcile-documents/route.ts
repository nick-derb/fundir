import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getValidToken } from '@/lib/oauth-tokens';
import { getHubState } from '@/lib/data-hub';
import { reconcileDocuments } from '@/lib/cyc-context/documents';
import { resolveDrive } from '@/lib/sharepoint';

// Nightly backstop: for every org with a Microsoft 365 connection, read any
// document in the shared folder that Fundir has not read yet and drop chunks
// for documents that were deleted. Bounded per org so the run stays inside
// the function limit; whatever is left is picked up the next night.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;                     // no fail-open
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createServerClient();
  const { data: conns } = await db.from('org_integrations').select('org_code').eq('provider', 'microsoft');
  const codes = Array.from(new Set((conns ?? []).map(c => c.org_code as string)));
  const out: Record<string, unknown> = {};
  const started = Date.now();
  for (const code of codes) {
    if (Date.now() - started > 200_000) { out[code] = 'skipped: out of time'; continue; }
    try {
      const { data: org } = await db.from('organizations').select('id').eq('org_code', code).maybeSingle();
      const token = org ? await getValidToken(code, 'microsoft') : null;
      if (!org || !token) { out[code] = 'not connected'; continue; }
      const hub = await getHubState(token, code);
      const { base } = await resolveDrive(token, code);
      out[code] = await reconcileDocuments(org.id as string, token, hub.documents.map(d => ({ id: d.id, name: d.name })), { maxDocs: 6, deadlineMs: Math.max(30_000, 230_000 - (Date.now() - started)), base });
    } catch (e) { out[code] = `failed: ${e instanceof Error ? e.message : e}`; }
  }
  return NextResponse.json({ ok: true, orgs: out });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
