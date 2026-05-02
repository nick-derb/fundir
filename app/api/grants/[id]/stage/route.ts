import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const VALID_STAGES = ['discovered', 'reviewing', 'preparing', 'drafting', 'submitted', 'awarded', 'rejected'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { stage } = body;

  if (!VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from('match_results')
    .update({ pipeline_stage: stage })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
