import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const { data } = await db
    .from('org_messages')
    .select('id, user_email, content, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(60);

  // Return chronological order (oldest first) for chat display
  return NextResponse.json((data ?? []).reverse());
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content || content.length > 2000) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from('org_messages')
    .insert({
      org_id:     ctx.orgId,
      user_id:    ctx.userId,
      user_email: ctx.email,
      content,
    })
    .select('id, user_email, content, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
