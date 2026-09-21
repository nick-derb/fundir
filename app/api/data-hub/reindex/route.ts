import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getValidToken } from '@/lib/oauth-tokens';
import { getHubState } from '@/lib/data-hub';
import { reconcileDocuments } from '@/lib/cyc-context/documents';
import { resolveDrive } from '@/lib/sharepoint';

// Read the documents in the shared folder that Fundir has not read yet.
// Files dropped straight into SharePoint never pass through the upload route,
// so nothing indexed them; this is the catch-up, and any CYC user may run it.
// One call reads up to eight documents; the response says how many remain.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let orgId: string, orgCode: string;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const jobToken = process.env.NETWORK_JOB_TOKEN;
  if (bearer && jobToken && bearer.length === jobToken.length && bearer === jobToken) {
    orgCode = req.nextUrl.searchParams.get('org') ?? 'CYC2026';
    const { data } = await createServerClient().from('organizations').select('id').eq('org_code', orgCode).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Unknown org' }, { status: 404 });
    orgId = data.id as string;
  } else {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
    orgId = ctx.orgId; orgCode = ctx.orgCode;
  }
  const token = await getValidToken(orgCode, 'microsoft');
  if (!token) return NextResponse.json({ error: 'Microsoft 365 is not connected' }, { status: 409 });
  try {
    const hub = await getHubState(token, orgCode);
    const { base } = await resolveDrive(token, orgCode);
    const result = await reconcileDocuments(orgId, token, hub.documents.map(d => ({ id: d.id, name: d.name })), { maxDocs: 8, deadlineMs: 230_000, base });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Reindex failed' }, { status: 500 });
  }
}
