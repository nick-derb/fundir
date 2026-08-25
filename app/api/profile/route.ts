import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

// Per-user profile captured by the /welcome onboarding flow. Writes go through
// the service-role client keyed by the authenticated session's user id (the
// profiles table is service-role-only under RLS).

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const db = createServerClient();
  const { data } = await db.from('profiles').select('*').eq('user_id', ctx.userId).single();
  return NextResponse.json({ profile: data ?? null });
}

const clean = (v: unknown, max: number) => (v == null ? '' : String(v)).trim().slice(0, max);

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    first?: string; last?: string; display?: string; role?: string;
    avatar?: string; focus?: string[]; onboarded?: boolean;
  };

  const focus = Array.isArray(body.focus)
    ? body.focus.map(f => clean(f, 40)).filter(Boolean).slice(0, 12)
    : [];
  // avatar is a client-resized data URL; cap to keep the row sane.
  const avatar = typeof body.avatar === 'string' && body.avatar.startsWith('data:image/')
    ? body.avatar.slice(0, 400_000)
    : '';

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id:      ctx.userId,
    first_name:   clean(body.first, 120),
    last_name:    clean(body.last, 120),
    display_name: clean(body.display, 160),
    role:         clean(body.role, 160),
    avatar_url:   avatar || null,
    focus,
    updated_at:   now,
  };
  if (body.onboarded) row.onboarded_at = now;

  const db = createServerClient();
  const { error } = await db.from('profiles').upsert(row, { onConflict: 'user_id' });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
