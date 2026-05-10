import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { currentPath?: string };
  const db = createServerClient();

  await db.from('user_presence').upsert({
    user_id:      ctx.userId,
    org_id:       ctx.orgId,
    user_email:   ctx.email,
    last_seen:    new Date().toISOString(),
    current_path: body.currentPath ?? null,
  }, { onConflict: 'user_id' });

  return NextResponse.json({ ok: true });
}
