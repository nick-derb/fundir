-- ════════════════════════════════════════════════════════════════════════════
-- Add Piotr Lewicki as a CYC2026 admin on the access allowlist.
--
-- Once this runs, Piotr can sign in via Google/Microsoft with his
-- chicagoyouthcenters.org address and the OAuth callback will provision
-- a user_organizations row with role='admin' automatically.
--
-- Platform-level admin permissions (access to /admin/*, multi-org
-- switcher, mutating the allowlist) come from the ADMIN_EMAIL env var,
-- which is updated separately in Vercel — see AUTH_SETUP.md.
--
-- Safe to re-run: ON CONFLICT (email, org_id) DO NOTHING.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO access_allowlist (email, org_id, role, notes, added_by)
SELECT
  lower('piotr.lewicki@chicagoyouthcenters.org'),
  o.id,
  'admin',
  'CYC primary contact',
  'migration'
FROM organizations o
WHERE o.org_code IN ('CYC2026', 'CYC2025')
ON CONFLICT (email, org_id) DO NOTHING;

-- If Piotr's auth.users row already exists (because he was created from
-- the Supabase Dashboard before this migration ran), provision his
-- membership now so he doesn't have to sign in once to trigger it.
INSERT INTO user_organizations (user_id, org_id, role)
SELECT
  u.id,
  o.id,
  'admin'
FROM auth.users u
CROSS JOIN organizations o
WHERE lower(u.email) = 'piotr.lewicki@chicagoyouthcenters.org'
  AND o.org_code IN ('CYC2026', 'CYC2025')
ON CONFLICT (user_id, org_id) DO NOTHING;
