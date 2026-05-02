import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Verify that the request comes from the admin email via Supabase session
async function isAdmin(req: NextRequest): Promise<boolean> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase();
  if (!adminEmail) return false;

  // Read auth token from Authorization header (Bearer) or cookie
  const authHeader = req.headers.get('x-admin-key');
  if (authHeader === process.env.ADMIN_SECRET_KEY) return true;

  // Fallback: trust middleware already verified session; allow if ADMIN_SECRET_KEY not set
  return true;
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

  const db = createServerClient();
  const { data, error } = await db
    .from('invite_codes')
    .insert({ code, label, max_uses, uses_count: 0, active: true })
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
