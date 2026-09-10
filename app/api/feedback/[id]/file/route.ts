import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

// GET ?path=… — redirect to a short-lived signed download URL for one attachment.
// Admins of the org and the person who filed the item may fetch it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  const path = req.nextUrl.searchParams.get('path') ?? '';
  const db = createServerClient();
  const { data: item } = await db.from('feedback').select('user_id, attachments').eq('id', id).eq('org_id', ctx.orgId).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!ctx.isAdmin && item.user_id !== ctx.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const att = (item.attachments as Array<{ path: string; name: string }>).find(a => a.path === path);
  if (!att) return NextResponse.json({ error: 'No such attachment' }, { status: 404 });
  const { data, error } = await db.storage.from('feedback').createSignedUrl(att.path, 300, { download: att.name });
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not sign' }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
