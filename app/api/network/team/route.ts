import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';

export const maxDuration = 20;

// GET — the people who can own a lead: members of this organization.
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const db = createServerClient();
  const { data: members } = await db.from('user_organizations').select('user_id, role').eq('org_id', ctx.orgId);
  const ids = (members ?? []).map(m => m.user_id as string);
  if (!ids.length) return NextResponse.json({ team: [] });
  const [{ data: profiles }, users] = await Promise.all([
    db.from('profiles').select('user_id, display_name, first_name, last_name').in('user_id', ids),
    db.auth.admin.listUsers({ perPage: 500 }).then(r => r.data?.users ?? []).catch(() => []),
  ]);
  const prof = new Map((profiles ?? []).map(p => [p.user_id as string, p]));
  const team = ids.map(id => {
    const u = users.find(x => x.id === id); const p = prof.get(id);
    const name = (p?.display_name as string) || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || (u?.user_metadata?.full_name as string | undefined) || (u?.email?.split('@')[0] ?? 'Member');
    return { id, email: u?.email ?? null, name, role: (members ?? []).find(m => m.user_id === id)?.role ?? 'member' };
  }).filter(t => t.email).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ team });
}
