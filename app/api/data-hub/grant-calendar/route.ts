import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { getValidToken } from '@/lib/oauth-tokens';
import { uploadDocument } from '@/lib/data-hub';
import { previewGrantCalendar, commitGrantCalendar } from '@/lib/grant-calendar-import';

export const maxDuration = 120;

// POST multipart {file} [?commit=1] — preview what a grant calendar workbook
// would load, or replace the fiscal years it carries. Works without Microsoft
// 365; when org storage is connected a copy is filed into the Data Hub too.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const commit = req.nextUrl.searchParams.get('commit') === '1';
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/\.(xlsx?|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload the grant calendar as .xlsx or .csv' }, { status: 400 });
  if (file.size > 8_000_000) return NextResponse.json({ error: 'File too large (max ~8 MB)' }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = createServerClient();
  try {
    if (!commit) return NextResponse.json({ preview: await previewGrantCalendar(db, ctx.orgId, buffer, file.name) });
    const result = await commitGrantCalendar(db, ctx.orgId, buffer, file.name);
    let filed: { name: string; webUrl: string | null } | null = null;
    try {
      const token = await getValidToken(ctx.orgCode, 'microsoft');
      if (token) {
        const ext = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
        const doc = await uploadDocument(token, ctx.orgCode, `${result.years.join('-')} Grant Calendar ${new Date().toISOString().slice(0, 10)}.${ext}`, buffer, file.type || (ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
        filed = { name: doc.name, webUrl: doc.webUrl };
      }
    } catch { /* filing the copy is best-effort */ }
    return NextResponse.json({ ok: true, ...result, filed, by: ctx.email, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 });
  }
}
