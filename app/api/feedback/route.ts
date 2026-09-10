import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 20;
const clean = (v: unknown, max: number) => (v == null ? '' : String(v)).trim().slice(0, max);

// GET — the caller's own feedback; admins see the whole org queue.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const db = createServerClient();
  let q = db.from('feedback').select('id, kind, page, title, details, expected, record_ref, attachments, status, admin_note, user_email, user_name, created_at, updated_at').eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(300);
  if (!ctx.isAdmin) q = q.eq('user_id', ctx.userId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], admin: ctx.isAdmin });
}

// POST — file a bug, a data-correction request, or an idea.
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const kind = clean(b.kind, 10);
  if (!['bug', 'data', 'idea'].includes(kind)) return NextResponse.json({ error: 'kind must be bug, data or idea' }, { status: 400 });
  const title = clean(b.title, 200);
  if (!title) return NextResponse.json({ error: 'A one-line summary is required' }, { status: 400 });
  const rr = (b.record_ref ?? null) as Record<string, unknown> | null;
  const record_ref = kind === 'data' && rr ? { entity: clean(rr.entity, 40), name: clean(rr.name, 200), field: clean(rr.field, 80), current: clean(rr.current, 500), proposed: clean(rr.proposed, 500), source: clean(rr.source, 300) } : null;
  if (kind === 'data' && (!record_ref?.name || !record_ref?.proposed)) return NextResponse.json({ error: 'A data request needs the record name and the correct value' }, { status: 400 });
  const client = b.client && typeof b.client === 'object' ? { ua: clean((b.client as Record<string, unknown>).ua, 300), viewport: clean((b.client as Record<string, unknown>).viewport, 40) } : null;
  // Attachments were uploaded by the browser under this org's prefix; keep only paths that prove it.
  const attachments = (Array.isArray(b.attachments) ? b.attachments : []).flatMap(a => {
    const x = a as Record<string, unknown>; const path = clean(x.path, 400);
    return path.startsWith(`${ctx.orgId}/`) ? [{ path, name: clean(x.name, 160) || 'file', size: Number(x.size) || 0, type: clean(x.type, 100) || null }] : [];
  }).slice(0, 10);
  const db = createServerClient();
  const { data, error } = await db.from('feedback').insert({
    org_id: ctx.orgId, user_id: ctx.userId, user_email: ctx.email, user_name: ctx.displayName || null,
    kind, page: clean(b.page, 300) || null, title, details: clean(b.details, 4000) || null, expected: kind === 'bug' ? clean(b.expected, 2000) || null : null,
    record_ref, client, attachments,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
