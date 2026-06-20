-- ════════════════════════════════════════════════════════════════════════════
-- Access control: email allow-list + pending requests.
--
-- Policy (set by tenant admin): authentication via Google/Microsoft is
-- open to anyone, but joining the CYC tenant requires the email to be on
-- access_allowlist. Unrecognized users are routed to /access-denied and
-- their attempt is captured in access_requests for admin review.
--
-- Safe to run multiple times. CREATE TABLE IF NOT EXISTS + idempotent
-- inserts + DROP/CREATE policies.
-- ════════════════════════════════════════════════════════════════════════════

-- ── access_allowlist ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_allowlist (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email     text        NOT NULL,
  org_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'member'
                        CHECK (role IN ('admin','member','viewer')),
  notes     text,
  added_by  text,
  added_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, org_id)
);

CREATE INDEX IF NOT EXISTS access_allowlist_email_idx
  ON access_allowlist (lower(email));

-- ── access_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  provider    text,                            -- 'google' | 'azure' | etc.
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','denied')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  notes       text
);

CREATE INDEX IF NOT EXISTS access_requests_status_idx
  ON access_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS access_requests_email_idx
  ON access_requests (lower(email));

-- A given email can only have one pending request at a time. (We allow
-- multiple approved/denied rows for audit history.)
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending_per_email
  ON access_requests (lower(email)) WHERE status = 'pending';

-- ── RLS — service-role only ────────────────────────────────────────────
-- The OAuth callback runs server-side with the service-role key (bypasses
-- RLS) for provisioning. End-user clients (anon / authenticated) have NO
-- policy at all, which means RLS denies every read and write.
ALTER TABLE access_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests  ENABLE ROW LEVEL SECURITY;

-- Drop any prior permissive policies (idempotent re-run safety).
DROP POLICY IF EXISTS "allowlist anyone"    ON access_allowlist;
DROP POLICY IF EXISTS "requests anyone"     ON access_requests;
DROP POLICY IF EXISTS "allowlist auth read" ON access_allowlist;
DROP POLICY IF EXISTS "requests auth read"  ON access_requests;
-- (no replacements — service role bypasses RLS for the admin UI)

-- ── Bootstrap seed: the tenant admin's known emails ────────────────────
-- Without this, no one can sign in at all (chicken-and-egg). The admin
-- can manage the rest of the allowlist via the /admin/access screen.
INSERT INTO access_allowlist (email, org_id, role, notes, added_by)
SELECT
  lower(seed.email),
  o.id,
  'admin',
  'bootstrap seed',
  'migration'
FROM (VALUES
  ('6nicholas.derbis@benet.org'),
  ('nickderbis@gmail.com')
) AS seed(email)
CROSS JOIN organizations o
WHERE o.org_code = 'CYC2026'
ON CONFLICT (email, org_id) DO NOTHING;
