# Fundir / CYC Internal Model — Development Plan

_Status: proposal for review. Last updated 2026-08-31._

This document is the methodical plan for how we train and develop an internal
"Fundir/CYC" model on CYC's proprietary data (its grant history, operational
spreadsheets, financials, and funder/board relationships). It is grounded in the
system as it actually exists today — not a greenfield sketch.

---

## 0. The honest starting point

There is **no trained model in the product today.** Every number the platform
produces is one of three things:

1. **Fixed-weight heuristic scoring.** `composite_score` is a hand-tuned linear
   blend of six factors (`lib/matching.ts` → `computeMatchScore`):
   `semantic 0.32 · eligibility 0.20 · financial 0.18 · affinity 0.12 ·
   strategic 0.12 · historical 0.06`, ×100. The weights are already
   DB-configurable per segment (`segments.factor_weights`).
2. **Embeddings retrieval.** OpenAI `text-embedding-3-large` (1536-dim) in
   Supabase pgvector (HNSW, cosine). Grants and per-program org profiles are
   embedded; `nearest_grants*` RPCs do top-K.
3. **Claude prompts.** All generation/extraction/advisor work runs on
   `claude-sonnet-4-6` (`lib/agent/*`, discovery extraction, drafts).

The **only labeled outcome signal** is `org_outcomes` (awarded/rejected, written
by a pipeline-stage trigger), which today feeds a Beta-smoothed win rate
(`lib/win-rate-bayes.ts`). It is **sparse**, and CYC is a **single organization.**

### What that means (the part we must not cut a corner on)

You cannot responsibly train a supervised ML model — let alone fine-tune an LLM —
on tens of labeled examples from one org. It would memorize noise, report
flattering offline metrics, and mislead a nonprofit board that (rightly) trusts
the current transparent scoring. So the plan is deliberately sequenced:

> **Data infrastructure and retrieval first. Learned scoring second, gated on a
> real label count. Generative fine-tuning last, and only if it beats a good
> prompt library.**

The proprietary moat is not "a model" — it is **CYC's structured outcome history +
operational metrics + financial truth + the funder/peer graph.** The model is
what we harvest from that asset _once it exists in trainable form._

---

## 1. What "the model" is — three distinct things

People say "the model" to mean three different systems. We should build them in
this order, because their data requirements differ by orders of magnitude:

| # | System | What it does | Data needed | Feasible now? |
|---|--------|--------------|-------------|---------------|
| A | **Win-probability / match model** | Replace the linear blend with a calibrated P(award \| applied) | Labeled outcomes (`org_outcomes`) | **Not yet** — too few labels. Build the pipeline; flip it on at a threshold. |
| B | **Retrieval-augmented advisor (RAG)** | Ground the Claude advisor in CYC's own docs/metrics/history | Unlabeled proprietary text (already have it) | **Yes — highest near-term value.** |
| C | **Generative fine-tune (CYC voice)** | Draft narratives in CYC's approved style | A corpus of CYC-approved winning narratives | **No** — prefer a prompt+retrieval library first. |

The rest of this plan treats B as the immediate build, A as the instrumented
"coming online" track, and C as explicitly deferred.

---

## 2. Proprietary data inventory, provenance, gaps

| Asset | Where it lives today | Trainable form? | Gap to close |
|-------|----------------------|-----------------|--------------|
| **Outcome labels** (awarded/rejected) | `org_outcomes` (trigger-written) | Partially | Too few rows. Backfill CYC's real historical submissions + results. |
| **Operational metrics** | OneDrive Excel `CYC Data Collection.xlsx` (`HubRow`: Submitted, Site, Period, Metric, Value, Notes) — **source of truth**, not in Postgres | No | Must snapshot Graph → a versioned training table; never train off live Excel. |
| **Financial ground truth** | Hardcoded TS constants (`lib/cyc-live-data.ts`, `CYC_FINANCIAL_PROFILE`) | No | Migrate to a structured, versioned store; treat salaries/PII as sensitive. |
| **Grant corpus + embeddings** | `grant_opportunities` (+ `embedding vector(1536)`) | Yes | Reusable feature source. |
| **Funder graph** | `funders / recipients / grants_made` (ProPublica 990 + seeds) | Yes | `funder_embeddings` provisioned but unused. |
| **Peer set** | `peer_orgs` (hand-curated) | Yes | Small; drives affinity. |
| **Board/relationships** | Prompt-only constants (`CYC_BOARD`, `CYC_LEADERSHIP`) | No | Not modeled in DB; needed for network mapping. |

**Provenance is clean and auditable** (Grants.gov, ProPublica 990, adapters,
Claude identity adjudication with logged cost). That auditability is a feature we
must preserve in anything learned.

---

## 3. Data pipeline & governance (do this before any modeling)

This is where "methodical" matters most, because the inputs are proprietary.

1. **Snapshot, don't stream-train.** The OneDrive workbook is mutable truth. A
   scheduled job pulls it via Microsoft Graph (`lib/data-hub.ts`) into a
   **versioned, timestamped** table (`training_snapshots`), so every training run
   is reproducible and we never train against a moving target.
2. **Define the label precisely.** Positive = `awarded`; negative = `rejected`;
   `submitted`/`pending` = **censored** (exclude or model as time-to-event, never
   silently treat as negative). Guard against **leakage**: no feature may encode
   information available only after the outcome (e.g., award amount).
3. **Feature spec versioning.** Freeze the six extractors + their sub-signals
   behind a `feature_spec_version`. Predictions log which spec + model version
   produced them (extends today's transparency).
4. **Tenant isolation.** Training jobs run server-side under the service role,
   **scoped to one org**. Proprietary CYC rows never cross tenants. Cross-org
   learning is **OFF by default** (see §6).
5. **PII discipline.** Board member names, staff salaries, and financial internals
   are excluded from any external API call unless strictly required, and never
   used as model features without an explicit decision.
6. **Reproducibility.** Each model artifact records: `training_snapshot_id`,
   `feature_spec_version`, dataset row count, metrics, and hyperparameters.

---

## 4. Modeling approach — phased

### Phase 1 — Instrument + RAG advisor (build now; needs no labels)

- **Backfill outcomes.** Import CYC's real historical grant submissions and their
  results into `org_outcomes` (this needs your records — see §8). This is the
  single highest-leverage act: it converts anecdote into a dataset.
- **Materialize training examples.** A job writes `training_examples(org_id,
  grant_id, features jsonb, label, applied_at, outcome_at, snapshot_id,
  feature_spec_version)` for every historical match with a known outcome. Even
  before we train, this makes the asset real and inspectable.
- **RAG for the advisor.** Index CYC's proprietary docs (990s, financials, past
  narratives, Data Hub metrics) into pgvector; add a `retrieve_cyc_context` tool
  to the agent (`lib/agent/tools.ts`). This improves grounding **without any
  training** and is the fastest visible win.

### Phase 2 — Learned scoring (turn on when labels justify it)

- **Model class:** start with **regularized logistic regression**, then
  **gradient-boosted trees** — interpretable, small-N tolerant, and they output
  **calibrated probabilities** (Platt/isotonic). Explicitly **not** a neural net.
- **Target:** `P(award | applied)`, reusing the existing six extractors as
  features plus raw sub-signals.
- **Serving without Python at runtime:** train offline, store the resulting
  coefficients/trees in a `model_registry` row; `computeMatchScore` gains a
  `learned` mode that reads the active model and blends/replaces the heuristic.
  The linear blend stays as the cold-start fallback.
- **Gate:** do not activate until a pre-registered threshold of labeled examples
  and a passing eval (see §5). Until then it runs in **shadow mode** only.

### Phase 3 — Funder look-alike / affinity

- Activate `funder_embeddings` + `organizations.profile_embedding`. Use graph
  features from `grants_made` (who funds CYC's peers) to rank funder→CYC fit.
  This is where the 990 board/giving graph pays off for prospecting.

### Phase 4 — Generative CYC voice (deferred, optional)

- Only once a corpus of CYC-approved winning narratives exists. **Prefer a
  prompt+retrieval library first** (cheaper, updatable, auditable). Consider a
  fine-tune only if it demonstrably beats that library on held-out drafts.

---

## 5. Evaluation & monitoring (non-negotiable before any switch)

- **Temporal split.** Train on older applications, test on newer — never random
  split (funder behavior drifts yearly).
- **Metrics.** AUC/PR-AUC for ranking, **calibration curves** (a nonprofit needs
  honest probabilities, not just ranking), precision@k over the live pipeline,
  and the business metric: hit-rate of the top-N recommendations.
- **Shadow mode.** Compute the learned score alongside the heuristic for weeks,
  log both, and compare against realized outcomes **before** it influences any UI.
- **Ablation.** Show each factor's marginal contribution — preserves the "explain
  the score" property the board relies on.
- **Drift & freshness monitoring.** Alert on funder-behavior drift, stale 990
  data, and per-site/per-program-area skew.
- **Human-in-the-loop.** The development director reviews; their corrections are
  captured as new labels, closing the loop.

---

## 6. Privacy, security, tenant isolation (explicit)

- **RLS stays service-role-only.** All training/serving runs server-side, per org.
- **Cross-org learning: default OFF.** If we ever want shared structure (e.g.,
  federal program base rates), learn it only from **de-identified aggregates**;
  CYC-specific signals never leave the tenant.
- **External API transparency.** Document exactly what is sent to OpenAI
  (embedding input text) and Anthropic (prompt content). Use no-retention /
  enterprise terms. **Never** send salaries or board PII. Provide a path to a
  **local embedding model** so proprietary text can stay fully in-house if
  required — this removes the last external dependency for sensitive content.
- **Auditability.** Every prediction logs model + feature-spec + snapshot version,
  so any score is fully reconstructable.

---

## 7. Concrete Phase-1 build (what lands first in this repo)

New/changed pieces, all additive and reversible:

- **Migrations:** `training_snapshots`, `training_examples`, `model_registry`,
  `predictions_log` (all `service_role_only` RLS).
- **Snapshot job:** Graph → `training_snapshots` (versioned Data Hub pull).
- **Feature export:** materializes the six factors + sub-signals per historical
  match with a known outcome into `training_examples`.
- **Outcome backfill importer:** ingest CYC's real submission history → `org_outcomes`.
- **RAG tool:** `retrieve_cyc_context` added to the agent, backed by pgvector over
  CYC docs/metrics.
- **Serving hook (dormant):** `computeMatchScore` learns a `learned` mode reading
  `model_registry`; ships **disabled**, shadow-logging only.
- **Eval harness:** temporal-split report (AUC, calibration, precision@k).

No user-facing score changes until §5 passes. The heuristic remains the source of
truth throughout Phase 1.

---

## 8. Open decisions (I need these to proceed)

1. **Label volume.** How many past CYC grant submissions with known
   outcomes can we assemble, and in what form (spreadsheet, PDFs, memory)? This
   single number decides whether Phase 2 is a real learned model or "better-
   calibrated Bayesian weights until N grows."
2. **External-API privacy posture.** Is OpenAI/Anthropic usage acceptable under
   no-retention/enterprise terms, or do you want a **local embedding model** now
   so proprietary text never leaves our infrastructure?
3. **Cross-org learning.** Confirm per-CYC-only for now (recommended), revisit at
   multi-tenant scale.
4. **Green-light Phase 1.** Approve the data-infrastructure + RAG build so the
   proprietary asset becomes trainable and the advisor gets grounded immediately.
