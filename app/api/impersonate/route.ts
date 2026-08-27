import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/admin-emails';

const COOKIE = 'impersonate_user';

/**
 * The REAL signed-in user, read straight from the session cookies — never the
 * impersonated identity. Admin checks must use this so an active impersonation
 * can't be used to escalate or to keep impersonating as a non-admin.
 */
async function realSessionUser() {
  const cookieStore = await cookies();
  const client = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await client.auth.getUser();
  return user;
}

// ── Start viewing as another user ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = await realSessionUser();
  if (!admin) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  if (!isAdminEmail(admin.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { userId } = await req.json().catch(() => ({ userId: null }));
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  }
  if (userId === admin.id) {
    return NextResponse.json({ error: 'cannot impersonate yourself' }, { status: 400 });
  }

  const db = createServerClient();
  const { data: target } = await db.auth.admin.getUserById(userId);
  if (!target?.user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  await db.from('impersonation_audit').insert({
    admin_user_id:  admin.id,
    admin_email:    admin.email,
    target_user_id: userId,
    target_email:   target.user.email,
    action:         'start',
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   60 * 60 * 8, // 8 hours, then it lapses on its own
  });
  return res;
}

// ── Stop viewing as another user ───────────────────────────────────────────
export async function DELETE() {
  const cookieStore = await cookies();
  const current = cookieStore.get(COOKIE)?.value;
  const admin = await realSessionUser();

  if (admin && current) {
    const db = createServerClient();
    const { data: target } = await db.auth.admin.getUserById(current);
    await db.from('impersonation_audit').insert({
      admin_user_id:  admin.id,
      admin_email:    admin.email,
      target_user_id: current,
      target_email:   target?.user?.email,
      action:         'stop',
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
