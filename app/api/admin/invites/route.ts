import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';

// Verify the caller is the configured admin. Primary check is the Supabase
// session (via getAuthContext().isAdmin). The x-admin-key header is a
// secondary path for server-to-server tooling — ONLY accepted if
// ADMIN_SECRET_KEY is set in the environment. If neither check passes,
// the request is rejected. This route previously had a `return true`
// fallback that meant ADMIN_SECRET_KEY being unset opened the endpoint
// to anyone — that bug is fixed here.
async function isAdmin(req: NextRequest): Promise<boolean> {
  // Path 1: server-to-server with an explicit shared key.
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (adminSecret && req.headers.get('x-admin-key') === adminSecret) return true;

  // Path 2: authenticated session whose email matches ADMIN_EMAIL.
  const ctx = await getAuthContext();
  return !!ctx?.isAdmin;
}

export async function GET(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = createServerClient();
  const { data, error } = await db
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const code = (body.code ?? '').trim().toUpperCase();
  const label = (body.label ?? '').trim() || null;
  const max_uses = Number(body.max_uses) || 10;

  if (!code || code.length < 4) {
    return NextResponse.json({ error: 'Code must be at least 4 characters.' }, { status: 400 });
  }

  const expires_at = (body.expires_at ?? '').trim() || null;
  const org_hint   = (body.org_hint   ?? '').trim() || null;

  const db = createServerClient();
  const { data, error } = await db
    .from('invite_codes')
    .insert({ code, label, max_uses, uses_count: 0, active: true, expires_at, org_hint })
    .select()
    .single();

  if (error) {
    const msg = error.message.includes('unique') ? 'That code already exists.' : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const { id, active } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createServerClient();
  const { data, error } = await db
    .from('invite_codes')
    .update({ active: !!active })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  if (!await isAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createServerClient();
  const { error } = await db.from('invite_codes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
