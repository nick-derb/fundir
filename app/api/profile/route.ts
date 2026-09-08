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

/**
 * PATCH — partial update from the top-bar account menu. Unlike POST (which the
 * onboarding flow uses to write the whole profile), this only touches the keys
 * present in the body, so "change photo" can't wipe someone's name or focus.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  // An admin viewing as someone else must never rewrite that person's profile.
  if (ctx.impersonating) {
    return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, unknown> = { user_id: ctx.userId, updated_at: new Date().toISOString() };

  if ('avatar' in body) {
    const a = body.avatar;
    if (a === null || a === '') patch.avatar_url = null;
    else if (typeof a === 'string' && a.startsWith('data:image/')) patch.avatar_url = a.slice(0, 400_000);
    else return NextResponse.json({ error: 'avatar must be an image data URL or null' }, { status: 400 });
  }
  if (typeof body.first   === 'string') patch.first_name   = clean(body.first, 120);
  if (typeof body.last    === 'string') patch.last_name    = clean(body.last, 120);
  if (typeof body.display === 'string') patch.display_name = clean(body.display, 160);
  if (typeof body.role    === 'string') patch.role         = clean(body.role, 160);

  if (Object.keys(patch).length <= 2) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const db = createServerClient();
  const { error } = await db.from('profiles').upsert(patch, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avatar_url: patch.avatar_url ?? undefined });
}
