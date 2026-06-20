-- ════════════════════════════════════════════════════════════════════════════
-- Rename the seeded CYC organization from the old code to the new one.
--
-- Run this BEFORE add_access_control.sql (which seeds the allowlist
-- against the new code).
--
-- Safe to re-run: short-circuits if the rename has already happened.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  old_code text := 'CYC' || '2025';   -- split so the perl-sweep ignores it
  new_code text := 'CYC2026';
BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE org_code = old_code)
     AND NOT EXISTS (SELECT 1 FROM organizations WHERE org_code = new_code) THEN
    UPDATE organizations SET org_code = new_code WHERE org_code = old_code;
    RAISE NOTICE 'Renamed % → %', old_code, new_code;
  ELSIF EXISTS (SELECT 1 FROM organizations WHERE org_code = new_code) THEN
    RAISE NOTICE '% already exists — no rename needed', new_code;
  ELSE
    RAISE NOTICE 'No % row found — nothing to do', old_code;
  END IF;
END $$;
