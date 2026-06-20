# DATA_SOURCES — what's live vs. what's seeded

Every panel surface on the CYC dashboard is powered by a mix of live API
calls, scheduled refreshes from public data sources, and hand-curated
seed data. This doc tells you which is which so you can audit any claim
the UI surfaces.

**Header rule:** the component code is always read-only against the
Postgres DB. Nothing is baked into a React component. The interesting
question is where the DB rows come from.

---

## Live (refreshes automatically)

| Surface | Live source | Refresh cadence | Implementation |
|---|---|---|---|
| Funder metadata: assets, last filing year, NTEE, city, state | ProPublica Nonprofit Explorer API v2 | Nightly 04:00 UTC, 30 funders + 20 recipients per tick (5-day full rotation) | [`lib/graph/refresh-from-propublica.ts`](lib/graph/refresh-from-propublica.ts) → cron at [`app/api/cron/refresh-propublica/route.ts`](app/api/cron/refresh-propublica/route.ts) |
| Recipient (peer) metadata: same fields as funders | ProPublica Nonprofit Explorer API v2 | Same nightly tick | Same runner; recipient half of the loop |
| EIN auto-discovery (heals wrong EINs from seed) | ProPublica search API + name+state match heuristic | On every refresh tick — any 404 triggers a name-search and a high-confidence auto-correction | Same runner. Confirmed self-healing: 9 synthetic EINs auto-corrected on the first pilot pass (1 funder + 8 peers). |
| State / local grant opportunities (DFSS, Cook County JAC, ISBE, GATA) | Live scrapers against `chicago.gov`, `cookcountyil.gov`, `omb.illinois.gov` | Nightly 02:30 UTC | [`lib/adapters/*-adapter.ts`](lib/adapters/) → cron at `/api/cron/ingest-region-sources` |
| Federal grant opportunities | Grants.gov API | Nightly 06:00 UTC | `/api/cron/refresh-corpus` |
| Foundation index (NTEE-T orgs by state) | ProPublica Nonprofit Explorer | Nightly 08:00 UTC | `/api/cron/ingest-funders` |
| Match scoring (composite score per grant × tenant) | OpenAI text-embedding-3-large for semantic similarity + DB join for the other 5 factors | Recomputed when a new opportunity or new grants_made edge lands; manual rescore via admin endpoint | `lib/factors/funder-affinity.ts` + `lib/discovery/rescore.ts` |
| Match recommendation text on grant detail | Claude Sonnet 4.6 on every grant detail page load | Per-request | `app/grant/[id]/page.tsx` |
| Funder briefs (prospect cards) | Claude Sonnet 4.6, cached by edge-hash | Regenerated only when underlying `grants_made` edges change; manual force-regen via admin endpoint | [`lib/funder-intel/brief-generator.ts`](lib/funder-intel/brief-generator.ts) |

## Refreshed periodically (manual or quarterly)

| Surface | Source | Refresh cadence | Notes |
|---|---|---|---|
| Bank list (10 Chicago-metro banks with CRA exposure) | FDIC Institution Directory | Currently manual seed | Bank entities are stable; refresh not yet automated. Source data in [`lib/cra/seed-data.ts`](lib/cra/seed-data.ts). |
| Bank CRA assessment areas | FFIEC CRA flat file (annual) | Currently county-level approximation per seed; FFIEC AA flat file ingestion is Phase 4b (not yet built) | [`lib/cra/seed-data.ts`](lib/cra/seed-data.ts) declares the assumption. |
| LMI tract designations | FFIEC tract LMI file (annual) | Currently 7 verified CYC-site tracts + 33 extrapolated; FFIEC flat file ingestion is Phase 4b | [`lib/cra/seed-data.ts:170-254`](lib/cra/seed-data.ts) |

## Seeded (hand-curated for CYC demo)

| Surface | Source | Why seeded | Path to live |
|---|---|---|---|
| **CYC's 15 peer organizations** | Hand-curated based on CYC's own org strategy | Peer identification is fundamentally an org-strategy assertion ("these 15 orgs are like us"). Each tenant defines its own. | A "manage peers" UI for the org admin lets them edit. Future. |
| **CYC's 4 existing bank relationships** (Northern Trust, BMO, Wintrust, Huntington) | Hand-curated from the project brief | Self-attestation: only the org knows which funders they actually have a working relationship with | [`lib/cra/seed-relationships.ts`](lib/cra/seed-relationships.ts). Members can edit via [`app/api/admin/seed-org-relationships`](app/api/admin/seed-org-relationships) or the future relationship-edit UI. |
| **Funder → peer grant edges** (60 edges in `grants_made`) | Hand-curated from foundation annual reports + ProPublica nonprofit 990 PDFs + CRA disclosures | **The 990-PF bulk-XML data source the BUILD_PLAN was built around (`s3://irs-form-990`) has been depopulated by AWS / the IRS open data registry.** Without bulk XML, on-demand fetching per filing isn't feasible (each ZIP is 300+ MB containing 50K filings; Vercel's 50MB output cap blocks it). | Three real paths: (a) Fly.io worker that processes IRS ZIPs (~$5/mo); (b) Aggregator API subscription (~$50+/mo); (c) Wait for AWS/IRS to restore bulk-XML S3 access. The B-workstream code (parser, fetcher, adjudicator, scorer) is ready to flip on when any of these unlocks. |

---

## "EIN convention" notes

The 10 Chicago-metro banks in `funders` use the **bank-charter EIN**
(e.g. Bank of America N.A. = EIN 13-6022000). This EIN refers to the
operating bank, not the bank's charitable foundation (BofA Charitable
Foundation = EIN 56-2618866). The grant edges in `grants_made` from
these bank funders represent **attributed CRA program giving** —
historically reported in the bank's CRA Performance Evaluation rather
than a separate 990. The bank-charter convention means:

- The ProPublica refresh runner intentionally **skips** these rows
  (their metadata carries `ein_convention: 'bank_charter'`) — bank
  EINs don't resolve in ProPublica's nonprofit DB.
- The CRA Intelligence panel surfaces them correctly via FDIC ID +
  CRA assessment area data, not via 990 lookup.
- If you want literal foundation-attributed edges (BofA Charitable
  Foundation → ASM rather than BofA N.A. → ASM), the path is to add a
  separate `funder` row for the foundation and migrate the edges.

---

## How to audit

To verify any claim the funder-intelligence panel shows for a given org:

```sql
-- See every refresh state for a funder
SELECT name, ein, metadata->'pp_last_refreshed' AS refreshed,
       metadata->'ein_verified' AS verified,
       metadata->'ein_convention' AS convention
FROM funders ORDER BY name;

-- See which briefs are stale
SELECT f.name, fi.brief_generated_at, fi.brief_edge_hash IS NOT NULL AS cached
FROM funder_intel fi JOIN funders f ON f.id = fi.funder_id
WHERE fi.organization_id = (SELECT id FROM organizations WHERE org_code = 'CYC2026')
ORDER BY fi.prospect_score DESC;

-- Manual refresh trigger
POST /api/admin/refresh-propublica
  Authorization: Bearer <CRON_SECRET>
  body: { "funder_limit": 50, "recipient_limit": 50 }
```
