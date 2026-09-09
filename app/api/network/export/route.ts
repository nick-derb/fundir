import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken } from '@/lib/oauth-tokens';
import { uploadDocument } from '@/lib/data-hub';
import { buildNetworkWorkbook, networkWorkbookName } from '@/lib/network/export';

export const maxDuration = 60;

// GET — download a dated .xlsx snapshot of the whole network graph.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const buf = await buildNetworkWorkbook(ctx.orgId);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${networkWorkbookName()}"`,
    },
  });
}

// POST — save the same snapshot into the shared Data Hub folder in OneDrive,
// so it lives with the org's other documents (and the advisor reads it).
export async function POST(_req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });

  const token = await getValidToken(ctx.orgCode, 'microsoft');
  if (!token) {
    return NextResponse.json({ error: 'Microsoft 365 is not connected — download the export instead.' }, { status: 409 });
  }
  try {
    const buf = await buildNetworkWorkbook(ctx.orgId);
    const doc = await uploadDocument(
      token, ctx.orgCode, networkWorkbookName(), buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return NextResponse.json({ ok: true, document: { name: doc.name, webUrl: doc.webUrl } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Export failed' }, { status: 500 });
  }
}
