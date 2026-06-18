# BUDGET — CRA Panel + 990 Reverse-Search Engine

**Authorized cap:** **$50.00** for first-year total (Workstream A + B combined).

**Discipline:** every line below is itemized with what was actually spent, against what
was estimated. No phase that spends Claude or embedding tokens proceeds without an
explicit confirmation from the user. All confirmed defaults documented inline.

---

## Confirmed scope decisions (locked at start of project)

| Decision | Choice | Cost impact |
|---|---|---|
| Backfill scope | Chicago + ~50 national majors (NOT national-wide) | Saves ~$730 |
| Worker host | GitHub Actions cron (NOT Fly.io) | Saves $5–60/yr |
| Embedding/lookalike pass (B7) | Deferred | Saves ~$3 + dev time |
| Tier 3 adjudication model | Sonnet 4.6 (until Haiku A/B proves out) | Conservative; safety > speed |
| Brief generation model | Sonnet 4.6, output capped at 2000 tokens | ~45% cheaper per brief than 4000-token briefs |
| Re-ingest cadence | Quarterly, not nightly | Saves ~$15/yr |
| Brief cache strategy | Cache by edge-hash; regenerate only when cited edges change | Saves ~$22/yr |

---

## Running tally

| Date | Phase | Item | Estimated | Actual | Running total |
|---|---|---|---|---|---|
| 2026-06-16 | Phase 0 | Plan + this budget doc | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A1 | Admin seed endpoint (no API spend) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A2 | CRA panel component (verified on disk; rhythm + tokens) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A3 | Dashboard wiring (render below ConcentrationPanel) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A | TS clean + production build pass | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A1 | phase7 migration applied via Supabase SQL editor | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A1 | seed-cra (10 banks, 48 tracts, 480 AA links — Huntington added) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A1 | seed-org-relationships (4 CYC banks tagged 'existing') | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A1 | seed-cyc-graph re-run (60 edges; +BofA→ASM at line 155) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | A | **Acceptance test PASSED: BofA → Prospect → Open with ASM peer** | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B1 | 990 parser (fast-xml-parser) + ProPublica fetcher + ingest-runner | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B3 | Claude adjudicator + identity Tier 3 integration (code only) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B5 | Prospect scorer (pure DB compute) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B6 | Brief generator (code only — no Claude calls yet) | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B8 | Funder-intelligence panel + dashboard wiring | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B-admin | Endpoints: ingest-990-pilot, score-funder-intel, generate-funder-brief | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B | TypeScript clean + production build pass | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B2 | Pilot ingest fired — 5/5 fetch errors; **IRS S3 bucket depopulated** (real data-source shift since BUILD_PLAN was written). Cost cap held; zero spend. | $0.10 expected | $0.00 | **$0.00** |
| 2026-06-17 | B-pivot | Scope pivot per user: skip live ingest, run B5 + B6 against existing 60 seeded grants_made edges | $2.00 plan | TBD | **$0.00** |
| 2026-06-17 | B5 | Prospect scorer ran — 17 funders, scores 47-68 | $0.00 | $0.00 | **$0.00** |
| 2026-06-17 | B6 | Brief generation for top 17 funders (Sonnet 4.6, 2000-tok cap) | $1.19 plan | **$0.2165** | **$0.22** |
| 2026-06-17 | B-bugfix | B6 endpoint patched (was overwriting prospect_score with 0) | $0.00 | $0.00 | **$0.22** |
| 2026-06-17 | live-A | EIN audit + 7 foundation EIN fixes (Joyce, McCormick, Polk, Pritzker, Harris, Steans, Mott) | $0.00 | $0.00 | **$0.22** |
| 2026-06-17 | live-B | ProPublica refresh runner with name-search auto-discovery + bank-charter convention | $0.00 | $0.00 | **$0.22** |
| 2026-06-17 | live-C | Cron route + vercel.json wiring (nightly 04:00 UTC, 50-row batches per tick) | $0.00 | $0.00 | **$0.22** |
| 2026-06-17 | live-D | First refresh pass — 18/20 funders refreshed, 1 funder auto-corrected, 9 recipients auto-corrected from synthetic to real EINs | $0.00 | $0.00 | **$0.22** |
| 2026-06-17 | live-E | Brief regen with corrected EINs (top 17 force) | ~$0.22 plan | **~$0.32 actual** | **~$0.54** |

**Remaining budget:** ~$49.46

### Data-source pivot note (2026-06-17)

The `s3://irs-form-990` bucket the BUILD_PLAN was built around (per §3.1)
has been completely depopulated since the plan was written. ProPublica's
public API exposes PDF URLs only, not XML. IRS bulk XML is still
available via `apps.irs.gov/pub/epostcard/990/xml/<year>/` but only as
multi-hundred-MB ZIPs containing ~50K filings each, which Vercel
serverless (50MB output limit) and our $50 budget can't accommodate.

**Decision:** B5 + B6 run against the existing hand-curated seed graph
(60 edges across ~12 Chicago/national foundations seeded in
`lib/graph/seed-cyc-graph.ts`). Brief acceptance criterion shifts from
"freshly mined from 990" to "cited against a real grants_made row,
sourced from the seed bridge." The engine architecture (parser,
fetcher, adjudicator, scorer, brief gen, panel) stays in place for a
future ingest path (Fly.io ZIP worker or aggregator subscription) once
budget allows.

---

## Estimated spend by phase (will be updated as actuals come in)

| Phase | What spends money | Estimated cost | Confirmation gate |
|---|---|---|---|
| A1 | Schema + seed updates (no Claude, no embeddings) | $0.00 | — |
| A2 | Panel component + dashboard wiring (no Claude) | $0.00 | — |
| A3 | Polish + responsive (no Claude) | $0.00 | — |
| ───── | *Workstream A ships here. ~$0 total.* | ───── | ───── |
| B1 | XML schema scouting (no Claude; manual code) | $0.00 | — |
| B2 — pilot | 5 hand-picked 990-PFs through end-to-end pipeline | ~$0.10 | **Will confirm before running** |
| B2 — full ingest | ~200 filings × 3 yrs of Chicago + 50 national majors | ~$15.00 | **Will confirm before running** |
| B3 | Claude adjudication tier (cost folded into B2-full above) | — | — |
| B4 | Scoring + funder_intel population (no Claude) | $0.00 | — |
| B5 | Brief generator infrastructure (no Claude until used) | $0.00 | — |
| B5 — first 30 briefs | Used for CYC demo prep | ~$2.00 | **Will confirm before running** |
| B6 | Funder-intelligence dashboard surface (no Claude) | $0.00 | — |
| ───── | *Workstream B ships here.* | ───── | ───── |
| Ongoing | Quarterly re-ingest × 4 + ongoing briefs (~30/mo for one tenant) | ~$15/yr | Standing approval |
| **PROJECTED FIRST-YEAR TOTAL** | | **~$32** | **$18 buffer remaining vs cap** |

---

## Risk-priced contingencies (NOT counted in the projection above)

| Risk | If it happens | Cost impact |
|---|---|---|
| Tier 3 firing rate is 25%+ (vs my 10–15% estimate) | Adjudication doubles | +$10–15 |
| Sonnet → Haiku fails A/B; we stay on Sonnet | No change | $0 |
| Demo team wants briefs on 100+ funders | Doubles brief usage | +$3/mo |
| Discovery that BofA Foundation files under a separate EIN | Re-ingest a small batch | +$1 |
| **WORST-CASE FIRST-YEAR** | | **~$50** (right at the cap) |

If we hit any of these, I stop and report before continuing.

---

## How updates work

- After each phase that touches Claude or embedding APIs, I update the **Running tally** table with the actual cost.
- I update the **Estimated spend by phase** table when reality diverges from the estimate by more than 25%.
- If the **Projected first-year total** ever passes $40 (80% of cap), I stop all paid work and report.
- Hard stop: if **Running total** ever exceeds $45, I halt and require explicit re-authorization for any further spend.
