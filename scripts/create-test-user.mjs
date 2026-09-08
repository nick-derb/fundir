// Provision a TEST CYC user so you can walk the app exactly as a Chicago Youth
// Centers staff member would — first-run profile, Data Hub uploads, calendar, etc.
//
// It creates a Supabase auth user (email + password, pre-confirmed so no inbox is
// needed) and adds them to the CYC org as a non-admin "member". Because the email
// is NOT in ADMIN_EMAIL, they get the real tenant-member view (no admin switcher,
// no /admin, no impersonation) — the true CYC perspective.
//
//   node scripts/create-test-user.mjs demo@chicagoyouthcenters.org
//   node scripts/create-test-user.mjs demo@chicagoyouthcenters.org 'MyPassw0rd!'
//
// Log in at /login with the email + password (use a private/incognito window so
// it doesn't collide with your admin session). To remove it later, delete the
// user in Supabase → Authentication; the membership row cascades.

import { loadEnv, getSupabase, getOrgId } from './_import-lib.mjs';

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + '!7';
}

async function main() {
  loadEnv();
  const email = (process.argv[2] || '').trim();
  if (!email || !email.includes('@')) {
    throw new Error('Usage: node scripts/create-test-user.mjs <email> [password]');
  }
  const password = process.argv[3] || randomPassword();

  const db = getSupabase();
  const orgId = await getOrgId(db, 'CYC2026'); // Chicago Youth Centers

  // Create (or find) the auth user, pre-confirmed so password login works now.
  let userId;
  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'CYC Test User' },
  });
  if (cErr) {
    // Already exists → find them so the script is idempotent.
    if (/already been registered|already exists/i.test(cErr.message)) {
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) throw new Error(`User ${email} exists but could not be located.`);
      userId = found.id;
      // Reset the password so you always have working credentials.
      await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
      console.log(`Existing user found — password reset.`);
    } else {
      throw new Error(`createUser failed: ${cErr.message}`);
    }
  } else {
    userId = created.user.id;
    console.log(`Created auth user ${email}`);
  }

  // Link to the CYC org as a non-admin member (idempotent).
  const { error: mErr } = await db
    .from('user_organizations')
    .upsert({ user_id: userId, org_id: orgId, role: 'member' }, { onConflict: 'user_id,org_id' });
  if (mErr) throw new Error(`membership upsert failed: ${mErr.message}`);

  console.log('\n✓ Test CYC user ready\n');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Org:      Chicago Youth Centers (CYC2026), role: member`);
  console.log('\nLog in at /login in a private/incognito window. Note: OneDrive');
  console.log('uploads + calendar need the org\'s Microsoft 365 connected in Settings.');
}

main().catch(e => { console.error('\nFAILED:', e instanceof Error ? e.message : e); process.exit(1); });
