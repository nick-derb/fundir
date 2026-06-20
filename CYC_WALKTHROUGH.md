# Fundir — CYC walkthrough

A guided tour for the Chicago Youth Centers grant team. Every claim
below is grounded in code that's live on `main` right now. Where a
differentiator is called out vs. Instrumentl / Candid / GrantStation,
it's because I can point to a specific file or query the directories
don't publicly expose; nothing is invented.

Login: `nickderbis@gmail.com` → lands you in CYC2026 (the tenant
where all the data lives).

---

## 1. `/dashboard` — the daily landing surface

**Where to look:** [app/dashboard/page.tsx](app/dashboard/page.tsx) +
[components/concentration-panel.tsx](components/concentration-panel.tsx) +
[components/ui/recommendation-group.tsx](components/ui/recommendation-group.tsx)

What CYC sees, top-to-bottom:

1. **KPI row** — 4 tiles: opportunities tracked, average match score, total
   award potential (score ≥ 60), urgent deadlines (≤ 14 days). Driven by
   match_results — no fake numbers.

2. **Funding-concentration panel** (Phase 6). A stacked bar showing CYC's
   actual revenue mix from the FY25 audit (75% government, 17% private,
   3% program, 5% other) + HHI concentration index (59/100 — concentrated
   band) + two **Elevated** risk flags with concrete remediation text:
   - *"75% of revenue is government grants. Build the
     private/foundation pipeline. The corpus has indexed foundation
     opportunities aligned to your segment — start cultivation now to
     absorb a federal cut."*
   - *"2.4 months of operating reserves. Healthy benchmark is 3-6
     months. Reimbursement-based federal awards (most of the corpus)
     compound the cash strain; prioritize foundation grants with advance
     payment terms."*
   - Source: [lib/discovery/concentration.ts](lib/discovery/concentration.ts) computes both
     metrics and flags; CYC's actual financial_data drives the numbers.

3. **Win-triage view** — Pursue / Maybe / Skip, not a single long list.
   - With CYC's current 197 matches: 0 in Pursue band (≥ 70), ~50 in
     Maybe (50-69), ~140 in Skip (< 50).
   - Skip section is collapsed by default. **Expanding it reveals each
     skipped grant with the reason it was skipped, inline** —
     [components/ui/grant-card.tsx](components/ui/grant-card.tsx) renders the
     `rationale` prop right below the funder name. The directories
     don't expose "why not." Saying no is the value.

> **Differentiator vs. Instrumentl:** their dashboard ranks every match
> by composite score in a single descending list. Fundir's bucketed
> view + skip rationale means CYC's grant manager can drop the bottom
> half of the list in 60 seconds rather than scroll through 197 rows.

---

## 2. `/discover` — natural-language search across the unified corpus

**Where to look:** [app/discover/page.tsx](app/discover/page.tsx) +
[components/nl-search.tsx](components/nl-search.tsx) +
[app/api/search/route.ts](app/api/search/route.ts)

The search input takes plain English — *"unrestricted operating grants
under $250K closing in 60 days"*, *"foundation grants for community
programs"* — and runs:

1. **Claude parses** the query into a structured filter (`min_award`,
   `max_award`, `geographic_states`, `deadline_days`, `funder_types`)
   + a cleaned semantic query ([app/api/search/route.ts:51-72](app/api/search/route.ts#L51-L72)).
2. **OpenAI embeds** the cleaned query.
3. **pgvector retrieves** the top-K nearest grants from the unified corpus
   using HNSW cosine ([supabase/tier1b_corpus_search.sql](supabase/tier1b_corpus_search.sql)).
4. **Structured post-filter** applies the parsed constraints
   ([app/api/search/route.ts:127-180](app/api/search/route.ts#L127-L180)).

The corpus today is **201 grants** mixing:
- Federal NOFOs from Grants.gov
- 13 Chicago Metro foundations (Joyce, McCormick, Crown, Polk Bros.,
  Steans, Pritzker Traubert, Chicago Community Trust, etc.)
- 157 live Illinois GATA opportunities (real, scraped nightly from
  omb.illinois.gov as of [Phase 5B](lib/adapters/illinois-gata-adapter.ts))
- 7 region-curated adapters (DFSS, Cook County, ISBE — hand-curated seeds)

> **Differentiator vs. Instrumentl:** their search is faceted-filter +
> keyword; ours is one freeform input that mixes a Claude parse with
> semantic retrieval. *And* the state/foundation corpus is layered
> alongside federal in one ranked feed.

---

## 3. `/grant/[id]` — the evidence-backed match detail page

**Where to look:** [app/grant/[id]/page.tsx](app/grant/[id]/page.tsx) +
[lib/match-reasons.ts](lib/match-reasons.ts) +
[components/ui/evidence-list.tsx](components/ui/evidence-list.tsx)

The hero block, score arc, and tabs are familiar shapes. The piece
that's actually different from any directory is the **"Why it's a
match"** card on the Overview tab — backed by `EvidenceList` with
factor-keyed colored dots.

For a typical CYC grant like
[Promise Neighborhoods](https://www.fundir.ai/grant/cac78ca0-7e08-495f-8838-f0c2f2db5a8e),
the bullets that render are concrete and citable:

```
● Best fit for your Teen Leadership program           (semantic)
● 501(c)(3) nonprofits are explicitly eligible        (eligibility)
● Targets low-income youth, high-poverty communities  (population)
● Your South Chicago site qualifies as low-income     (eligibility / CRA)
  (CRA-eligible tract)
● 9 banks legally serve your tract under CRA —        (strategic / CRA)
  JPMorgan Chase Bank, N.A. and Bank of America,
  N.A. plus 7 more
● 6 of your 15 peer orgs were funded by the Joyce     (strategic / 990 graph)
  Foundation in the last 3 years
```

These bullets are not curated copy. Each one is computed live:

- **The CRA bank-funder bullet** comes from the join between CYC's
  primary census tract (`17031480500` — South Chicago) and the
  `bank_assessment_areas` table populated in
  [Phase 4A](supabase/phase4_cra_layer.sql). 432 bank×tract AA edges
  are currently live; only the ones covering CYC's tract surface.

- **The LMI-eligibility bullet** fires when (a) CYC's primary tract is
  LMI per FFIEC designation [verified in lib/cra/seed-data.ts](lib/cra/seed-data.ts) AND
  (b) the grant's `extracted_fields.requires_lmi` is true (Claude
  flagged it explicitly per the [Phase 4 cont prompt](lib/extraction.ts)).
  Then the matcher adds a +0.15 boost on eligibility — see
  [lib/matching.ts:118-126](lib/matching.ts#L118).

- **The peer-funded bullet** runs the funder-affinity factor against
  the hand-curated 990 graph (15 CYC peers, 59 funder→peer edges)
  ingested by [lib/graph/seed-cyc-runner.ts](lib/graph/seed-cyc-runner.ts).
  The factor formula is in [lib/factors/funder-affinity.ts](lib/factors/funder-affinity.ts):
  `0.50 × peer_funded_share + 0.30 × focus_overlap + 0.20 × in_region + 0.15 × cra_aa_covers_tract`.

> **Differentiator vs. Instrumentl:** Instrumentl's match score is one
> number with a brief rationale. Fundir surfaces the **factor-keyed
> reasons that produced the score**, anchored to public 990 / FFIEC /
> CRA data they don't ingest. The bank-funder bullet in particular is
> a class of funder no directory exposes — banks are legally on the
> hook for LMI investing in their assessment areas (Community
> Reinvestment Act, 1977), and matching a nonprofit's service tract to
> a bank's AA is a relationship no other tool reverse-engineers.

---

## 4. `/financials` — CYC's own audit, surfaced as decision support

**Where to look:** [app/financials/page.tsx](app/financials/page.tsx) +
[components/cyc-financials-shell.tsx](components/cyc-financials-shell.tsx) +
[lib/cyc-live-data.ts](lib/cyc-live-data.ts)

CYC gets a custom shell (line 54-61 of the page) seeded from the
audited FY2025 statements — total revenue $13.4M, government grants
74.6%, 2.4 months of liquidity, the operating deficit, the federal
program portfolio (Head Start cluster, 21st CCLC, CACFP, HUD-MTW, SSBG)
with the political-risk rating on each.

Six tabs:
- **Overview** — health score, intelligence flags
- **Income Statement** — line items, revenue vs. expense detail
- **Balance Sheet** — assets, liabilities, net assets
- **Programs** — Early Childhood / OST / Teen Leadership analysis with
  funding gaps
- **Capital & Board** — $40M capital campaign progress, $5M endowment,
  board composition
- **Sites & Impact** — 7 program sites mapped, youth-served outcomes

Plus three workflow tabs:
- **AI Analyzer** — upload a document, get Claude-grounded analysis
  ([components/financial-analyzer.tsx](components/financial-analyzer.tsx))
- **Documents** — library of past uploads / drive-synced narratives
- **Strategy Brief** — generate a board-facing one-pager

> **Differentiator vs. Instrumentl:** they don't reverse-screen the
> applicant's own 990 at all. Fundir's matching engine
> ([lib/990-screener.ts](lib/990-screener.ts)) checks each grant's
> stated requirements (cost-share, audit, min budget, indirect cap)
> against CYC's actual numbers and surfaces hard-stops before CYC
> wastes a week on an application.

---

## 5. `/reports` — operational analytics over real pipeline data

**Where to look:** [app/reports/page.tsx](app/reports/page.tsx) +
[components/reports-charts.tsx](components/reports-charts.tsx)

KPIs at the top: total awarded $, win rate, pipeline value, average
grant size. Below: stage funnel (Discovered → Reviewing → Preparing →
Drafting → Submitted → Awarded), score distribution histogram, score
vs. win-rate correlation.

Worth knowing: the charts hide gracefully when CYC has no awarded or
submitted history yet — lines 81-89 of the page explicitly fall back to
empty arrays rather than fake demo data.

---

## 6. The crons

Three scheduled jobs run nightly on Vercel ([vercel.json](vercel.json)):

| Time (UTC) | Job | Cost |
|---|---|---|
| 02:30 | [`ingest-region-sources`](app/api/cron/ingest-region-sources/route.ts) — pulls live GATA portal + region-seeded adapters | <$0.02/night (embeddings only) |
| 06:00 | [`refresh-corpus`](app/api/cron/refresh-corpus/route.ts) — discovers new federal grants from Grants.gov | ~$0.40/night when enabled (currently **gated off** via `REFRESH_CORPUS_ENABLED`) |
| 08:00 | [`ingest-funders`](app/api/cron/ingest-funders/route.ts) — populates `funders` table from ProPublica | Free (ProPublica is free) |

All three are bearer-gated against `CRON_SECRET` and idempotent.

---

## 7. Recent changes since the demo build (this session)

| Commit | What landed |
|---|---|
| [e9f73fa](https://github.com/nick-derb/fundir/commit/e9f73fa) | Phase 3A+3B: `peer_orgs` table + 15 CYC peers + 59 hand-curated funder→peer edges |
| [c18824b](https://github.com/nick-derb/fundir/commit/c18824b) | Phase 3C+3D: foundation ingestion into `grant_opportunities` + funder-affinity factor wired into the matcher |
| [e61e4b6](https://github.com/nick-derb/fundir/commit/e61e4b6) | Phase 5B: live scraper for Illinois GATA (replaces the 3-row SEED with 157 live opportunities pulled from omb.illinois.gov via cheerio) |
| [a6e6913](https://github.com/nick-redb/fundir/commit/a6e6913) | Phase 5B-cont: nightly cron at 02:30 UTC that re-runs the region adapters and embeds only new entries |
| [e9a01ba](https://github.com/nick-derb/fundir/commit/e9a01ba) | Theme fix: `/financials` and `/reports` were hard-coded to a dark page background regardless of light mode; both now use `var(--fin-page-bg)` which respects the active theme |

After the rescore that followed Phase 3C+3D + 5B, **CYC went from 30
ranked matches to 197**, with 45 grants picking up the CRA boost and
13 foundations now scoring on the funder-affinity graph.

---

## 8. The honest list of what isn't there yet

This guide doesn't fabricate, so the things below are explicitly **not
live** today:

- **Draft generation** — the schema and source-of-truth assembler are
  written but the Claude generator + UI haven't shipped. (In progress
  this session — Phase 6 follow-up.)
- **DFSS + Cook County scrapers** — both city/county pages relocated in
  the 2026 chicago.gov / cookcountyil.gov restructure; their new
  funding-listing URLs need a manual walk to identify before a scraper
  can ship.
- **Public 990-PF Schedule I PDF parsing** — the recipient-detail data
  inside the actual filing PDFs isn't ingested yet. The 13 foundation
  funders + 59 edges currently in `grants_made` are hand-curated.
- **Real-time competitor cross-reference** — Fundir doesn't pull
  Instrumentl's database. Comparisons in this guide are based on
  publicly available product behavior captured during the Phase 1D
  competitor audit; they're not running diffs.

---

## How to walk this for a CYC grant-team demo

Suggested 10-minute path:

1. **Open `/dashboard`.** Lead with the concentration panel — *"this is
   CYC's actual revenue mix from the FY25 audit; the matcher knows
   you're 75% govt and prioritizes private/foundation cultivation as a
   diversification target."*
2. **Scroll to win-triage.** Expand the Skip section. *"Every directory
   we've benchmarked lists all matches by score. Ours separates the
   12-grant Maybe list from the 140-grant Skip list, with the reason
   each is a skip rendered inline — so this 60-second scan tells you
   what to ignore."*
3. **Open the top Pursue/Maybe row** (currently DFSS Youth Services at
   63.4). The Why-It's-a-Match list is the centerpiece.
4. **Then `/discover`.** Type *"unrestricted operating grants under
   $250K closing in 60 days"*. Show the parse + the result ranking.
5. **Open Promise Neighborhoods** (federal, LMI-targeted). The bank-
   funder bullet + LMI-tract bullet are the wedge. Walk through what
   each one literally means.
6. **Close on `/financials`.** Open the Federal Programs section and
   point out the political-risk rating on Head Start + 21st CCLC.
   *"The matcher reads this when scoring grants; the financial verdict
   on the right-rail of each grant detail page tells you whether you
   can absorb a reimbursement-based federal award given current
   reserves."*

That sequence shows the four things the directories can't:
unified-corpus search, win-triage with skip reasoning, CRA + 990-graph
evidence, and reverse-990 financial screening.
