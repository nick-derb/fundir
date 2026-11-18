import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { previewGrantReport, commitGrantReport, reportYears } from '@/lib/grant-report';

export const maxDuration = 120;

// GET — which fiscal years have a grant report loaded, and when.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json({ years: await reportYears(createServerClient(), ctx.orgId) }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 }); }
}

// POST multipart {file, fiscal_year?} [?commit=1] — preview the grant report
// (totals, breakdowns, funders it records, leads it moves), or load it,
// replacing that fiscal year's rows.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const commit = req.nextUrl.searchParams.get('commit') === '1';
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/\.(xlsx?|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload the grant report as .xlsx, .xls or .csv' }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ error: 'File too large (max ~4 MB)' }, { status: 413 });
  const fyRaw = Number(form?.get('fiscal_year'));
  const fy = Number.isInteger(fyRaw) && fyRaw >= 2000 && fyRaw <= 2100 ? fyRaw : null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = createServerClient();
  try {
    if (!commit) return NextResponse.json({ preview: await previewGrantReport(db, ctx.orgId, buffer, file.name, fy) });
    return NextResponse.json({ ok: true, ...(await commitGrantReport(db, ctx.orgId, buffer, ctx.email, file.name, fy)), at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 });
  }
}
