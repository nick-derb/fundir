import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

// POST {name, type, size} — mint a signed upload URL into the private
// 'feedback' bucket. The browser uploads straight to storage, so large files
// never pass through a serverless function.
const MAX = 50 * 1024 * 1024;
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (ctx.impersonating) return NextResponse.json({ error: 'Read-only while viewing as another user' }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { name?: unknown; type?: unknown; size?: unknown };
  const name = String(b.name ?? '').replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file';
  const size = Number(b.size) || 0;
  if (size > MAX) return NextResponse.json({ error: 'Files up to 50 MB' }, { status: 400 });
  const path = `${ctx.orgId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${name}`;
  const db = createServerClient();
  const { data, error } = await db.storage.from('feedback').createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not prepare upload' }, { status: 500 });
  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
}
