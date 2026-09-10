import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { getValidToken } from '@/lib/oauth-tokens';
import { uploadDocument } from '@/lib/data-hub';
import { buildNetworkSnapshot, buildNetworkWorkbook, buildNetworkJson, networkWorkbookName, networkJsonName } from '@/lib/network/export';

export const maxDuration = 120;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// GET ?format=xlsx|json — download a dated snapshot of the whole graph.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const json = req.nextUrl.searchParams.get('format') === 'json';
  try {
    const buf = json ? await buildNetworkJson(ctx.orgId) : await buildNetworkWorkbook(ctx.orgId);
    return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': json ? 'application/json' : XLSX_TYPE, 'Content-Disposition': `attachment; filename="${json ? networkJsonName() : networkWorkbookName()}"` } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Export failed' }, { status: 500 });
  }
}

// POST — save both files (the workbook and its JSON twin) into the shared
// Data Hub folder in OneDrive, so the snapshot lives with the org's other
// documents and the advisor can read it.
export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const token = await getValidToken(ctx.orgCode, 'microsoft');
  if (!token) return NextResponse.json({ error: 'Microsoft 365 is not connected — download the export instead.', notConnected: true }, { status: 409 });
  try {
    const snap = await buildNetworkSnapshot(ctx.orgId);
    const [xlsx, json] = await Promise.all([buildNetworkWorkbook(ctx.orgId, snap), buildNetworkJson(ctx.orgId, snap)]);
    const doc = await uploadDocument(token, ctx.orgCode, networkWorkbookName(), xlsx, XLSX_TYPE);
    const docJson = await uploadDocument(token, ctx.orgCode, networkJsonName(), json, 'application/json');
    return NextResponse.json({ ok: true, document: { name: doc.name, webUrl: doc.webUrl }, json: { name: docJson.name, webUrl: docJson.webUrl }, counts: snap.meta.counts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Export failed' }, { status: 500 });
  }
}
