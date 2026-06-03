import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

const VALID_STAGES = ['discovered', 'reviewing', 'preparing', 'drafting', 'submitted', 'awarded', 'rejected'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { stage } = body;

  if (!VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  }

  const db = createServerClient();
  // Update is scoped to (id, ctx.orgId). The WHERE clause prevents an
  // attacker who knows another tenant's match id from modifying it.
  const { data, error } = await db
    .from('match_results')
    .update({ pipeline_stage: stage })
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Match not found in your organization' },
      { status: 404 },
    );
  }
  return NextResponse.json(data);
}
