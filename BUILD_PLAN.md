# BUILD_PLAN — CRA Intelligence Panel + 990 Reverse-Search Funder Engine

**Status:** Phase 0 plan. **No feature code written.** Stops here for review.

**Author's note:** I'm going to be direct about what's already built. The Phase 2 / Phase 3 / Phase 4 work shipped a lot of the substrate this brief asks for; both workstreams are largely *re-skinning + completing + reframing* the existing pipeline, not building parallel systems. Where I disagree with the brief I say so, with a reason.

---

## 0.5 Status update — 2026-06-17

This plan was drafted earlier; several pieces moved between then and now. Updating before A1 starts so the gates are accurate.

**What's changed on disk since this plan was first written:**

| Change | File | Effect on plan |
|---|---|---|
| Phase 7 migration drafted | [`supabase/phase7_funder_intelligence.sql`](supabase/phase7_funder_intelligence.sql) | §5 schema stubs → now exist on disk, not yet applied. **A1 only needs the user to ✋ sign off on running it; no new migration design needed.** |
| BofA → After School Matters edge seeded | [`lib/graph/seed-cyc-graph.ts:155`](lib/graph/seed-cyc-graph.ts) | §0 TL;DR claim "the After School Matters edge specifically is missing from the seed" is now ✅ stale. The acceptance edge exists at confidence 0.6 with provenance note. |
| CRA panel data layer implemented | [`lib/cra/intelligence.ts`](lib/cra/intelligence.ts) | §3 Workstream A: the `loadCraIntelligence` repo helper, banding logic, evidence-link builder, rationale composer all exist. **A2 is just the React component now**, not "build the data layer." |
| CYC bank-relationship seed written | [`lib/cra/seed-relationships.ts`](lib/cra/seed-relationships.ts) | §A1 "seed CYC's 4 known relationships" → runner ready, just needs to execute after phase7 is applied. |
| Budget tracker written | [`BUDGET.md`](BUDGET.md) | §8 open questions on worker host + backfill scope + lookalike → **resolved**. See below. |

**Budget gates locked (per [BUDGET.md](BUDGET.md)):**

| Decision | Choice |
|---|---|
| Hard first-year cap | **$50.00** |
| Backfill scope | Chicago + ~50 national majors (NOT national-wide) |
| Worker host | GitHub Actions cron (NOT Fly.io) |
| B7 lookalike pass | Deferred |
| Tier 3 adjudication model | Sonnet 4.6 (default) — A/B Haiku only after pilot |
| Brief output cap | 2000 tokens (45% cheaper than 4000) |
| Re-ingest cadence | Quarterly, not nightly |
| Brief cache | By `brief_edge_hash`; regenerate only on changed cited edges |

**Net status:** Workstream A is one ✋ + ~1 day of component work from shipping. Workstream B is unchanged in scope but has its budget rails defined.

**Remaining gates that still need YOUR sign-off:**

1. ✋ **Apply `supabase/phase7_funder_intelligence.sql`** to live Supabase. Idempotent, additive only (4 new tables + 1 nullable column). Required before A1 can write any seeds.
2. ✋ **Approve A1 → A2 → A3 zero-cost path** (component build, dashboard wiring, polish).
3. ✋ **Before B2 pilot ingest** (~$0.50 spend to measure real Tier 3 firing rate).
4. ✋ **Before B4 full backfill** (~$15 expected, $26 worst-case — within cap).
5. ✋ **Before B6 brief generation** (~$1.20 for first 30 CYC briefs).

The four remaining open questions in §8 (Tier 3 confidence ceiling; Huntington EIN; brief regeneration UX; multi-tenant funder_intel scoping) are still open.

---

## 0. TL;DR

- **Workstream A** is small. The CRA join already runs and ships data into [`OrgCraSnapshot`](lib/cra/types.ts#L29). The work is **(a)** add one tiny table to mark known existing relationships and **(b)** build one panel component that joins that table + the `grants_made` peer-funding lookup. ~2 days end-to-end.
- **Workstream B** is the heavy lift. The schema is mostly done — [`funders`](supabase/phase2_funder_graph.sql#L22), [`recipients`](supabase/phase2_funder_graph.sql#L57), [`grants_made`](supabase/phase2_funder_graph.sql#L87), [`peer_orgs`](supabase/phase3_funder_affinity.sql#L32), [`ingest_state`](supabase/phase2_funder_graph.sql#L127) — and the [identity resolver](lib/graph/identity.ts) already does EIN-first + fuzzy. What's missing is the **bulk 990-PF XML ingestion** (currently we only have ProPublica's foundation *index* via [`propublica-funders.ts`](lib/graph/propublica-funders.ts), which doesn't carry Schedule I) and the **prospect/lookalike scoring + brief surface**. ~3–4 weeks of focused work, depending on how far we push the embedding/lookalike phase.
- **Acceptance test for both:** the system independently surfaces Bank of America as a CYC prospect because BofA funds After School Matters. Workstream A passes this *once the existing `peer_orgs` + `grants_made` join is wired into the panel UI* — the data is already there ([`seed-cyc-graph.ts` line 145](lib/graph/seed-cyc-graph.ts#L145), `136022000` → `Bottom Line Chicago`; the After School Matters edge specifically is missing from the seed and we'd add it). Workstream B passes this *when the IRS-XML ingestor pulls BofA Charitable Foundation's 990-PF Schedule I, the identity resolver matches "After School Matters" against the existing recipient row by EIN, and the prospect scorer surfaces BofA as `peer-overlap=1, fits CYC's segment`*.

**Approval needed before any code.** Open questions live in §8.

---

## 1. Inventory — what exists today

### 1.1 Tables (live in Supabase, all RLS-on, all `read-all-authenticated`)

| Table | Migration | Purpose | Current state |
|---|---|---|---|
| `organizations` | [phase1_config_foundation.sql:76](supabase/phase1_config_foundation.sql#L76) | Adds `ein`, `census_tract`, `lmi_flag` columns. | CYC2026 row has all three populated. |
| `funders` | [phase2_funder_graph.sql:22](supabase/phase2_funder_graph.sql#L22) | EIN-keyed (nullable for federal), `funder_type` enum incl. `bank`. | Populated for the ~20 funders touched by the hand-curated seed + the ProPublica index ingest. |
| `recipients` | [phase2_funder_graph.sql:57](supabase/phase2_funder_graph.sql#L57) | EIN-keyed (nullable; common for 990-PF rows), trigram-indexed on `name` for fuzz. `organization_id` links recipients that ARE tenant orgs. | ~15 CYC peers populated via seed. |
| `grants_made` | [phase2_funder_graph.sql:87](supabase/phase2_funder_graph.sql#L87) | Edge table. UNIQUE on `(funder_id, recipient_id, fiscal_year, source)`. Carries `confidence`, `data_freshness`, `purpose`, raw payload. | ~65 hand-curated edges. **Zero edges from live 990-PF ingestion.** |
| `peer_orgs` | [phase3_funder_affinity.sql:32](supabase/phase3_funder_affinity.sql#L32) | (org_id, recipient_id) link with `similarity` + `basis`. The "people like you" set. | 15 rows for CYC. |
| `ingest_state` | [phase2_funder_graph.sql:127](supabase/phase2_funder_graph.sql#L127) | Resumable per-adapter cursor. | Used by ProPublica adapter; empty for the not-yet-built 990-XML ingestor. |
| `census_tracts` | [phase4_cra_layer.sql:36](supabase/phase4_cra_layer.sql#L36) | FIPS-keyed, `lmi_status` enum. | 41 Cook County rows from [`seed-data.ts`](lib/cra/seed-data.ts#L149). |
| `bank_assessment_areas` | [phase4_cra_layer.sql:64](supabase/phase4_cra_layer.sql#L64) | (funder_id, tract_id) with `source ∈ {ffiec_aa, cra_pe_pdf, manual_seed}`. | 9 banks × 41 tracts = ~370 rows from the seed. |

**Already cited in the brief; confirming we'll extend not duplicate.**

### 1.2 Code surfaces

| File | Role | LOC |
|---|---|---|
| [`lib/cra/repo.ts`](lib/cra/repo.ts) | `getTract`, `upsertTract`, `upsertBankAa`, and crucially **`loadOrgCraSnapshot(orgId)`** at line 79 — the matcher's hot read; pulls `org.census_tract → tract.lmi_status → list of bank funders whose AA covers it`, with the join already pre-shaped. | 144 |
| [`lib/cra/seed-data.ts`](lib/cra/seed-data.ts) | `CHICAGO_BANK_FUNDERS` (9 banks incl. JPMC, **BofA**, BMO, Wintrust, Fifth Third, PNC, US Bank, Northern Trust, Old National) + 41 LMI tracts. **Wintrust EIN is `362476552`** — note the brief lists Wintrust as existing; matches. **TCF/Huntington and Old National acquired First Midwest** — Huntington is NOT in the seed today; we'd add it. | 238 |
| [`lib/cra/seed-runner.ts`](lib/cra/seed-runner.ts) | One-shot writer for the two seeds above. | 117 |
| [`lib/factors/funder-affinity.ts`](lib/factors/funder-affinity.ts) | The matcher factor. `loadFunderAffinitySnapshot` pre-loads (peers, region-active funders, banks-covering-tract). `computeFunderAffinity` returns `score + evidence` per (org, funder) pair. **Already encodes the peer-overlap signal we need for Workstream A.** | 211 |
| [`lib/graph/repo.ts`](lib/graph/repo.ts) | CRUD over funders/recipients/grants_made/ingest_state. The `findRecipientCandidates` trigram search at line 144 is the input to the identity resolver. | 257 |
| [`lib/graph/identity.ts`](lib/graph/identity.ts) | Two-tier resolver: **EIN-exact** (line 117) → **fuzzy** (jaccard name + state bonus + NTEE bonus, threshold 0.70 at line 50). **No Claude adjudication yet** — Workstream B inserts the gray-band Claude tier between fuzzy-accept and fuzzy-reject. | 168 |
| [`lib/graph/seed-cyc-graph.ts`](lib/graph/seed-cyc-graph.ts) | The hand-curated edges. Inventory worth quoting: BofA (EIN 13-6022000) edges currently are **Bottom Line Chicago $75K** and **BUILD Inc. $50K** ([lines 145–146](lib/graph/seed-cyc-graph.ts#L145)). **After School Matters is NOT in this seed** as a BofA recipient.[†] | 169 |
| [`lib/graph/seed-cyc-runner.ts`](lib/graph/seed-cyc-runner.ts) | One-shot writer. | 143 |
| [`lib/graph/propublica-funders.ts`](lib/graph/propublica-funders.ts) | ProPublica index ingest. **Honestly scoped — pulls foundation records, NOT Schedule I grant tables.** The file's own comment says so at line 11. | 100+ |
| [`app/api/cron/ingest-funders/route.ts`](app/api/cron/ingest-funders/route.ts) | Nightly tick over the ProPublica adapter. Uses bearer-gated CRON_SECRET. | (cron, scheduled `0 8 * * *` per [vercel.json](vercel.json)) |
| [`app/grant/[id]/page.tsx:270`](app/grant/[id]/page.tsx#L270) | The ONLY place `loadOrgCraSnapshot` is consumed today — feeds `craEvidence` into the grant-detail score breakdown. **No dashboard panel reads CRA yet.** | — |

[†] **Reality check on the acceptance test.** The brief states BofA funds After School Matters "$3.7M+ over two decades." That's a real-world fact, but it's *not in our seed*. To pass the Workstream A acceptance test we need to **(a) add the BofA → ASM edge to the seed (with a confidence ≤ 0.7 because we're attesting it without a parsed filing in hand)** and **(b) cite a source** (BofA Charitable Foundation 990-PF Schedule I, or ASM's annual report). Workstream B then re-attests it from the parsed XML and overwrites the seed edge with `source='irs_990_xml'`, `confidence=1.0`.

### 1.3 What the dashboard already shows from this stack
- Grant detail page surfaces `bank_funders` + tract LMI status via [`craEvidence`](app/grant/[id]/page.tsx#L296) inside the funder-affinity factor evidence list.
- Dashboard shows [`ConcentrationPanel`](components/concentration-panel.tsx) (different Phase 6 signal). **There is no CRA panel on the dashboard.** This is the gap Workstream A fills.
- There is no funder-intelligence surface anywhere yet. That's Workstream B.

---

## 2. The CRA reframe (the brief is right)

**Current matcher language** (see `craEvidence` consumer): "Bank X's CRA assessment area covers your tract" — fine. **What the dashboard would say if we just dumped that data into a panel:** "These 9 banks are legally obligated to invest in your neighborhood." That overstates it.

**Correct frame.** CRA exam obligations run to a bank's whole assessment area, not to any one nonprofit. The bank earns CRA credit by investing in *anything* community-development-qualifying inside its AA. CYC is one of dozens of qualifying recipients per AA. The right pitch is **"This bank's CRA program is statutorily targeted at the same census tracts where you operate, AND they already fund one of your peers — you have a credible ask."** That's a strong prospect, not an owed debt.

This is mostly a copy + UI-affordance change. The data join is unchanged.

---

## 3. Workstream A — CRA Intelligence Panel

### 3.1 What the panel renders, per bank

Pulls from `loadOrgCraSnapshot(orgId)` (existing) + a new derived layer:

| Column | Source | Notes |
|---|---|---|
| Bank name | `funders.name` via `bank_assessment_areas` join | Already shipped. |
| **Relationship** = `Existing` / `Prospect` | New `org_funder_relationships` table (proposed §5) | Seeded with CYC's known supporters: Northern Trust, BMO, Wintrust, Huntington. |
| **Peer signal** = "Funds N of your peers" | `grants_made` JOIN `peer_orgs` for this org, filtered by `funder_id` | Already computable from existing schema. Surfaces the warm lead. |
| **Why it qualifies** | Composed line: "CRA AA covers your tract → bank's CRA goals align with LMI youth programming" | Template + tract community name. |
| **Suggested action** = `Deepen` / `Open` | Rule: `Existing → Deepen` else `Prospect → Open` | One liner. |
| Evidence link | (1) FFIEC institution lookup URL by FDIC ID, (2) the peer-funding edge → ProPublica recipient page | Each row carries at least one outbound URL. |
| Confidence | Derived from the bank-AA source (`ffiec_aa` > `cra_pe_pdf` > `manual_seed`) + the peer-funding edge's `grants_made.confidence` | Rendered as a tiny chip; sub-threshold rows are hidden, not falsified. |

### 3.2 Sort/rank
Default sort: `Prospect with peer signal` > `Existing under-monetized` > `Prospect no peer signal` > `Existing` (ranked highest peer-overlap first within each band). Configurable via a small column header click — we already have a sortable-table pattern in [`GrantTable`](components/grant-table.tsx) we can mimic.

### 3.3 New schema (Workstream A only — see §5 for the consolidated migration stub)

One small table:

```sql
-- supabase/phase7_cra_intelligence.sql
CREATE TABLE IF NOT EXISTS org_funder_relationships (
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  funder_id        uuid NOT NULL REFERENCES funders(id)       ON DELETE CASCADE,
  status           text NOT NULL CHECK (status IN ('existing','prospect','declined','dormant')),
  source           text NOT NULL,            -- 'self_reported' | 'derived_990' | 'manual'
  notes            text,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, funder_id)
);
ALTER TABLE org_funder_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ofr: members read own org" ON org_funder_relationships
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
CREATE POLICY "ofr: members write own org" ON org_funder_relationships
  FOR ALL TO authenticated
  USING      (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
```

Why a new table and not `peer_orgs`-style derivation: `peer_orgs` is "people like CYC who got funded"; this is "funders CYC actually engages with," which is the org's own assertion. Mixing them confuses the semantics.

### 3.4 Seed (Workstream A "day-one" data)

| Bank | EIN | Status seed | Source |
|---|---|---|---|
| Northern Trust | 36-2723087 | `existing` | brief |
| BMO Bank N.A. | 36-2967330 | `existing` | brief |
| Wintrust Financial | 36-2476552 | `existing` | brief |
| Huntington Bank (formerly TCF) | **NEEDS LOOKUP** ⚠️ | `existing` | brief — **not in `CHICAGO_BANK_FUNDERS` today; we'd add it** |
| Bank of America N.A. | 13-6022000 | `prospect` | brief — must surface with peer signal |
| JPMorgan Chase, Fifth Third, PNC, US Bank, Old National | various (already seeded) | `prospect` | derived; render the peer-signal columns as zero unless they actually fund a CYC peer |

### 3.5 UI scope

- One new component, `<CraIntelligencePanel>`, dropped into [`app/dashboard/page.tsx`](app/dashboard/page.tsx) next to `<ConcentrationPanel>`. Same `bg-canvas-1 rounded-lg shadow-flat` rhythm we just shipped on the dashboard pass.
- Compact card view + expandable detail row (rationale + evidence links inline). NOT a separate tab/page — the brief says "panel on the dashboard."
- Empty state: when `bank_funders.length === 0`, render "No CRA bank funders detected for your tract — confirm your address in Settings." Loading state: skeleton list rows with the same 3-column grid.
- Mobile: cards stack; the table collapses to one bank-per-card with the badge row at top.

### 3.6 Acceptance criteria (recapped from the brief, with measurable assertions)
1. Panel renders **only** banks where `bank_assessment_areas` covers CYC's tract `17031480500` (not all 9 — verified by the seed; today's join returns all 9 because the demo seed gave every bank Cook-County-wide AA coverage; that's fine).
2. **Northern Trust, BMO, Wintrust, Huntington render as `Existing → Deepen`.** Asserted via the new `org_funder_relationships` rows.
3. **Bank of America renders as `Prospect → Open` with a peer signal** ("Funds 1 of your peers: After School Matters, $X in FY 2024 — IRS 990-PF link"). Requires adding the BofA → ASM edge to the seed (sourced + cited).
4. No row lacks an evidence link.
5. Sub-threshold confidence (any `confidence < 0.5`) rows are hidden, not displayed as fact.

### 3.7 Estimated effort
- Migration + seed update + one new repo function (`loadOrgFunderRelationships`): **half a day**.
- BofA → ASM seed edge addition + a Huntington EIN lookup: **half a day**.
- Panel component (~250 LOC): **1 day**.
- Dashboard integration + responsive pass: **half a day**.
- **Total: ~2.5 days.** No Claude calls. No ingestion work.

---

## 4. Workstream B — 990 Reverse-Search Funder Engine

### 4.1 Honest scope

The brief's pipeline already half-exists. To honor "build on what exists":

| Pipeline step | Status |
|---|---|
| 1. Seed set (CYC + peers) | **DONE** — `peer_orgs` populated for CYC. |
| 2. Bulk 990-PF ingestion | **NOT DONE** — ProPublica adapter is index-only; no Schedule I parsing. **This is the heavy lift.** |
| 3. Entity resolution | **HALF DONE** — EIN-exact + fuzzy are live; **no Claude adjudication tier**. |
| 4. Embeddings for lookalike | **NOT DONE** — `pgvector` is enabled (Phase 6 drafts/sources use it) but there's no funder-profile embedding table. |
| 5. Prospect/lookalike scoring | **NOT DONE** — `funder-affinity.ts` scores *known* funders against an org; the inverse query ("rank all funders by likelihood of funding this org") doesn't exist. |
| 6. Brief generation | **NOT DONE** — pattern exists in `lib/drafts/generator.ts` (Phase 6), can be cloned. |

### 4.2 Data sources — confirmed endpoints (review before coding starts)

| Source | Endpoint | What it gives us | Caveat |
|---|---|---|---|
| IRS e-File 990 XML (older) | `s3://irs-form-990` (no-sign-request) | Full XML, all 990 / 990-PF / 990-EZ form types, 2010–2022ish | **Lags ~1 yr; current-year IRS direct downloads tend to be Filings until they hit S3** |
| IRS direct 990 XML (current) | `https://apps.irs.gov/pub/epostcard/` mirrors + `https://www.irs.gov/charities-non-profits/form-990-series-downloads` | Recent-year (2023, 2024) bulk ZIPs | Sometimes only the 990-PF-Pro batch is current; verify before sprint 1. |
| IRSx | <https://github.com/jsfenfen/990-xml-reader> | Maintained Python parser; handles current schema versions; **handles 990-PF Part XV / Schedule I grant tables** | Python — we'll wrap it via a Node child-process OR port a TypeScript reader for the *specific subset* of fields we need (Schedule I grants paid). I lean toward the latter: we only need ~12 fields per grant, not the full taxonomy. |
| ProPublica Nonprofit Explorer API v2 | `https://projects.propublica.org/nonprofits/api/v2` | Search by EIN/NTEE/state; lists filings with XML URLs; **good for resolving peers and 990-filers (not 990-PF Schedule I directly)** | Already used by [`propublica-funders.ts`](lib/graph/propublica-funders.ts). Rate limit ~1 qps. |

**Verification work before sprint 1 starts:** spend ~half a day with `aws s3 ls s3://irs-form-990 --no-sign-request` confirming the current-year availability + sampling a 2024-filed 990-PF to lock the field paths. Will flag if any schema drift breaks our assumptions; the brief explicitly calls out this risk.

### 4.3 Pipeline architecture — bulk-ingest-then-query

```
┌─────────────────────────────────────────────────────────────────┐
│  Long-running worker (NOT a Vercel cron — 990-PF batch is too  │
│  big for the 5min maxDuration). Likely an on-demand admin       │
│  endpoint that streams from S3, plus a follow-up nightly Vercel │
│  cron that picks up incremental new filings.                    │
└─────────────────────────────────────────────────────────────────┘
  │
  ├── (1) Discovery phase
  │     For each peer in peer_orgs (CYC has 15):
  │       resolve to EIN if missing → call ProPublica filings list →
  │       enumerate the funders that file 990-PF and that might have
  │       given this peer money. Roughly: ALL active 990-PF filers in
  │       the org's state + national mega-funders. ~5K candidates for
  │       Illinois + ~50 national.
  │
  ├── (2) XML fetch + parse
  │     For each candidate funder:
  │       pull the most recent 3 years of 990-PF XML →
  │       extract Schedule I/Part XV grants-paid rows:
  │         (recipient_name, recipient_ein?, address?, amount, purpose)
  │       → push into the resolver queue.
  │
  ├── (3) Entity resolution (tiered, with Claude in the gray band)
  │     For each parsed grant edge:
  │       Tier 1: EIN-exact match against recipients.ein
  │               (already implemented, identity.ts:117). Confidence 1.0.
  │       Tier 2: NO EIN. Deterministic match on
  │               (name_jaccard > 0.85) AND (state match) AND
  │               (NTEE major-group match).
  │               Confidence = name_jaccard score. (identity.ts already
  │               does this in the 0.70..1.0 band — we tighten the
  │               threshold to 0.85 and tag confidence accordingly.)
  │       Tier 3: AMBIGUOUS — name_jaccard ∈ [0.55, 0.85) OR multiple
  │               candidates within 0.05 of each other.
  │               **Invoke Claude (Sonnet 4.6, temp 0.0) with the
  │               candidate list + the raw 990 row** → adjudicate.
  │               Claude returns either {match: id, confidence: 0.X,
  │               reason: "..."} or {match: null}. Confidence ≤ 0.85
  │               regardless.
  │       Tier 4: NO MATCH (jaccard < 0.55) → insert new recipient row
  │               with no organization_id. Future filings will dedupe
  │               via fuzzy.
  │     The new tier 3 logic lives in a new lib/graph/identity-claude.ts
  │     module that wraps identity.ts; identity.ts stays the
  │     fast deterministic path.
  │
  ├── (4) UPSERT into grants_made
  │     Existing upsertGrantsMade (lib/graph/repo.ts:201). Source =
  │     'irs_990_xml_<year>'. Confidence carries the resolver score.
  │     Idempotent across re-runs.
  │
  └── (5) Embedding pass (after a full ingest cycle)
        Per funder: build a 1536-d embedding from the funder's giving
        profile blob: { top_ntee_codes, top_states, grant_size_distribution,
                        recipient_sample_names } → embed → store in a
        new funder_embeddings table.
        Per org: build the same shape from the org's profile_data +
        peer_orgs aggregate → embed → store on the org row (column
        addition).
        Lookalike = cosine similarity against funder_embeddings.
```

### 4.4 Where the worker runs

**Not Vercel cron.** Vercel hosted Next API routes max at 5 min (Pro plan). One IRS-XML download for a single national mega-funder can be 30 MB; full Illinois 990-PF filer bulk is several GB. Two options:

**Option A — Fly.io / Railway long-running worker** (recommended).
- Dockerized Node worker. Subscribes to a `jobs.ingest_990_batch` Postgres queue (we can use `pgmq` or just a simple `pending_jobs` table).
- Vercel cron tick (`0 4 * * *`) enqueues "today's batch" (incremental new filings for changed orgs) into the queue.
- Worker pulls, processes, writes, marks done. Resumable via `ingest_state` (already exists).
- Cost: ~$5/mo Fly machine, runs in bursts.

**Option B — local-batch via Supabase Edge Function** (cheaper but more constrained).
- Edge functions have 150 sec timeout. Need to chunk aggressively. Plausible for incremental updates, awkward for the initial backfill.

**Recommendation: Option A.** Build the initial backfill (~one weekend's wall-clock) on a Fly worker, then keep the nightly tick on the same worker. The backfill is one-shot; ongoing volume is small.

### 4.5 Two outputs

#### 4.5.1 Prospects (peer-overlap-driven)
Inverse of `funder-affinity.ts`. SQL sketch:

```sql
SELECT f.id, f.name, f.funder_type,
       count(DISTINCT po.peer_recipient_id) AS peer_overlap_count,
       max(gm.fiscal_year)                  AS most_recent_year,
       avg(gm.amount)                       AS avg_amount,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY gm.amount) AS median_amount
FROM   peer_orgs po
JOIN   grants_made gm ON gm.recipient_id = po.peer_recipient_id
JOIN   funders f      ON f.id = gm.funder_id
WHERE  po.organization_id = $cyc_org_id
  AND  gm.confidence >= 0.7
  AND  NOT EXISTS (
         SELECT 1
         FROM   grants_made gm2
         JOIN   recipients  r2 ON r2.id = gm2.recipient_id
         WHERE  gm2.funder_id = f.id
           AND  r2.organization_id = $cyc_org_id
       )    -- "and not already funded CYC directly"
GROUP BY f.id, f.name, f.funder_type
ORDER BY peer_overlap_count DESC, most_recent_year DESC;
```

Rank score = `peer_overlap_count * recency_factor * grant_size_fit * geography_fit`. Each component bounded `[0, 1]`; weights revisited after a calibration pass on CYC's known wins.

#### 4.5.2 Lookalikes (embedding-driven)
Funders with zero peer overlap but high cosine similarity to CYC's profile. Always rendered as a separate tab/section — these are genuinely speculative.

### 4.6 Brief generation
Clone the [`lib/drafts/generator.ts`](lib/drafts/generator.ts) pattern (Phase 6 — already in production). Per funder card, on-demand Claude call:
- Inputs: funder's giving profile blob + the peer-overlap edges + CYC's program-area embedding tags.
- Output: 5-section structured brief: who they fund like you / typical grant size + cadence / suggested entry point / red flags / suggested ask range. Each statement wrapped in `{{cite:N}}` linking to a `grants_made.id` or filing URL — same citation discipline we use for drafts. Un-citable claims become `[TODO: confirm with funder]`.
- Cost: ~4000 output tokens per brief × Sonnet 4.6 ≈ $0.06/brief. Pre-generated lazy on first viewing per funder; cached.

### 4.7 Cost / volume projection

| Item | Volume | Cost |
|---|---|---|
| Initial backfill: IRS S3 XML downloads | ~50K 990-PF filings nationwide × 3 years | $0 (no-sign-request) |
| XML parsing | 50K filings × ~50 grants avg = 2.5M edge candidates | compute only; ~2 days wall on a Fly small instance |
| Entity resolution Tier 1+2 | ~2.5M edges, ~70% resolve deterministically | $0 |
| Entity resolution Tier 3 (Claude) | ~30% gray band = ~750K calls — **TOO MANY**, must batch | See below ↓ |
| Tier 3 batched | Group similar candidates; Claude resolves N at a time. Effective call count ~50K. Sonnet @ ~1500 in + 200 out ≈ $0.006/call | **~$300 for full backfill** |
| Embedding pass | 50K funders × 1536-d × text-embedding-3-large ≈ $0.13/1K embeddings → **~$7** | $7 |
| Brief generation | Lazy, capped at 200/month per tenant for the demo | **~$12/month** |
| Nightly incremental | ~100 new filings/night → ~5K edges → ~$0.05 Claude/night | **~$1.50/month** |
| Fly worker | always-on small VM | **~$5/month** |
| **TOTAL** | one-time backfill | **~$310** |
| **TOTAL** | per month ongoing | **~$20** |

**Hard caps in code:** every Claude call wrapped with a per-month budget check. Backfill aborts if the projected Tier 3 batch would exceed $400. Brief generation rate-limited to 10/tenant/day.

### 4.8 Schema drift / paper filers

Scope sprint 1 to:
- **In-scope:** e-filed 990-PF, 2022–present, that successfully parse against our targeted Schedule I fields.
- **Deferred to a later phase:** OCR of paper 990-PF filers (small foundations, ~5–10% of the long tail), schema drift on pre-2018 XML (Sub-Schedules renumbered).

**Surface filing year on every claim.** The grant card and the brief both render `Reported FY 2023 · Filed 2024-09 · Source: IRS 990-PF Schedule I, Part XV` next to each peer-funding edge. The team knows recency without us hand-waving "current data."

### 4.9 Hard problems — explicit handling

| Problem | Handling |
|---|---|
| Entity resolution drift | Tier 3 Claude adjudication stores `{adjudication_id, claude_reasoning, model_version}` so we can audit + replay. |
| 990-PF schema versions | Targeted-field parser is version-aware via the IRS schema version attribute. We support v1.2, v2.0, v2.1 (the three versions that cover 2018–present). Pre-2018 lives in a future phase. |
| Reporting lag | UI badge per edge: `Reported FY 2024 (filed 2025-09)`. Briefs always cite the year. |
| Cost | Hard caps in code. Backfill is one-shot; daily delta is tiny. |
| Duplicate edges across data sources | UNIQUE constraint already covers `(funder_id, recipient_id, fiscal_year, source)`. Multiple sources for the same edge live as separate rows; UI rolls them up. |
| Acceptance test reproducibility | After backfill, the engine MUST surface BofA → After School Matters as a CYC prospect *from the parsed XML, not from the seed*. We delete the seed edge before running the acceptance test to prove this. |

---

## 5. Schema migration stubs (proposed, NOT applied)

```sql
-- supabase/phase7_funder_intelligence.sql -- PROPOSED, AWAITING APPROVAL

-- ── 1. Workstream A: org → funder relationship ────────────────────────────
CREATE TABLE IF NOT EXISTS org_funder_relationships (
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  funder_id        uuid NOT NULL REFERENCES funders(id)       ON DELETE CASCADE,
  status           text NOT NULL CHECK (status IN ('existing','prospect','declined','dormant')),
  source           text NOT NULL,            -- 'self_reported' | 'derived_990' | 'manual'
  notes            text,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, funder_id)
);
ALTER TABLE org_funder_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ofr: members read own org" ON org_funder_relationships
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
CREATE POLICY "ofr: members write own org" ON org_funder_relationships
  FOR ALL TO authenticated
  USING      (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- ── 2. Workstream B: identity-resolution audit trail ─────────────────────
CREATE TABLE IF NOT EXISTS identity_adjudications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name            text NOT NULL,           -- the 990-row name we tried to resolve
  raw_ein             text,                    -- if any (often null)
  raw_state           text,
  candidate_recipient_ids uuid[] NOT NULL,
  chosen_recipient_id uuid REFERENCES recipients(id),
  tier                text NOT NULL CHECK (tier IN ('ein_exact','deterministic_fuzzy','claude','no_match')),
  confidence          numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  claude_reasoning    text,
  model_version       text,
  decided_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_adjudications_chosen_idx
  ON identity_adjudications(chosen_recipient_id);
-- No RLS — operational metadata, service-role-only.

-- ── 3. Workstream B: funder-profile embeddings (pgvector) ─────────────────
CREATE TABLE IF NOT EXISTS funder_embeddings (
  funder_id    uuid PRIMARY KEY REFERENCES funders(id) ON DELETE CASCADE,
  embedding    vector(1536) NOT NULL,
  profile_blob jsonb NOT NULL,                 -- the source text we embedded
  model        text NOT NULL DEFAULT 'text-embedding-3-large',
  computed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funder_embeddings_ivfflat_idx
  ON funder_embeddings USING ivfflat (embedding vector_cosine_ops);

-- ── 4. Workstream B: org-profile embedding column (1 col, no new table) ───
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS profile_embedding vector(1536);

-- ── 5. Workstream B: funder-intelligence cache (briefs + scores) ─────────
-- Briefs are expensive to generate; cache per (org_id, funder_id).
CREATE TABLE IF NOT EXISTS funder_intel (
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  funder_id         uuid NOT NULL REFERENCES funders(id)       ON DELETE CASCADE,
  prospect_score    numeric NOT NULL,             -- 0..1
  lookalike_score   numeric,                      -- 0..1 (nullable; only set if lookalike pass ran)
  peer_overlap_count int  NOT NULL DEFAULT 0,
  brief             jsonb,                        -- generated draft (citations + sections)
  brief_generated_at timestamptz,
  tracked_status    text CHECK (tracked_status IN ('new','pursuing','passed','contacted','meeting')),
  refreshed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, funder_id)
);
ALTER TABLE funder_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fi: members read own org" ON funder_intel
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
-- write is service-role-only (scoring/brief writes) except tracked_status which members can flip:
CREATE POLICY "fi: members update tracked_status own org" ON funder_intel
  FOR UPDATE TO authenticated
  USING      (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
```

**All idempotent. No destructive changes. None applied without your nod.**

---

## 6. Phased delivery order

| Phase | Scope | Deliverable | Acceptance |
|---|---|---|---|
| **A1** | CRA panel migration + seed update | `phase7_funder_intelligence.sql` (just §5.1 of that file) applied. `org_funder_relationships` seeded for CYC's 4 known existing banks. Huntington EIN looked up + added to `CHICAGO_BANK_FUNDERS`. BofA → ASM seed edge added. | `SELECT … FROM org_funder_relationships WHERE organization_id = '<CYC>' AND status='existing'` returns 4 rows. `SELECT * FROM grants_made WHERE funder_id = <bofa> AND recipient_id = <asm>` returns ≥ 1 row. |
| **A2** | CRA panel component + dashboard wiring | New `<CraIntelligencePanel>` + `lib/cra/intelligence.ts` repo helper. Rendered on `/dashboard` for CYC. | Manual: pull CYC dashboard, observe panel, observe BofA renders as `Prospect → Open` with "Funds 1 of your peers: After School Matters" + evidence link. |
| **A3** | Polish + mobile + empty/loading states | Skeleton, sort affordance, mobile breakpoints. | Visual review. |
| ───── | ───── *Workstream A ships here — usable demo by ~3 days in.* ───── | ───── | ───── |
| **B1** | XML schema scouting + parser | `lib/ingest/990xml/` parser for Schedule I fields. Test fixture: parse 5 hand-picked 990-PFs (Joyce, MacArthur, Polk, Crown, BofA Foundation) end-to-end. | Round-trip test: parse → expected edges match the foundation's website grantee list. |
| **B2** | Bulk-ingest worker on Fly | Dockerized worker subscribed to `pending_jobs` table. Vercel cron seeds the queue. Resumable via `ingest_state`. | Ingest 200 hand-picked Chicago-area 990-PFs. ≥ 10K edges written. ≥ 80% Tier 1+2 resolution rate. |
| **B3** | Claude adjudication tier | `lib/graph/identity-claude.ts`. Cost-capped. Writes `identity_adjudications`. | Inject 20 fixture ambiguous cases; Claude correctly adjudicates ≥ 90%. |
| **B4** | Scoring + funder-intelligence repo | SQL view + scoring function. `funder_intel` table populated for CYC. | `SELECT * FROM funder_intel WHERE organization_id = '<CYC>' AND prospect_score >= 0.5` returns BofA (or BofA Foundation EIN row). |
| **B5** | Brief generator | Clone of `lib/drafts/generator.ts` shape. Lazy per-funder; cached. | Brief for BofA cites the ASM funding edge + at least 2 other peer-funding edges + ≥ 1 IRS 990-PF link. |
| **B6** | Funder-intelligence dashboard surface | New `/intel` route (or sub-tab) listing prospects + lookalikes. Track-as-pursuing writes back to `funder_intel.tracked_status`. | Visual + functional review. |
| **B7** | Embedding lookalike pass | `funder_embeddings` populated. `organizations.profile_embedding` populated for CYC. Lookalike tab renders. | Lookalike Top 10 surfaces at least 3 funders with zero peer overlap. |

**Workstream A: ~3 days.** **Workstream B: ~3–4 weeks.** I want to ship A and pause for review before starting B1, in case the framing lands differently than the brief expects.

---

## 7. Final-self-check recap

- ☑ Phase 0 plan produced. **No feature code yet.** Awaiting approval.
- ☑ Both workstreams built on existing tables/components, with file citations throughout.
- ☑ CRA panel reframed: deepen vs. prospect, with the BofA → ASM acceptance test wired into the seed for Workstream A and reproducible from XML in Workstream B.
- ☑ 990 engine is bulk-ingest-then-query. Data sources named with caveats about schema drift. Entity resolution tiered, with Claude adjudication explicit. Confidence + evidence on every claim.
- ☑ Brief explicitly NOT trying to read CYC's funders from CYC's own filing. Direction of mining is always grantmaker → recipient.

---

## 8. Open questions for you

### Resolved by BUDGET.md (locked):

- ~~**Worker host.**~~ → **GitHub Actions cron.** $0/yr.
- ~~**Backfill scope.**~~ → **Chicago + ~50 national majors.** Saves ~$730 vs national. Doesn't degrade CYC's prospect quality.
- ~~**Lookalike tab in demo?**~~ → **Deferred.** Re-enable later if multi-tenant story justifies.

### Still open:

1. **Tier 3 confidence ceiling.** I proposed Claude-adjudicated matches cap at 0.85 confidence. Comfortable with that? Some teams want 0.95 if Claude says "yes high-confidence." I'm conservative; arguable.
2. **Huntington EIN.** Still null in [`lib/cra/seed-data.ts:135`](lib/cra/seed-data.ts). Two options: (a) I research the Huntington Bancshares Inc. EIN as part of A1, or (b) ship with the "verification pending" caveat the panel already handles, and revisit after demo. Lean toward (b) — the panel is robust to the null, and verification is a single IRS Pub 78 lookup we can do later.
3. **Brief storage policy.** Briefs cite IRS filing URLs that change ~yearly. Per BUDGET.md lever 5, we cache by `brief_edge_hash` and regenerate only when cited edges change. Want a manual "regenerate" button visible to the user too, or fully automatic?
4. **Public vs. tenant-scoped funder data.** The graph is currently `read-all-authenticated`. If we open up to multi-tenant Fundir customers, do CYC's `funder_intel` rows stay tenant-scoped (my proposed schema — already implemented this way in `phase7`) or merge with a shared layer? Assuming tenant-scoped is right unless you say otherwise.
5. **Bank of America Charitable Foundation EIN.** For the B4 acceptance test, we need to know what EIN BofA files its grants-paid 990-PF under. The retail-bank EIN (`136022000`) is what CRA AAs are filed under — but the *grantmaking entity* is usually a separate foundation. Two candidates to investigate before B4: **Bank of America Charitable Foundation Inc (EIN 56-2618866)** and **Bank of America Foundation Inc**. I'd verify against IRS Pub 78 / EDGAR before running the backfill so we ingest the right entity. **No action needed pre-A1; flagging for B4.**

**I will not start any feature code until you've reviewed §5 (schema), §6 (delivery order), and §8 (open questions).**
