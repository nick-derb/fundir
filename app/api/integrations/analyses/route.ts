import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET /api/integrations/analyses?orgCode=XXX           → list (no analysis JSON)
// GET /api/integrations/analyses?orgCode=XXX&id=UUID  → single with full analysis

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orgCode = searchParams.get('orgCode');
  const id      = searchParams.get('id');

  if (!orgCode) {
    return NextResponse.json({ error: 'orgCode required' }, { status: 400 });
  }

  const db = createServerClient();

  if (id) {
    const { data, error } = await db
      .from('document_analyses')
      .select('*')
      .eq('org_code', orgCode)
      .eq('id', id)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  }

  const { data, error } = await db
    .from('document_analyses')
    .select('id, file_name, provider, doc_type, summary, analyzed_at')
    .eq('org_code', orgCode)
    .order('analyzed_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
