import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { previewRoster, commitRoster, rosterStatus } from '@/lib/board-roster';
import { rosterTemplate } from '@/lib/import-templates';

export const maxDuration = 120;

// GET — who is on the roster now (by board) and when it was last uploaded;
// ?template=1 downloads a blank roster sheet.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (req.nextUrl.searchParams.get('template') === '1') {
    return new NextResponse(new Uint8Array(rosterTemplate()), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="Board roster template.xlsx"' } });
  }
  try { return NextResponse.json({ status: await rosterStatus(createServerClient(), ctx.orgId) }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 }); }
}

// POST multipart {file, effective?} [?commit=1] — preview who joins, who
// continues and who rolls off, or apply it as of the effective date.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const commit = req.nextUrl.searchParams.get('commit') === '1';
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/\.(xlsx?|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload the roster as .xlsx, .xls or .csv. A PDF roster has to be saved as a spreadsheet first.' }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ error: 'File too large (max ~4 MB)' }, { status: 413 });
  const effective = String(form?.get('effective') ?? '').trim() || new Date().toISOString().slice(0, 10);
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = createServerClient();
  try {
    if (!commit) return NextResponse.json({ preview: await previewRoster(db, ctx.orgId, buffer) });
    return NextResponse.json({ ok: true, ...(await commitRoster(db, ctx.orgId, buffer, effective)), at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 });
  }
}
