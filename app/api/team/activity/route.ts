import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const { data } = await db
    .from('org_activity')
    .select('id, user_email, action, entity_type, entity_id, entity_title, metadata, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(40);

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    action: string;
    entityType?: string;
    entityId?: string;
    entityTitle?: string;
    metadata?: Record<string, unknown>;
  } | null;

  if (!body?.action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  const db = createServerClient();
  await db.from('org_activity').insert({
    org_id:       ctx.orgId,
    user_id:      ctx.userId,
    user_email:   ctx.email,
    action:       body.action,
    entity_type:  body.entityType ?? null,
    entity_id:    body.entityId ?? null,
    entity_title: body.entityTitle ?? null,
    metadata:     body.metadata ?? {},
  });

  return NextResponse.json({ ok: true });
}
