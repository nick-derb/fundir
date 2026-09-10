import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

// PATCH — admin triage: status and a note the reporter can see.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!ctx.isAdmin || ctx.impersonating) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.status === 'string') {
    if (!['new', 'triaged', 'in_progress', 'done', 'wont_fix'].includes(b.status)) return NextResponse.json({ error: 'Bad status' }, { status: 400 });
    patch.status = b.status;
  }
  if ('admin_note' in b) patch.admin_note = String(b.admin_note ?? '').trim().slice(0, 2000) || null;
  const db = createServerClient();
  const { error } = await db.from('feedback').update(patch).eq('id', id).eq('org_id', ctx.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
