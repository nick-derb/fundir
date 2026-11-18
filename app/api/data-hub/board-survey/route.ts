import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { previewSurvey, commitSurvey } from '@/lib/board-survey';
import { surveyTemplate } from '@/lib/import-templates';

export const maxDuration = 120;

// GET ?template=1 — a blank survey sheet in the shape the importer reads.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (req.nextUrl.searchParams.get('template') !== '1') return NextResponse.json({ error: 'Use ?template=1' }, { status: 400 });
  return new NextResponse(new Uint8Array(surveyTemplate()), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="Board connections survey template.xlsx"' } });
}

// POST multipart {file} [?commit=1] — preview the survey answers (who matched,
// which foundations are new to the network), or record them as connections
// and turn them into warm-introduction leads.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const commit = req.nextUrl.searchParams.get('commit') === '1';
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/\.(xlsx?|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload the survey results as .xlsx, .xls or .csv' }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ error: 'File too large (max ~4 MB)' }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const db = createServerClient();
  try {
    if (!commit) return NextResponse.json({ preview: await previewSurvey(db, ctx.orgId, buffer) });
    return NextResponse.json({ ok: true, ...(await commitSurvey(db, ctx.orgId, buffer)), at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 });
  }
}
