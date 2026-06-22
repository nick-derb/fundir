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

  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const isAdmin = isAdminEmail(user.email);
  const db = createServerClient(); // service role — bypasses RLS for lookups

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
    };
  }

  // Regular user: look up their org from user_organizations
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
  };
}
