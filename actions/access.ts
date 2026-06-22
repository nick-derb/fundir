'use server';

/**
 * Admin actions for the access-control flow.
 *
 * All actions verify the caller is on the configured ADMIN_EMAIL list
 * (comma-separated; see lib/admin-emails.ts). Errors throw, so Next.js
 * routes them to the error boundary — these forms are admin-only and
 * errors are exceptional.
 */

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase';
import { isAdminEmail, adminEmailCount } from '@/lib/admin-emails';

async function requireAdmin(): Promise<{ email: string }> {
  if (adminEmailCount() === 0) throw new Error('ADMIN_EMAIL is not configured');

  const cookieStore = await cookies();
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');
  if (!isAdminEmail(user.email)) throw new Error('Not authorized');
  return { email: user.email };
}

// ── Allowlist actions ─────────────────────────────────────────────────────

export async function addAllowlistEntry(formData: FormData): Promise<void> {
  const { email: adminEmail } = await requireAdmin();
  const email   = String(formData.get('email') ?? '').trim().toLowerCase();
  const orgCode = String(formData.get('org_code') ?? '').trim();
  const role    = String(formData.get('role') ?? 'member').trim();

  if (!email || !email.includes('@')) throw new Error('Valid email required');
  if (!orgCode) throw new Error('Org code required');
  if (!['admin', 'member', 'viewer'].includes(role)) throw new Error('Invalid role');

  const db = createServerClient();

  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('org_code', orgCode)
    .maybeSingle();
  if (!org) throw new Error(`Org code ${orgCode} not found`);

  const { error } = await db
    .from('access_allowlist')
    .insert({
      email,
      org_id:   org.id,
      role,
      added_by: adminEmail,
    });

  if (error) {
    if (error.code === '23505') {
      // Already on the list for this org — silently ignore.
      revalidatePath('/admin/access');
      return;
    }
    throw new Error(error.message);
  }

  revalidatePath('/admin/access');
}

export async function removeAllowlistEntry(id: string): Promise<void> {
  await requireAdmin();
  const db = createServerClient();
  const { error } = await db.from('access_allowlist').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/access');
}

// ── Request actions ───────────────────────────────────────────────────────

export async function approveAccessRequest(formData: FormData): Promise<void> {
  const { email: adminEmail } = await requireAdmin();
  const requestId = String(formData.get('id') ?? '');
  const orgCode   = String(formData.get('org_code') ?? '').trim();
  const role      = String(formData.get('role') ?? 'member').trim();
  if (!requestId) throw new Error('Missing request id');
  if (!orgCode)   throw new Error('Org code required');

  const db = createServerClient();

  const { data: req } = await db
    .from('access_requests')
    .select('id, email, user_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) throw new Error('Request not found');
  if (req.status !== 'pending') throw new Error('Request is not pending');

  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('org_code', orgCode)
    .maybeSingle();
  if (!org) throw new Error(`Org code ${orgCode} not found`);

  // 1. Add to allowlist (idempotent on (email, org_id)).
  await db
    .from('access_allowlist')
    .upsert(
      { email: req.email, org_id: org.id, role, added_by: adminEmail, notes: `approved from request ${requestId}` },
      { onConflict: 'email,org_id' },
    );

  // 2. If the user already authenticated, provision membership immediately.
  if (req.user_id) {
    await db
      .from('user_organizations')
      .upsert(
        { user_id: req.user_id, org_id: org.id, role },
        { onConflict: 'user_id,org_id' },
      );
  }

  // 3. Mark request approved.
  await db
    .from('access_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: adminEmail })
    .eq('id', requestId);

  revalidatePath('/admin/access');
}

export async function denyAccessRequest(formData: FormData): Promise<void> {
  const { email: adminEmail } = await requireAdmin();
  const requestId = String(formData.get('id') ?? '');
  if (!requestId) throw new Error('Missing request id');

  const db = createServerClient();
  const { error } = await db
    .from('access_requests')
    .update({ status: 'denied', reviewed_at: new Date().toISOString(), reviewed_by: adminEmail })
    .eq('id', requestId);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/access');
}
