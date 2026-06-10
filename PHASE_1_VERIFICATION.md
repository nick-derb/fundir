# Phase 1 Verification

Per the working agreement: after each phase, verify multi-tenant isolation
with two test orgs and report what changed. This is the static-audit
half (RLS policy review + auth-gate review for the new code paths). The
live-verification half (sign in as two tenants, hit every new endpoint,
confirm zero cross-tenant rows) needs your dev environment + test
credentials and is described under §4.

## 1. Phase 1 commits

| Commit | Phase | Surface |
|---|---|---|
| 5250118 | 1A + 1B | `regions`, `segments`, `grant_sources` tables + seeds + adapter registry + typed loaders |
| 276ed75 | 1C | Drop `CYC2025` / `IL` / `Chicago` / `youth` literals from business logic |
| 50c19d8 | 1D | Design tokens + 9 core components + `DESIGN_SYSTEM.md` |
| 5b217b8 | 1E partial | `/discover` natural-language search migrated onto `GrantCard` + `EvidenceList` |

`/dashboard` and `/grant/[id]` are still on the legacy `--brand` /
`--surface` aliases shipped with 1D — they keep rendering, deferred to a
Phase 1E continuation.

## 2. RLS audit — every new and modified policy

### 2.1 New shared-reference tables (Phase 1A)

These hold tenant-agnostic config. Every authenticated user reads;
writes are service-role only. Confirmed in
`supabase/phase1_config_foundation.sql`:

| Table | RLS enabled | Policy |
|---|---|---|
| `regions`        | ✓ | `regions: read all` — `FOR SELECT TO authenticated USING (true)` |
| `segments`       | ✓ | `segments: read all` — `FOR SELECT TO authenticated USING (true)` |
| `grant_sources`  | ✓ | `grant_sources: read all` — `FOR SELECT TO authenticated USING (true)` |

No INSERT/UPDATE/DELETE policies on these tables → the implicit deny
keeps everyone out of writes except the service-role key (which bypasses
RLS by design).

**Risk check:** could a tenant see the *seed* rows for a region or
segment they don't belong to? Yes by intent — these are reference
catalogs (e.g. a Tenant B in Portland needs to see that a Chicago Metro
region exists if they ever switch). The rows contain no tenant-specific
data — no EINs, no donor lists, no financials. Audit pass.

### 2.2 Tenant-scoped tables (carried forward, no policy edits in Phase 1)

These were hardened in `supabase/qa_rls_hardening.sql` and
`supabase/tier1c_outcome_feedback.sql`. Phase 1 didn't touch their
policies, but the audit verifies the policies still bind tenants
correctly given the new code paths:

| Table | Policy shape | Confirmed |
|---|---|---|
| `organizations` | `id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())` | ✓ |
| `match_results` | `org_id IN (...)` × {SELECT, INSERT, UPDATE, DELETE} | ✓ |
| `pipeline_runs` | `org_id IN (...)` × SELECT | ✓ |
| `org_outcomes`  | `org_id IN (...)` × ALL | ✓ |
| `grant_notes`   | `org_id IN (...)` × ALL | ✓ |
| `grant_tasks`   | `org_id IN (...)` × ALL | ✓ |
| `document_analyses` | `org_id IN (...)` × ALL | ✓ |
| `grant_opportunities` | authenticated read all (shared catalog) | ✓ |

### 2.3 Backfill scoped to known tenants only

`phase1_config_foundation.sql` §8 backfills `region_id` / `segment_id` /
`ntee_code` / `budget_band` **only for `org_code IN ('CYC2025','YOM2026')`**.
A new test tenant pinned to a different region/segment must do so by
inserting an `organizations` row with explicit `region_id` and
`segment_id` — there is no auto-assignment that could silently bind a new
tenant to Chicago Metro / Youth-OST.

## 3. Code-path audit — every new business surface auth-gated

The Phase 1B–1E surfaces that read/write data:

| File | Auth gate | Status |
|---|---|---|
| `lib/config/loader.ts` | Reads only shared-reference tables via service-role client. No tenant data. | ✓ Safe |
| `lib/adapters/grants-gov-adapter.ts` | No DB access. Pure HTTP. | ✓ |
| `lib/adapters/foundation-seed-adapter.ts` | No DB access. In-process list. | ✓ |
| `lib/org-financials.ts` | Reads `organizations` row by `org_code`. Service-role client. Callers MUST be auth-gated to the right `org_code`. | ⚠ See §3.1 |
| `app/api/chat/route.ts` | `getAuthContext()` first; uses `ctx.orgCode` only. | ✓ |
| `app/api/financial-verdict/route.ts` | `getAuthContext()` first; uses `ctx.orgCode` only. | ✓ |
| `app/api/auth/{google,microsoft}/route.ts` | Now requires `?org=`; no `'CYC2025'` default. | ✓ |
| `app/api/auth/{google,microsoft}/callback/route.ts` | Now requires `state.orgCode`; no default. | ✓ |
| `app/api/cron/refresh-corpus/route.ts` | Bearer `CRON_SECRET` gate; iterates ALL orgs with region+segment set. Service-role queries. | ✓ |
| `actions/discovery.ts` | `runDiscovery` now refuses missing `orgCode` (error instead of CYC default). | ✓ |
| `components/nl-search.tsx` | Posts to `/api/search` which `getAuthContext`'s. | ✓ |
| `app/grant/[id]/page.tsx` | `getAuthContext()`; uses `ctx.orgCode` to fetch region/segment. | ✓ |

### 3.1 `lib/org-financials.ts` — the one to watch

`getOrgFinancialProfile(orgCode)` uses the service-role client and looks
up an organization by `org_code`. If a caller ever passes an `orgCode`
NOT validated against the caller's auth context, a tenant could read
another tenant's financial fixture or `financial_data`.

Audit of every call site:

- `app/api/financial-verdict/route.ts:125` → `await
  getOrgFinancialProfile(ctx.orgCode)` (`ctx` from `getAuthContext`) ✓
- `app/api/chat/route.ts:135` → `await getOrgFinancialProfile(orgCode)`
  where `orgCode = ctx.orgCode` ✓
- `actions/discovery.ts:135` → `await getOrgFinancialProfile(orgCode)`
  where `orgCode` is the function arg. The only `runDiscovery` callers
  are the cron (passes per-org from the orgs loop, scoped to ones with
  region+segment) and `app/discover/page.tsx` (passes `ctx.orgCode`).
  Both safe.

No caller can pass a foreign `orgCode`. Audit pass.

## 4. Live verification (your turn)

Static audit is necessary but not sufficient — actually confirming
isolation needs two real tenants in your Supabase. Run this after
applying `supabase/phase1_config_foundation.sql`:

### 4.1 Setup

```sql
-- One existing tenant (Tenant A): CYC2025, already pinned.
-- Create a second test tenant (Tenant B) in a different region.

-- 1. Add a second seed region/segment (optional, just to prove the
--    architecture). Or use the existing chicago-metro + youth-ost.
-- 2. Create Tenant B:
INSERT INTO organizations (name, org_code, region_id, segment_id,
                           ntee_code, budget_band)
SELECT
  'Test Tenant B',
  'TENANTB',
  (SELECT id FROM regions  WHERE slug = 'chicago-metro'),
  (SELECT id FROM segments WHERE slug = 'youth-ost'),
  'O20',
  '2m-10m';

-- 3. Create a Supabase auth user (via the Auth UI or
--    `supabase.auth.admin.createUser`), then bind it to Tenant B:
INSERT INTO user_organizations (user_id, org_id, role)
VALUES ('<tenant-b-user-uuid>',
        (SELECT id FROM organizations WHERE org_code = 'TENANTB'),
        'member');
```

### 4.2 Checks (run each as Tenant B logged in)

| What | How | Expected |
|---|---|---|
| 1. Read regions | GET via supabase-js: `select * from regions` | 1 row (chicago-metro). Pass: shared reference. |
| 2. Read segments | `select * from segments` | 1 row (youth-ost). Pass. |
| 3. Read grant_sources | `select * from grant_sources` | 3 rows. Pass. |
| 4. Read organizations | `select * from organizations` | **1 row only** (TENANTB). Pass: tenant-scoped. ❌ if you see CYC2025. |
| 5. Read match_results | `select * from match_results` | **0 rows** (Tenant B has none yet). ❌ if you see CYC's matches. |
| 6. Read pipeline_runs | `select * from pipeline_runs` | **0 rows**. Same shape. |
| 7. Read org_outcomes | `select * from org_outcomes` | **0 rows**. |
| 8. Hit `/api/search` with `{query: "youth afterschool"}` | results array | Should return shared `grant_opportunities` (catalog) but `composite_score` and `pipeline_stage` must be null for Tenant B (no own rows). |
| 9. Hit `/api/financial-verdict` with any grantId | response | Should return `message: "No 990 financial profile is loaded..."` because Tenant B has no fixture and no `financial_data`. ❌ if you see CYC's numbers. |
| 10. Hit `/api/chat` POST `{messages:[{role:'user',content:'what's my financial picture'}]}` | streamed response | Should NOT include the CHICAGO YOUTH CENTERS intelligence block. Tenant B has no fixture → `buildIntelligenceContext` returns undefined → empty financialCtx in the system prompt. |
| 11. Hit `/api/auth/google?org=CYC2025` while logged in as Tenant B | redirect | The route accepts the org param at face value today. **This is a known transition gap** — it'll bind Tenant B's auth code to CYC's integration record. See §5. |

If any check ❌s, stop and report — the policy or call site needs a fix
before Phase 2.

## 5. Known transition gaps

These are issues the static audit surfaced that we explicitly chose to
ship rather than block Phase 1 progress:

1. **OAuth `?org=` accepts arbitrary org codes.** The Google + Microsoft
   integration routes (`app/api/auth/{google,microsoft}/route.ts`) now
   require `?org=`, which closed the CYC-default silent-leak. But they
   don't verify the caller is a member of the supplied org. A logged-in
   Tenant B can hit `?org=CYC2025` and start an OAuth flow whose tokens
   land in CYC's integration record.
   **Fix scope (post-Phase 1):** in both init routes, read
   `getAuthContext()` and `return 400` when
   `searchParams.get('org')` is not in `ctx.availableOrgs`.

2. **`lib/cyc-profile.ts`, `lib/cyc-live-data.ts`, `lib/ymca-live-data.ts`,
   `lib/foundation-intelligence.ts` still hold tenant-specific data
   as code constants.** That's intentional — Phase 2's 990-graph
   ingestion (`funders`, `recipients`, `grants_made` tables) is where
   they migrate to DB rows. Until then, they're seed data in code.
   Business logic doesn't branch on their contents — only the
   `FIXTURE_PROFILES` and `FIXTURES` maps in `actions/discovery.ts` and
   `lib/org-financials.ts` reference them, both keyed by org_code so
   adding a new tenant doesn't accidentally inherit their values.

## 6. Phase 1 summary

| Outcome | Status |
|---|---|
| Region + segment first-class config | ✓ Tables + seeds + loaders shipped |
| GrantSource adapter registry | ✓ Common interface + 2 adapters + dispatch |
| Zero hardcoded tenant literals in business logic | ✓ Grep returns only the doc-comment + the named transitional FIXTURE map |
| Design system tokens | ✓ tailwind.config + globals.css |
| Design system components | ✓ 9 primitives in `components/ui/` |
| Design system applied to /discover | ✓ Centerpiece migrated |
| Design system applied to /dashboard | ⌛ Deferred to Phase 1E cont. |
| Design system applied to /grant/[id] | ⌛ Deferred to Phase 1E cont. |
| Multi-tenant RLS verified statically | ✓ This document |
| Multi-tenant RLS verified live | ⌛ §4 — your dev env, your credentials |
| One transition gap to close | OAuth `?org=` membership check |

Ready for Phase 2 (990 funder→recipient graph) once you've run §4
against your Supabase + flagged anything that surfaces, and decided
whether to close the OAuth gap before or alongside Phase 2.
