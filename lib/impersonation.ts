import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/admin-emails';

/**
 * Lightweight check for the global "Viewing as …" banner: returns the target's
 * name only when a REAL admin currently has an impersonation cookie set. Kept
 * separate from getAuthContext so the root layout can render the banner on any
 * page without running full org resolution.
 */
export async function getImpersonation(): Promise<{ name: string; email: string } | null> {
  const cookieStore = await cookies();
  const target = cookieStore.get('impersonate_user')?.value;
  if (!target) return null;

  const sessionClient = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;

  const db = createServerClient();
  const { data: t } = await db.auth.admin.getUserById(target);
  if (!t?.user) return null;

  const { data: profile } = await db
    .from('profiles')
    .select('display_name, first_name')
    .eq('user_id', target)
    .maybeSingle();

  const name = profile?.display_name || profile?.first_name || t.user.email || 'user';
  return { name, email: t.user.email ?? '' };
}
