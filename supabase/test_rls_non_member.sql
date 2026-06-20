-- ════════════════════════════════════════════════════════════════════════════
-- RLS isolation test: an authenticated NON-MEMBER must read zero rows from
-- every tenant-scoped table.
--
-- How to run (Supabase Dashboard → SQL Editor):
--   1. Create a throwaway auth user via Auth → Users → Invite a user, or
--      pick an existing user that has NO row in user_organizations.
--   2. Copy that user's UUID into ":nonmember_uid" below.
--   3. Run this script. Every COUNT should report 0. If any reports > 0,
--      the policy on that table is missing or wrong.
--
-- This script does NOT modify data and is safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Setup: impersonate the non-member ──────────────────────────────────────
-- Replace this UUID with the throwaway non-member auth user.
\set nonmember_uid '00000000-0000-0000-0000-000000000000'

-- Switch to the `authenticated` role and set auth.uid() to the test user.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'nonmember_uid', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'nonmember_uid', 'role', 'authenticated')::text,
  true);

-- ── Assertions: each count must be 0 ───────────────────────────────────────
DO $$
DECLARE
  bad_table text;
  bad_count bigint;
  tables    text[] := ARRAY[
    'organizations',
    'user_organizations',
    'match_results',
    'pipeline_runs',
    'document_analyses',
    'access_allowlist',
    'access_requests',
    'grant_notes',
    'grant_tasks'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO bad_count;
    IF bad_count > 0 THEN
      bad_table := t;
      RAISE EXCEPTION 'RLS LEAK: % returned % rows for a non-member', bad_table, bad_count;
    END IF;
    RAISE NOTICE '✓ % returns 0 rows for non-member', t;
  END LOOP;
  RAISE NOTICE 'All tenant-scoped tables enforce member-only reads.';
END $$;

-- Reset role for the session.
RESET ROLE;
