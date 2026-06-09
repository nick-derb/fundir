# PHASE 0 — Audit & Architecture Proposal

Read order: Section 1 grounds you in what's actually in the codebase today. Sections 2-5
specify the shape of what we'll build. Section 6 sequences it and surfaces the choices I
need you to make before I write code.

---

## Section 1 — Current-state audit

### Schema as it actually exists

Pieced together from the migrations in [supabase/](supabase/) (no consolidated schema dump
exists; migrations have been applied incrementally and some live only in SQL files).

| Table | Key columns | Notes |
|---|---|---|
| `organizations` | `id`, `org_code` (unique), `name`, `ein`, `financial_data jsonb`, `financial_year`, `financial_fetched_at`, `profile_data jsonb`, `profile_updated_at`, `profile_updated_by` | The org's NTEE, budget band, geographic service area, mission, programs, key funders, grant history all live inside `profile_data` as untyped JSON. EIN is a top-level column. **No region_id, no segment_id.** |
| `user_organizations` | `user_id` (auth.users), `org_id`, `role` | The tenancy primitive. RLS uses this everywhere. |
| `grant_opportunities` | `id`, `source` (text), `source_id`, `opportunity_number`, `title`, `agency_code`, `agency_name`, `open_date`, `close_date`, `status`, `aln_codes text[]`, `synopsis`, `full_text`, `extracted_fields jsonb`, `extraction_confidence`, `content_hash`, `embedding vector(1536)` | Single normalized table for **federal** opportunities only. `source` is a free-text string, not a foreign key. No funder_id. Foundations are NOT in this table today — they live in-process in [lib/foundation-intelligence.ts](lib/foundation-intelligence.ts). |
| `match_results` | `id`, `grant_id`, `org_id`, `composite_score`, `semantic_similarity`, `eligibility_score`, `financial_score`, `historical_score`, `strategic_score`, `pipeline_stage`, `eligibility_flags`, `financial_signals jsonb`, `recommendation`, `matched_at` | Unique on `(grant_id, org_id)` after the multi-tenancy fix. RLS via `user_organizations`. |
| `pipeline_runs` | `id`, `run_id`, `org_id`, `started_at`, `completed_at`, `grants_discovered`, counts, `duration_seconds`, `errors` | RLS via org membership. |
| `grant_notes`, `grant_tasks`, `document_analyses` | each has `org_id` | RLS hardened in [supabase/qa_rls_hardening.sql](supabase/qa_rls_hardening.sql). |
| `org_outcomes` | `org_id`, `match_id`, `agency_code`, `aln_code`, `outcome` ('awarded'\|'rejected'), `decided_at` | Populated by trigger when `match_results.pipeline_stage` flips to awarded/rejected. Tier 1C. |
| pgvector | `grant_opportunities.embedding` (HNSW, cosine), RPCs `nearest_grants`, `nearest_grants_for_org` | [supabase/tier1b_corpus_search.sql](supabase/tier1b_corpus_search.sql). |

### The composite engine — actually 5-factor, not 4

`computeMatchScore` lives in [lib/matching.ts:244-312](lib/matching.ts#L244). **Heads up: the brief calls it 4-factor, but the production code has been 5-factor since financial_990 was added.** Weights:

| Factor | Weight | Where it's computed |
|---|---|---|
| semantic | 40% | Per-program max-cosine over `ProgramEmbeddingRef[]` ([lib/matching.ts:256-269](lib/matching.ts#L256)). Surfaces `matchedProgram` on the breakdown. |
| eligibility | 22% | `computeEligibility` ([lib/matching.ts:99-162](lib/matching.ts#L99)). Entity type (35% sub-weight) + geography (30%) + target population (20%) + compliance/GATA (15%). |
| financial_990 | 20% | `screen990Against` ([lib/990-screener.ts](lib/990-screener.ts)) — reverse-screens grant requirements (cost share, audit, min budget) against the org's 990. |
| strategic | 12% | `computeStrategicFit` ([lib/matching.ts:166-208](lib/matching.ts#L166)). Program-area overlap (60%) + award-size fit (30%) + compliance/ops (10%). |
| historical | 6% | Hand-coded `historicalWinRates` map per profile, merged at runtime with `buildHistoricalWinRates(observedOutcomes)` from `org_outcomes` ([lib/win-rate-bayes.ts](lib/win-rate-bayes.ts), Tier 1C). |

A pre-score hard-exclusion gate ([lib/matching.ts:68-95](lib/matching.ts#L68)) zeros out international/defense agencies and keyword-blacklisted titles. A post-score `MIN_STORE_SCORE = 32` drops the long tail.

**Inputs:** `(grantEmbedding, programEmbeddings, extractedFields, agencyCode, alnCodes, financialResult, orgProfile)` → **Output:** `ScoreBreakdown { composite, semantic, eligibility, financial_990, historical, strategic, matchedProgram? }`.

### The Grants.gov pipeline

[actions/discovery.ts:181-end](actions/discovery.ts#L181) is the only ingest path. Flow:

```
TARGETED_SEARCHES (or one Custom search)
  → searchGrants() in lib/grants-gov.ts
  → for each hit (capped 8 per search):
      hardExclusionReason → dedupe by source_id → extractGrantFields (Claude)
      → re-check exclusion now that geography is parsed
      → buildGrantText + generateEmbedding (OpenAI text-embedding-3-large)
      → screen990Against → computeMatchScore → MIN_STORE_SCORE gate
      → INSERT into grant_opportunities, UPSERT into match_results
```

A daily cron ([app/api/cron/refresh-corpus/route.ts](app/api/cron/refresh-corpus/route.ts)) walks 6 keyword profiles and runs the same pipeline. Foundations don't flow through this pipeline at all — `lib/foundation-corpus.ts` builds embeddings over the in-process `SEED_FOUNDATIONS` array on first request and caches them.

### Conflicts with the target architecture — flag these before building

1. **No `region` or `segment` abstraction anywhere.** Every multi-tenant feature today branches on a hardcoded `org_code` literal:
   - `getOrgProfile(orgCode)` dispatches on `'CYC2025'` and `'YOM2026'` strings ([actions/discovery.ts:32-50](actions/discovery.ts#L32)) and falls back to a `'Chicago'/'IL'` generic.
   - The cron route hardcodes `.eq('org_code', 'CYC2025')` ([app/api/cron/refresh-corpus/route.ts:56](app/api/cron/refresh-corpus/route.ts#L56)).
   - OAuth callbacks default `orgCode = 'CYC2025'`.
   - `app/api/chat/route.ts` and `app/api/financial-verdict/route.ts` branch on `orgCode === 'CYC2025'`.
   - `lib/match-reasons.ts:30` defaults `orgState = 'IL'`.
   - `lib/foundation-corpus.ts:118` hardcodes `state === 'IL' ? ['IL'] : []`.
   - `lib/matching.ts:90` returns user-visible text "not applicable to Chicago domestic nonprofit" for *any* tenant.
   - All of the above need to be migrated to region/segment lookups in Phase 1.
2. **`grant_opportunities.source` is a free-text string, not an FK.** The target architecture wants `source_id → grant_sources(id)`. Migration required.
3. **No `funder_id` on `grant_opportunities`.** Federal grants are tied to an `agency_code` text; foundations aren't in this table at all. The 990 graph in Phase 2 needs `funders` as a first-class table and a FK from opportunities.
4. **Foundation data lives in code, not data.** [lib/foundation-intelligence.ts](lib/foundation-intelligence.ts) contains ~15 hand-coded Chicago foundations as a TypeScript `const`. Same for [lib/cyc-profile.ts](lib/cyc-profile.ts), [lib/cyc-live-data.ts](lib/cyc-live-data.ts), [lib/ymca-live-data.ts](lib/ymca-live-data.ts). All of this needs to migrate into seed rows under the new tenant/funder/recipient tables.
5. **No common `GrantSource` adapter interface.** `lib/grants-gov.ts` exports raw `searchGrants` / `fetchOpportunity`; `lib/foundation-corpus.ts` is its own thing; `lib/propublica.ts` is yet another shape. Phase 1 needs a `GrantSource` interface that all three plus future city/state adapters implement.
6. **The hard-exclusion gate is built around a Chicago-youth assumption.** The lists themselves (DOD/USAID, "ukraine"/"weapons") are fine and largely segment-agnostic, but the comment block and the user-visible reason strings need to come from segment config, not a literal.

### One-line summary

The data layer is healthy and RLS is sound. The business logic above it is hardcoded to a single tenant in dozens of places. Phase 1 (config foundation) carries most of the risk and unblocks every later phase.

---

## Section 2 — Proposed schema

Confirmed structure of the tables in your brief, adjusted to fit what's already shipped. Deviations are called out inline.

```sql
-- ═══ CONFIG / TENANCY ═══════════════════════════════════════════════════

CREATE TABLE regions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,                  -- 'chicago-metro'
  name          text NOT NULL,                          -- 'Chicago Metro'
  geo_scope     jsonb NOT NULL,                         -- { states:["IL"], counties:["Cook","DuPage",...], metro:"Chicago" }
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE segments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text UNIQUE NOT NULL,             -- 'youth-ost'
  name                text NOT NULL,                    -- 'Youth / Out-of-School-Time'
  ntee_codes          text[] NOT NULL DEFAULT '{}',     -- ['O20','O21','B92', ...]
  peer_rules          jsonb NOT NULL DEFAULT '{}'::jsonb, -- budget bands, age-served, etc.
  funder_categories   text[] NOT NULL DEFAULT '{}',     -- ['youth_development','education', ...]
  factor_weights      jsonb NOT NULL,                   -- see Section 3 — weights live per-segment
  exclusion_rules     jsonb NOT NULL DEFAULT '{}'::jsonb, -- agency blocklist, keyword blocklist (replaces the hardcoded lists in lib/matching.ts)
  created_at          timestamptz DEFAULT now()
);

-- DEVIATION: organizations already exists with profile_data + ein. Adding
-- region_id, segment_id, ntee_code, budget_band, census_tract, lmi_flag
-- as TOP-LEVEL columns (not buried in profile_data) since they're used by
-- joins/RLS. profile_data stays for the long-tail org self-reported fields.
ALTER TABLE organizations
  ADD COLUMN region_id    uuid REFERENCES regions(id),
  ADD COLUMN segment_id   uuid REFERENCES segments(id),
  ADD COLUMN ntee_code    text,
  ADD COLUMN budget_band  text,                         -- '<500k','500k-2m','2m-10m','10m-50m','50m+'
  ADD COLUMN census_tract text,                         -- 11-digit FIPS, nullable until geocoded
  ADD COLUMN lmi_flag     boolean;                      -- denormalized for fast filtering

CREATE TABLE grant_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_key   text UNIQUE NOT NULL,                   -- 'grants_gov','propublica_990pf','city_of_chicago_dfss', ...
  name          text NOT NULL,
  source_type   text NOT NULL,                          -- 'federal' | 'foundation' | 'state_local' | 'corporate'
  region_id     uuid REFERENCES regions(id),            -- NULL for national sources
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,     -- adapter-specific (base url, rate limit, etc.)
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- ═══ 990 FUNDER → RECIPIENT GRAPH ═══════════════════════════════════════

CREATE TABLE funders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ein          text UNIQUE,                              -- nullable: some federal agencies have no EIN
  name         text NOT NULL,
  funder_type  text NOT NULL,                            -- 'federal_agency' | 'private_foundation' | 'community_foundation' | 'corporate' | 'bank' | 'state_local'
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,       -- focus areas, geographic focus, asset size, etc.
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX funders_type_idx ON funders(funder_type);

CREATE TABLE recipients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ein              text,                                 -- not unique: 990 grants schedules sometimes have name-only entries
  name             text NOT NULL,
  ntee_code        text,
  organization_id  uuid REFERENCES organizations(id),    -- NULL until we resolve identity (see Decision 2)
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- city, state, budget band, etc.
  created_at       timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX recipients_ein_idx ON recipients(ein) WHERE ein IS NOT NULL;

CREATE TABLE grants_made (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_id       uuid NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  recipient_id    uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  amount          numeric NOT NULL,
  fiscal_year     int NOT NULL,
  purpose         text,
  source          text NOT NULL,                         -- 'propublica_990pf','manual_seed', ...
  data_freshness  date NOT NULL,                         -- the filing's tax_prd_yr end-date
  confidence      numeric NOT NULL DEFAULT 1.0,          -- lower when scraped from PDF OCR or name-only matched
  raw             jsonb,
  ingested_at     timestamptz DEFAULT now()
);
CREATE INDEX grants_made_funder_idx    ON grants_made(funder_id);
CREATE INDEX grants_made_recipient_idx ON grants_made(recipient_id);
CREATE INDEX grants_made_year_idx      ON grants_made(fiscal_year);

-- ═══ OPPORTUNITIES (normalized target for ALL sources) ═════════════════
-- DEVIATION: grant_opportunities already exists with embedding + RLS. We
-- migrate it in place rather than create a parallel table. Renames map to
-- the target schema; columns that the old table had but the target doesn't
-- (synopsis, full_text, extraction_confidence) we KEEP — they're feeding
-- the extraction pipeline already.

ALTER TABLE grant_opportunities
  ADD COLUMN source_id       uuid REFERENCES grant_sources(id),
  ADD COLUMN external_id     text,                       -- the source's own ID (was source_id text; renamed)
  ADD COLUMN funder_id       uuid REFERENCES funders(id),
  ADD COLUMN amount_min      numeric,                    -- promoted from extracted_fields.award_floor
  ADD COLUMN amount_max      numeric,                    -- promoted from extracted_fields.award_ceiling
  ADD COLUMN deadline        date,                       -- promoted from close_date
  ADD COLUMN eligibility     jsonb,                      -- structured slice of extracted_fields
  ADD COLUMN geography       jsonb,                      -- { scope, states, counties, tracts }
  ADD COLUMN segment_tags    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN raw             jsonb;                      -- the adapter's raw payload
-- existing `source` (text) becomes a backup label; we backfill `source_id` from it.
-- existing `embedding vector(1536)` is reused as-is.

-- ═══ CRA ═══════════════════════════════════════════════════════════════

CREATE TABLE census_tracts (
  tract_id     text PRIMARY KEY,                         -- 11-digit FIPS
  region_id    uuid REFERENCES regions(id),
  lmi_status   text,                                     -- 'low','moderate','middle','upper','unknown'
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb        -- median income, population, etc.
);

CREATE TABLE bank_assessment_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_id   uuid NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  tract_id    text NOT NULL REFERENCES census_tracts(tract_id),
  source      text NOT NULL,                             -- 'ffiec_aa','cra_pe_pdf','manual_seed'
  UNIQUE (funder_id, tract_id)
);

-- ═══ MATCHING / VALUE LAYER ═══════════════════════════════════════════

CREATE TABLE peer_orgs (
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  peer_recipient_id   uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  similarity          numeric NOT NULL,                  -- 0..1
  basis               jsonb NOT NULL,                    -- { ntee_overlap, budget_band, embedding_cos, ... }
  computed_at         timestamptz DEFAULT now(),
  PRIMARY KEY (organization_id, peer_recipient_id)
);

CREATE TABLE org_opportunity_scores (
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id   uuid NOT NULL REFERENCES grant_opportunities(id) ON DELETE CASCADE,
  composite_score  numeric NOT NULL,
  factor_scores    jsonb NOT NULL,                       -- { semantic:0.78, eligibility:0.62, ..., funder_affinity:0.41 }
  evidence         jsonb NOT NULL,                       -- per-factor evidence blobs (see Section 3)
  recommendation   text NOT NULL CHECK (recommendation IN ('pursue','maybe','skip')),
  rationale        text NOT NULL,                        -- one-line user-facing summary
  computed_at      timestamptz DEFAULT now(),
  PRIMARY KEY (organization_id, opportunity_id)
);
-- DEVIATION: this REPLACES `match_results` over time. To avoid breaking the
-- pipeline app today, we keep `match_results` in place during Phase 1-3 and
-- dual-write. Phase 6 cuts over the UI and we drop `match_results` after.

CREATE TABLE concentration_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  revenue_breakdown     jsonb NOT NULL,                  -- { govt_pct, private_pct, program_pct, other_pct, by_funder: {...} }
  concentration_index   numeric NOT NULL,                -- HHI-style 0..1
  risk_flags            jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX concentration_org_idx ON concentration_snapshots(organization_id, computed_at DESC);

CREATE TABLE drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id  uuid NOT NULL REFERENCES grant_opportunities(id) ON DELETE CASCADE,
  content         jsonb NOT NULL,                        -- sectioned: { background, need, approach, budget, ... }
  source_citations jsonb NOT NULL DEFAULT '[]'::jsonb,   -- per-claim provenance for the no-fabrication rule
  status          text NOT NULL CHECK (status IN ('drafting','review','final','discarded')),
  generated_at    timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX drafts_org_idx ON drafts(organization_id, generated_at DESC);
```

### DBML diagram (relationships only)

```
regions 1──* segments? (no — segments don't have a region; orgs link to both)
regions 1──* grant_sources (nullable)
regions 1──* census_tracts
regions 1──* organizations (via region_id)
segments 1──* organizations (via segment_id)

grant_sources 1──* grant_opportunities

funders 1──* grants_made *──1 recipients
funders 1──* grant_opportunities (nullable)
funders 1──* bank_assessment_areas *──1 census_tracts

organizations 1──* peer_orgs *──1 recipients
organizations 1──* org_opportunity_scores *──1 grant_opportunities
organizations 1──* concentration_snapshots
organizations 1──* drafts *──1 grant_opportunities

[carry-over tenant tables]
organizations 1──* match_results       (kept during transition)
organizations 1──* pipeline_runs
organizations 1──* org_outcomes
organizations 1──* grant_notes / grant_tasks / document_analyses
```

---

## Section 3 — Composite-engine integration

The existing engine **stays**. We add one factor (funder affinity), re-ground one (historical), fold CRA into eligibility + affinity as a booster, and put weights in segment config. Every factor returns `{score: 0-1, evidence: jsonb}` so they're composable and the UI can show "why this score" per-factor.

### Common interface

```ts
// lib/factors/types.ts (new)
export interface FactorContext {
  orgProfile:     OrgProfile;          // region, segment, ntee, budget_band, census_tract, lmi_flag
  opportunity:    Opportunity;         // funder_id, eligibility, geography, embedding
  peerRecipients: PeerRecipient[];     // from peer_orgs join
  grantsMade:     GrantsMadeIndex;     // funder→recipient lookup
}

export interface FactorResult {
  score:    number;                    // 0..1
  evidence: Record<string, unknown>;   // factor-specific, persisted into org_opportunity_scores.evidence
}

export interface Factor {
  key:     string;
  compute: (ctx: FactorContext) => Promise<FactorResult>;
}
```

Each existing factor becomes a `Factor` implementation. Refactor of `computeMatchScore` is mechanical: it stops doing its own arithmetic and instead `await Promise.all(factors.map(f => f.compute(ctx)))`, then dot-products against `segments.factor_weights`.

### Re-grounded "historical win rate"

**Today:** hand-coded `historicalWinRates[agencyCode]` map per profile, merged with Bayes(1,2) on `org_outcomes`. Defaults to 0.35 when unknown.

**New:** of the peer recipients tied to this opportunity's funder, what fraction received at least one grant from that funder in the last N fiscal years?

```
peer_funded_share = | peer_recipients ∩ recipients_of(funder, last 3 FY) |
                    ───────────────────────────────────────────────────────
                    | peer_recipients with any grants_made in last 3 FY |
```

- If the denominator is < 5 (graph too thin): fall back to org's own Bayes(1,2) posterior on `org_outcomes` filtered to this agency/funder.
- If both are thin: fall back to the segment's baseline win rate (config in `segments.peer_rules.baseline_win_rate`, currently 0.35).

Evidence: `{ peer_funded_count, peer_total_count, fallback_used, baseline }`.

### NEW factor: funder affinity

Graph-proximity proxy. "How close is this org to this funder in the giving graph?"

```
let peer_count           = |peer_recipients|                                  // 15-20
let peers_funded_by_this = |peer_recipients ∩ recipients_of(funder, all FY)|
let funder_segment_match = (funder.metadata.focus_areas ∩ segment.funder_categories).size / max(...)
let cra_boost            = funder is bank AND org.census_tract ∈ assessment_areas(funder)
                                ? 0.15 : 0

affinity = min(1,
    0.50 * (peers_funded_by_this / peer_count)
  + 0.30 * funder_segment_match
  + 0.20 * (funder gives to ANY recipient in org's region last 3FY ? 1 : 0)
  + cra_boost
)
```

Evidence: `{ peers_funded_by_this: [{name, year, amount}, ...], focus_overlap: [...], gave_in_region: bool, cra_match: { tract, ffiec_source } | null }`.

When `funder_id` is null on the opportunity (a generic Grants.gov ALN with no resolved funder): affinity returns `{ score: 0.35, evidence: { reason: 'unresolved_funder' } }` — a neutral fallback rather than zero, so federal grants don't get penalized.

### CRA — a booster, not a factor

CRA enters in **two** places, never as a standalone factor:

1. **Eligibility:** when the org's tract has `lmi_status ∈ {low, moderate}` AND the opportunity's `eligibility.requires_lmi == true` (or the funder is a bank), the eligibility geography sub-score is boosted by +0.15 (capped at 1.0). Evidence carries `{ cra_eligible: true, tract_id, lmi_status }`.
2. **Funder affinity:** the `cra_boost` term above. Only fires for bank funders whose AA covers the org's tract.

Strategic and semantic do not consult CRA at all.

### Per-segment weights (Youth/OST seed)

Stored in `segments.factor_weights`. Initial weights tuned to keep the current behavior nearly identical while introducing funder affinity:

```json
{
  "semantic":         0.32,
  "eligibility":      0.20,
  "financial_990":    0.18,
  "funder_affinity":  0.12,
  "strategic":        0.12,
  "historical":       0.06
}
```

Total = 1.00. Semantic drops 0.08 from the current 0.40 to make room for funder affinity; everything else holds within ~0.02 of where it is today, so live scores shouldn't move dramatically on day one.

### Recommendation thresholds (Phase 6 win-triage)

Derived from `composite_score` *and* veto evidence. Thresholds in `segments.peer_rules.recommendation_thresholds`:

| Composite | Veto evidence | Recommendation |
|---|---|---|
| ≥ 70 | none | **pursue** |
| ≥ 70 | any (CRA mismatch with required LMI / eligibility geography hard-zero / funder closed application window) | **maybe** with reason |
| 50–69 | none | **maybe** |
| 50–69 | any | **skip** with reason |
| < 50 | any | **skip** |

This is what populates the win-triage list AND the explicit "skip these" section.

### Signal → factor map

| Signal | Feeds factor | New or re-grounded | Seed weight (of factor) |
|---|---|---|---|
| Per-program embedding cosine | semantic | unchanged | 0.32 |
| Entity type / org-type eligibility | eligibility | unchanged | (35% sub) |
| Geographic scope vs region | eligibility | unchanged | (30% sub) |
| **LMI booster on geography** | eligibility | **new (CRA)** | +0.15 cap |
| Target population overlap | eligibility | unchanged | (20% sub) |
| Compliance / GATA | eligibility | unchanged | (15% sub) |
| 990 reverse-screen | financial_990 | unchanged | 0.18 |
| **Peer recipients funded by this funder** | funder_affinity (50%) AND historical (replaces map) | **new + re-ground** | 0.12 + 0.06 |
| **Funder focus-area overlap with segment** | funder_affinity (30%) | **new** | — |
| **Funder gives in region** | funder_affinity (20%) | **new** | — |
| **Bank AA covers org tract** | funder_affinity (CRA boost) | **new** | +0.15 cap |
| Program-area overlap | strategic | unchanged | (60% sub) |
| Award-size fit | strategic | unchanged | (30% sub) |
| Org's own observed outcomes | historical (Bayes fallback) | already grounded (Tier 1C) | 0.06 |

---

## Section 4 — RLS & isolation

| Table | Scope | Read policy | Write policy |
|---|---|---|---|
| `regions` | shared reference | `authenticated SELECT` | service role only |
| `segments` | shared reference | `authenticated SELECT` | service role only |
| `grant_sources` | shared reference | `authenticated SELECT` | service role only |
| `funders` | shared reference | `authenticated SELECT` | service role only (ingestion) |
| `recipients` | shared reference | `authenticated SELECT` | service role only |
| `grants_made` | shared reference | `authenticated SELECT` | service role only |
| `grant_opportunities` | shared catalog | `authenticated SELECT` (existing) | service role only |
| `census_tracts` | shared reference | `authenticated SELECT` | service role only |
| `bank_assessment_areas` | shared reference | `authenticated SELECT` | service role only |
| **`organizations`** | tenant-scoped | members of org only (existing `qa_rls_hardening.sql`) | members; service role for region/segment back-fills |
| `peer_orgs` | tenant-scoped | `org_id ∈ user_organizations` | service role writes (computed nightly); SELECT-only for users |
| `org_opportunity_scores` | tenant-scoped | `org_id ∈ user_organizations` | service role writes from the scoring job; user UPDATE limited to recommendation override |
| `concentration_snapshots` | tenant-scoped | `org_id ∈ user_organizations` | service role writes |
| `drafts` | tenant-scoped | `org_id ∈ user_organizations` | members manage |
| `match_results`, `pipeline_runs`, `org_outcomes`, `grant_notes`, `grant_tasks`, `document_analyses` | tenant-scoped | unchanged from current hardening | unchanged |

**Verification step after Phase 1 ships:** create a second tenant (Tenant B) in a region we have data for, log in as Tenant B's user, hit every new API surface, confirm the responses contain zero rows belonging to Tenant A. Same drill after Phase 3 (peer/score writes) and Phase 6 (drafts).

---

## Section 5 — Config vs seed vs code

The rule: business logic in `/lib`, `/app/api`, `/actions` is segment- and region-agnostic. Anything Chicago- or youth-specific is either a **config row** (regions/segments/grant_sources) or **seed data** (funders/recipients/initial CYC organization row).

### Currently hardcoded — must move

| Today (literal in code) | Where it lives now | Where it goes |
|---|---|---|
| `'CYC2025'` org_code dispatch | [actions/discovery.ts:33](actions/discovery.ts#L33), [app/api/cron/refresh-corpus/route.ts:56](app/api/cron/refresh-corpus/route.ts#L56), 5 OAuth/chat/financial-verdict routes | `organizations.region_id`/`segment_id` lookup; cron iterates all orgs with `region_id IS NOT NULL` |
| `CYC_PROFILE` const | [lib/cyc-profile.ts](lib/cyc-profile.ts) | one `organizations` row + its `profile_data` jsonb + the segment row for Youth/OST |
| `CYC_FINANCIAL_PROFILE` / `CYC_LIVE_DATA` | [lib/cyc-live-data.ts](lib/cyc-live-data.ts) | `organizations.financial_data` (already there) + `organizations.profile_data` |
| `YMCA_MATCH_PROFILE` | [lib/ymca-live-data.ts](lib/ymca-live-data.ts) | another `organizations` row |
| `SEED_FOUNDATIONS` (~15 Chicago foundations) | [lib/foundation-intelligence.ts:51](lib/foundation-intelligence.ts#L51) | seed `funders` rows (funder_type='private_foundation' or 'community_foundation'), region_id=Chicago Metro |
| `TARGETED_SEARCHES` (Youth keyword list) | [actions/discovery.ts:164](actions/discovery.ts#L164) | `segments.peer_rules.keyword_profiles` for Youth/OST |
| `CRON_PROFILES` (same shape) | [app/api/cron/refresh-corpus/route.ts:30](app/api/cron/refresh-corpus/route.ts#L30) | same: read from segment config |
| `EXCLUDED_AGENCIES`, `INTERNATIONAL_KEYWORDS`, `EXCLUDED_AGENCY_PREFIXES` | [lib/matching.ts:33-66](lib/matching.ts#L33) | `segments.exclusion_rules` — these *are* mostly segment-agnostic, but the way they're applied and the user-visible reason strings must come from config |
| `"not applicable to Chicago domestic nonprofit"` user-visible string | [lib/matching.ts:90](lib/matching.ts#L90) | template using `region.name` and `segment.name` |
| `orgState = 'IL'` default | [lib/match-reasons.ts:30](lib/match-reasons.ts#L30) | required arg from caller; no default |
| `state === 'IL' ? ['IL'] : []` | [lib/foundation-corpus.ts:118](lib/foundation-corpus.ts#L118) | resolve from the funder's `metadata.geographic_focus` or its `region_id` |
| `isCyc = orgCode === 'CYC2025'` | [app/api/chat/route.ts:135](app/api/chat/route.ts#L135) | segment-based branch |
| Hardcoded EIN `362166791` and `36-2344429` | [supabase/add_financials.sql:16](supabase/add_financials.sql#L16), [lib/cyc-profile.ts:3](lib/cyc-profile.ts#L3) | seed `organizations.ein` |

**Grep target** (post-Phase 1): `rg "Chicago|CYC2025|'IL'|\"IL\"|youth" lib/ actions/ app/api/ --type ts` should return zero results from business logic — only test fixtures, generic exclusion rules ("ukraine" et al., which are segment-agnostic), and comments referencing the config tables.

### Seed rows (the first instances)

```sql
-- regions
INSERT INTO regions (slug, name, geo_scope) VALUES (
  'chicago-metro',
  'Chicago Metro',
  '{"states":["IL"],"counties":["Cook","DuPage","Kane","Lake","McHenry","Will"],"metro":"Chicago-Naperville-Elgin MSA"}'
);

-- segments
INSERT INTO segments (slug, name, ntee_codes, peer_rules, funder_categories, factor_weights, exclusion_rules) VALUES (
  'youth-ost',
  'Youth / Out-of-School-Time',
  ARRAY['O20','O21','O22','O23','O30','O50','B92','P30'],
  '{
    "budget_bands": ["500k-2m","2m-10m","10m-50m"],
    "ages_served": "5-18",
    "baseline_win_rate": 0.35,
    "keyword_profiles": [
      {"name":"Youth Afterschool","keyword":"youth afterschool out-of-school time","rows":25},
      {"name":"Early Childhood","keyword":"early childhood education Head Start pre-K","rows":25},
      {"name":"Youth Workforce Dev","keyword":"youth workforce development job training 14-24","rows":25},
      {"name":"21st CCLC","keyword":"21st Century Community Learning Centers","rows":20},
      {"name":"Violence Prevention","keyword":"youth violence prevention community nonprofit","rows":20},
      {"name":"Mentoring","keyword":"youth mentoring at-risk young people nonprofit","rows":20}
    ],
    "recommendation_thresholds": { "pursue": 70, "maybe": 50 }
  }'::jsonb,
  ARRAY['youth_development','education','workforce_development','violence_prevention','arts_education'],
  '{"semantic":0.32,"eligibility":0.20,"financial_990":0.18,"funder_affinity":0.12,"strategic":0.12,"historical":0.06}',
  '{
    "agencies": ["DOS","STATE","DOD","USAID","ARMY","NAVY","AIR","MDA","DARPA","NSA","DIA","USMC"],
    "agency_prefixes": ["DOD-","ARMY-","NAVY-","USAF-","DLA-"],
    "keywords": ["ukraine","afghanistan","israel","gaza","weapons","embassy", "..."]
  }'::jsonb
);

-- grant_sources (one row per adapter; region_id null for federal/national)
INSERT INTO grant_sources (adapter_key, name, source_type) VALUES
  ('grants_gov',           'Grants.gov',                       'federal'),
  ('propublica_990pf',     'ProPublica Nonprofit Explorer',    'foundation');
-- Region-scoped sources land in Phase 5:
--   ('city_of_chicago_dfss','City of Chicago DFSS', 'state_local', <chicago_metro_id>)
--   ('cook_county',         'Cook County',          'state_local', <chicago_metro_id>)
--   ('illinois_gata',       'Illinois GATA',        'state_local', <chicago_metro_id>)
--   ('isbe',                'Illinois State Board of Education', 'state_local', <chicago_metro_id>)
```

The CYC org row gets `region_id = <chicago_metro>`, `segment_id = <youth_ost>`, `ntee_code = 'O20'`, `budget_band = '10m-50m'`, plus `profile_data` already populated. No literal references to Chicago or Youth survive in business logic.

---

## Section 6 — Phase plan & open decisions

### Build order with sizing

| Phase | Effort | Notes |
|---|---|---|
| **1. Config foundation + design system** | 5–7 days | The config migration is ~2 days; the design-system pass (Playwright competitor audit, tokens, core components, refactor existing screens) is the rest. High return — every later phase reads from this. |
| **2. 990 graph ingestion** | 4–5 days | ProPublica adapter with cursor-based resume + nightly delta. Schema + dedupe is straightforward; identity resolution (see Decision 2) determines whether it's 4 days or 7. |
| **3. Peer mining + funder affinity factor** | 3–4 days | Daily-batch peer computation per org; affinity factor wired into the engine with the new weights. Multi-tenant verification at the end. |
| **4. CRA layer (base)** | 3 days | Geocode org address → tract → LMI lookup via FFIEC. Surface bank-AA matches. **Stretch (CRA PE PDF parsing): +1–2 weeks.** Decision 3 below. |
| **5. Local/state adapters** | 8–10 days | Four Chicago Metro sources, ~2 days each. Behind the common `GrantSource` interface; adding a new city later is one adapter + one row. |
| **6. Value layer** | 5–7 days | Win-triage UI (1d), draft generation with RAG over org docs (3d, longer if Decision 4 lands strict), concentration dashboard (1d), polish (1d). |
| **7. Polish pass** | 2–3 days | Playwright at desktop+mobile, empty/loading/error states everywhere, evidence display refinement. |

**Cumulative:** 30–39 working days base; +5–10 if CRA PDF parsing is in-scope.

### Decisions needed from you

Reply with a number per decision (or "Other" with your own option). Until I have answers, I won't move past Phase 1.

**1. Reconciling the brief's "4-factor" vs the live engine's "5-factor."**
The brief specifies 4 factors; the code has had `financial_990` as a fifth since the QA tier. Funder affinity makes it six.

  - **(a) Six factors, weights as proposed in Section 3. (Recommended)** Keeps everything that already ships and earns its weight; smallest behavior change on cutover.
  - (b) Fold `financial_990` evidence back into `eligibility` so the headline factor count returns to 4 + funder_affinity = 5. More consistent with the brief; bigger weight reshuffle and the financial signals are noisier in the UI.
  - (c) Treat as a doc-vs-code mismatch and update the brief — I'll defer to your wording but build (a).

**2. Peer-similarity method.**
How do we identify the 15-20 peer recipients for funder-affinity / historical re-grounding?

  - (a) NTEE + budget-band + region heuristic. Fast, deterministic, fully explainable in evidence ("peers are same-NTEE orgs in your region within ±1 budget band").
  - (b) Embedding-based: embed each recipient's name+ntee+geography+mission(if known) and take cosine neighbors. Richer, but recipients have no mission text — we'd be embedding noisy 990 metadata.
  - **(c) Hybrid: heuristic (a) generates a candidate pool of ~100, then embedding sort selects the top 15-20. (Recommended)** Best of both; small added cost; evidence is still concrete.

**3. Recipient ↔ organization identity resolution.**
Most 990 recipient entries are name-only with no EIN, and recipient names are inconsistent ("Chicago Youth Centers" vs "Chicago Youth Centers, Inc." vs "C.Y.C."). Some 25-40% can't be EIN-matched without help.

  - **(a) EIN-first with name+state+NTEE fuzzy fallback (Levenshtein + token sort). Flag low-confidence matches for review; ship behind a `confidence < 0.7` threshold. (Recommended)**
  - (b) EIN-only; treat name-only entries as separate recipient records and accept the graph blur.
  - (c) EIN-first + LLM-assisted disambiguation for the residual. Highest quality, ~$0.50 per ambiguous case.

**4. CRA PE PDF parsing — now or later?**
The base CRA layer (geocode → tract → LMI → bank AA via FFIEC) is straightforward. Parsing actual CRA Public Evaluation PDFs to extract bank donation tables is the moat.

  - **(a) Defer to a separate Phase 4b. Ship the base CRA layer in Phase 4 (3 days), scope PDF parsing separately after Phase 6 ships. (Recommended)**
  - (b) Build it in Phase 4. Adds 1-2 weeks; OCR quality on FDIC/OCC PE PDFs is uneven so we'll need a human-in-the-loop reviewer.
  - (c) Skip entirely; rely on FFIEC AA coverage as the only bank signal.

**5. Draft-generation guardrails (Phase 6).**
The brief says "never fabricate facts about the org." How strict?

  - **(a) Every factual claim about the org must cite a source (the org's profile_data, its 990 row, an uploaded prior narrative). Claude is restricted to retrieval-grounded generation; un-citable claims are replaced with `[TODO: confirm from org]` placeholders. (Recommended)** Saving as `drafts.source_citations` per-claim.
  - (b) Soft guardrail: Claude is asked to cite sources but generation isn't blocked when it can't; a banner warns the user to review.
  - (c) Defer drafts entirely to Phase 8; Phase 6 ships only win-triage + concentration.

**6. Migrate or wipe-and-reseed?**
The CYC org row already exists with `profile_data`, financial data, EIN. Two test tenants exist.

  - **(a) Migrate in place: backfill `region_id`/`segment_id`/`ntee_code` on existing rows, deprecate `lib/cyc-profile.ts` after the data is in the DB. (Recommended)** Preserves the 6 tiers' worth of corpus and outcome data already accumulated.
  - (b) Wipe and reseed from new seed files. Cleaner, but discards `match_results` history and outcome trigger data — which the new historical factor's Bayes fallback wants.

---

**Awaiting signoff on this plan before writing Phase 1 code.** Reply with decisions 1-6 (and any other adjustments) and I'll start with the config tables + adapter registry refactor and proceed sequentially.
