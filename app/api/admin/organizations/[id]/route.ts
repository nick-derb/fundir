import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const db = createServerClient();

  // Delete cascade: match_results, user_organizations, then the org itself
  await db.from('match_results').delete().eq('org_id', id);
  await db.from('user_organizations').delete().eq('org_id', id);
  await db.from('pipeline_runs').delete().eq('org_id', id);

  const { error } = await db.from('organizations').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
