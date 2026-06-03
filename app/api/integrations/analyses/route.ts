import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

// GET /api/integrations/analyses         → list (no analysis JSON) for the authed user's org
// GET /api/integrations/analyses?id=UUID → single analysis (must belong to authed user's org)

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const id      = searchParams.get('id');
  const orgCode = ctx.orgCode;   // never from the URL

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
