import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/admin-emails';

export interface AuthContext {
  userId: string;
  email: string;
  orgId: string;
  orgCode: string;
  orgName: string;
  role: string;
  isAdmin: boolean;
  availableOrgs: Array<{ id: string; name: string; org_code: string }>;
  /** The effective person's own profile, for greetings + the corner avatar. */
  firstName: string;
  displayName: string;
  avatarUrl: string | null;
  /** True when a real admin is viewing the app as someone else. */
  impersonating: boolean;
  /** The real signed-in admin behind an impersonation session, else null. */
  realAdmin: { id: string; email: string } | null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();

  // Use SSR client (reads session from cookies, not service role)
  const sessionClient = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    },
  );

  const { data: { user: sessionUser } } = await sessionClient.auth.getUser();
  if (!sessionUser) return null;

  const db = createServerClient(); // service role — bypasses RLS for lookups
  const realIsAdmin = isAdminEmail(sessionUser.email);

  // ── View-as impersonation (admin-only) ──────────────────────────────────
  // A real admin can adopt another user's identity so the entire app renders
  // exactly as that person would see it. The cookie is only ever honored for
  // a real admin; a non-admin can never impersonate.
  let user = sessionUser;
  let impersonating = false;
  let realAdmin: { id: string; email: string } | null = null;
  const imp = cookieStore.get('impersonate_user')?.value;
  if (realIsAdmin && imp && imp !== sessionUser.id) {
    const { data: target } = await db.auth.admin.getUserById(imp);
    if (target?.user) {
      user = target.user;
      impersonating = true;
      realAdmin = { id: sessionUser.id, email: sessionUser.email! };
    }
  }
  // While impersonating, the admin sees the target's (non-admin) view.
  const isAdmin = impersonating ? false : realIsAdmin;

  // The effective person's profile (from onboarding), OAuth metadata as fallback.
  const { data: profile } = await db
    .from('profiles')
    .select('first_name, display_name, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  const meta = (user.user_metadata ?? {}) as {
    name?: string; full_name?: string; avatar_url?: string; picture?: string;
  };
  const metaName = meta.full_name || meta.name || '';
  const firstName = profile?.first_name || metaName.split(' ')[0] || '';
  const displayName = profile?.display_name || metaName || (user.email?.split('@')[0] ?? '');
  const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || null;

  if (isAdmin) {
    const { data: allOrgs } = await db
      .from('organizations')
      .select('id, name, org_code')
      .order('name');

    const orgs = allOrgs ?? [];

    // Admin can override which org they're viewing via cookie
    const adminOrgCode = cookieStore.get('admin_org')?.value;
    let selectedOrg = orgs.find(o => o.org_code === adminOrgCode) ?? null;

    if (!selectedOrg) {
      // Default to admin's own org membership, else first org
      const { data: membership } = await db
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();
      selectedOrg = (membership ? orgs.find(o => o.id === membership.org_id) : null) ?? orgs[0] ?? null;
    }

    if (!selectedOrg) return null;

    return {
      userId: user.id,
      email: user.email!,
      orgId: selectedOrg.id,
      orgCode: selectedOrg.org_code,
      orgName: selectedOrg.name,
      role: 'admin',
      isAdmin: true,
      availableOrgs: orgs,
      firstName, displayName, avatarUrl,
      impersonating: false,
      realAdmin: null,
    };
  }

  // Regular user (or an impersonated target): look up their single org.
  const { data: membership } = await db
    .from('user_organizations')
    .select('org_id, role, organizations(id, name, org_code)')
    .eq('user_id', user.id)
    .single();

  if (!membership) return null;

  const org = membership.organizations as unknown as { id: string; name: string; org_code: string };

  return {
    userId: user.id,
    email: user.email!,
    orgId: org.id,
    orgCode: org.org_code,
    orgName: org.name,
    role: membership.role as string,
    isAdmin: false,
    availableOrgs: [],
    firstName, displayName, avatarUrl,
    impersonating,
    realAdmin,
  };
}
