/**
 * Access-control provisioning.
 *
 * The policy is "email allow-list only": anyone can *authenticate* via
 * Google or Microsoft, but joining the CYC tenant requires the verified
 * email to be on `access_allowlist`. Everyone else lands at /access-denied
 * and their attempt is logged in `access_requests` for admin review.
 *
 * Called from /auth/callback right after exchangeCodeForSession, and from
 * middleware whenever an authenticated user has no membership.
 */

import { createServerClient } from '@/lib/supabase';

export interface ProvisionResult {
  status: 'provisioned' | 'already_member' | 'denied';
  orgId?:    string;
  orgCode?:  string;
  role?:     string;
}

/**
 * Service-role provisioning helper. Reads `access_allowlist`, creates a
 * `user_organizations` row when the email matches, and records an
 * `access_requests` row otherwise. Idempotent.
 */
export async function provisionMembership(
  userId: string,
  email:  string,
  provider: string | null = null,
): Promise<ProvisionResult> {
  const db = createServerClient(); // service role — bypasses RLS
  const lower = email.toLowerCase().trim();

  // 1. Already a member somewhere? Don't double-provision.
  const { data: existing } = await db
    .from('user_organizations')
    .select('org_id, role, organizations(id, org_code)')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const org = existing.organizations as unknown as { id: string; org_code: string } | null;
    return {
      status: 'already_member',
      orgId:  org?.id,
      orgCode: org?.org_code,
      role:   existing.role as string,
    };
  }

  // 2. On the allowlist? Create the membership.
  const { data: allow } = await db
    .from('access_allowlist')
    .select('org_id, role, organizations(id, org_code)')
    .eq('email', lower)
    .limit(1)
    .maybeSingle();

  if (allow) {
    const { error: insertErr } = await db
      .from('user_organizations')
      .insert({
        user_id: userId,
        org_id:  allow.org_id,
        role:    allow.role,
      });
    if (insertErr) {
      console.error('[access] provision insert failed', insertErr.message);
      return { status: 'denied' };
    }
    const org = allow.organizations as unknown as { id: string; org_code: string } | null;
    return {
      status: 'provisioned',
      orgId:  org?.id,
      orgCode: org?.org_code,
      role:   allow.role as string,
    };
  }

  // 3. Not on the allowlist. Record (or refresh) the request.
  await recordAccessRequest(userId, email, provider);
  return { status: 'denied' };
}

/**
 * Inserts a pending access_requests row, or updates the existing one to
 * touch its created_at. Safe to call multiple times. The schema's
 * partial-unique index guarantees only one pending row per email.
 */
export async function recordAccessRequest(
  userId: string | null,
  email:  string,
  provider: string | null = null,
): Promise<void> {
  const db = createServerClient();
  const lower = email.toLowerCase().trim();

  // Check if there's already a pending request for this email.
  const { data: existing } = await db
    .from('access_requests')
    .select('id')
    .eq('email', lower)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Touch user_id (in case we now know it) but leave created_at intact.
    if (userId) {
      await db.from('access_requests').update({ user_id: userId }).eq('id', existing.id);
    }
    return;
  }

  const { error } = await db.from('access_requests').insert({
    email:    lower,
    provider,
    user_id:  userId,
    status:   'pending',
  });

  if (error) {
    console.error('[access] recordAccessRequest failed', error.message);
  }
}

/**
 * Returns the most recent request status for an email (any status).
 * Used by /access-denied to show "submitted" vs. "pending review".
 */
export async function latestRequestStatus(email: string): Promise<{
  status: 'pending' | 'approved' | 'denied' | null;
  createdAt: string | null;
}> {
  const db = createServerClient();
  const { data } = await db
    .from('access_requests')
    .select('status, created_at')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    status:    (data?.status as 'pending' | 'approved' | 'denied' | undefined) ?? null,
    createdAt: data?.created_at ?? null,
  };
}

/**
 * Path-allow-list for post-login redirect. Defends against open-redirect:
 * anything off this list resolves to /dashboard.
 */
const INTERNAL_PATH_PREFIXES = [
  '/dashboard', '/discover', '/pipeline', '/settings', '/grant',
  '/financials', '/calendar', '/reports', '/org', '/foundations',
  '/admin',
];

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/dashboard';
  if (!next.startsWith('/')) return '/dashboard';      // protocol-relative or external
  if (next.startsWith('//')) return '/dashboard';      // //evil.com
  if (next.includes('\\'))  return '/dashboard';       // backslash tricks
  for (const prefix of INTERNAL_PATH_PREFIXES) {
    if (next === prefix || next.startsWith(prefix + '/') || next.startsWith(prefix + '?')) {
      return next;
    }
  }
  return '/dashboard';
}
