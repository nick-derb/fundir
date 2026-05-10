import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

// Active = last heartbeat within 5 minutes
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db  = createServerClient();
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();

  const { data } = await db
    .from('user_presence')
    .select('user_id, user_email, last_seen, current_path')
    .eq('org_id', ctx.orgId)
    .gte('last_seen', since)
    .order('last_seen', { ascending: false });

  return NextResponse.json(data ?? []);
}
