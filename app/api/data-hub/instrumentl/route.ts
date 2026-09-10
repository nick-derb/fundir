import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getValidToken } from '@/lib/oauth-tokens';
import { uploadDocument } from '@/lib/data-hub';
import { previewInstrumentl, commitInstrumentl } from '@/lib/instrumentl-import';

export const maxDuration = 120;

// POST multipart {file} [?commit=1] — preview what a fresh Instrumentl export
// would change, or replace the org's Instrumentl-sourced submissions with it.
// On commit the file is also filed into the Data Hub folder when Microsoft 365
// is connected, so the export CYC uploaded is kept alongside its other documents.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const commit = req.nextUrl.searchParams.get('commit') === '1';
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: 'Upload the Instrumentl export as .xlsx' }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ error: 'File too large (max ~4 MB)' }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = createServerClient();
  try {
    if (!commit) { const { rows: _rows, ...preview } = await previewInstrumentl(db, ctx.orgId, buffer); void _rows; return NextResponse.json({ preview }); }
    const result = await commitInstrumentl(db, ctx.orgId, buffer);
    let filed: { name: string; webUrl: string | null } | null = null;
    try {
      const token = await getValidToken(ctx.orgCode, 'microsoft');
      if (token) { const doc = await uploadDocument(token, ctx.orgCode, `Instrumentl Data ${new Date().toISOString().slice(0, 10)}.xlsx`, buffer, file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); filed = { name: doc.name, webUrl: doc.webUrl }; }
    } catch { /* filing the copy is best-effort */ }
    return NextResponse.json({ ok: true, ...result, filed, by: ctx.email, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 });
  }
}
