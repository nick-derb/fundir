import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { listKnownFunders, previewDonorExport, commitDonorExport } from '@/lib/known-funders';

export const maxDuration = 120;

// GET — the funder record as it stands (what the team marked on leads, what a
// Raiser's Edge import added), for the Data Hub card's list.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json({ funders: await listKnownFunders(createServerClient(), ctx.orgId) }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 }); }
}

// POST multipart {file} [?commit=1] — preview what a Raiser's Edge (or any
// donor-system) export of past funders would record, or record it. Individuals
// are skipped when the export has a constituent-type column. A relationship
// the team set by hand is kept; the export only fills in the gift history.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const commit = req.nextUrl.searchParams.get('commit') === '1';
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/\.(xlsx?|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload the export as .xlsx, .xls or .csv' }, { status: 400 });
  if (file.size > 8_000_000) return NextResponse.json({ error: 'File too large (max ~8 MB)' }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = createServerClient();
  try {
    if (!commit) return NextResponse.json({ preview: await previewDonorExport(db, ctx.orgId, buffer) });
    const res = await commitDonorExport(db, ctx.orgId, buffer, ctx.email);
    return NextResponse.json({ ok: true, ...res, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 });
  }
}
