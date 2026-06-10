# Fundir Design System

A specification, not a marketing page. This is the source of truth for tokens,
core components, and the visual point-of-view that distinguishes Fundir from
the grant directories we're trying to beat.

---

## POV (read this first)

Fundir is a **sharp analyst's tool**, not a directory. Every visual decision
serves that.

- **Anti-list.** Instrumentl, Candid, and GrantStation all lead with "100,000+ funders / 34,000+ active grants" as their wedge. We don't. Our screens lead with **what to do today**: 3–5 grants the org can plausibly win, ranked, with the "why" inspectable on every row. Listing more is anti-feature for us.
- **Win-focused.** "Pursue / Maybe / Skip" is a first-class visual element, not buried in a detail page. The Skip column is a feature — saying no is the value the directories can't deliver.
- **Evidence beats vibes.** Every score component is openable. Every match reason cites a concrete signal (peer funded, win rate at agency, CRA tract match). The competition shows a number; we show *why*.
- **Dense, calm.** Analyst dashboards (Bloomberg, Linear, Stripe Sigma) earned tabular figures, mono $$, and tight vertical rhythm. We adopt that register. The animated, color-blocked SaaS marketing style we saw on Instrumentl works for sign-ups; it works against trust on a daily work surface.

What we **adapt** from the audit:

| Pattern | From | Why we keep it |
|---|---|---|
| Score-as-colored-badge | Instrumentl | Cheap, scannable, dual-encodes color + number |
| Grant card with top-label (award range) | Instrumentl | The dollar figure earns its own slot above the funder name |
| Chip filter row over a left-rail facet panel | Instrumentl | Lower cognitive load for the 3–5 filters that actually matter |
| Conversational headline copy | Instrumentl | But about wins, not directory size |

What we **reject**:

| Pattern | Where seen | Why we reject |
|---|---|---|
| "Find 100,000+ funders" hero | Candid, GrantStation, Instrumentl | This is the directory positioning we're explicitly leaving behind |
| Heavy color-block marketing aesthetic | Instrumentl `/` | Reads as a sales page on a daily work surface |
| Dense facet sidebars (20+ filters) | Candid Foundation Directory | Surfaces complexity instead of decision-readiness |
| FAQ-as-design | GrantStation | A daily tool that ships an FAQ has lost the room |

---

## 1. Tokens

Tokens live in [tailwind.config.ts](tailwind.config.ts) under `theme.extend` and in CSS variables in [app/globals.css](app/globals.css). Source these — never inline a literal hex.

### 1.1 Color

Three semantic roles: **canvas, ink, action**. One narrow analyst accent ribbon (`signal`) used only for the score-evidence surfaces. No incidental colors.

| Token | Hex | Where it lives |
|---|---|---|
| `--canvas-0` | `#FAFAF7` | Page background. Off-white, slightly warm. Avoids the harshness of pure white. |
| `--canvas-1` | `#FFFFFF` | Card background. |
| `--canvas-2` | `#F2F1EC` | Secondary panels, hover rows, code-style chips. |
| `--canvas-3` | `#E5E4DE` | Borders, dividers. |
| `--ink-0` | `#0E0F11` | Primary text, headlines. Near-black, never `#000`. |
| `--ink-1` | `#3A3D44` | Secondary text. |
| `--ink-2` | `#6B6F77` | Tertiary text, captions, table secondary cells. |
| `--ink-3` | `#9CA0A7` | Disabled, placeholder. |
| `--action` | `#0A4D3C` | Primary CTA fill (deep moss-green — distinct from competitor coral/orange). |
| `--action-hover` | `#073A2D` | |
| `--action-soft` | `#E6EFEB` | Tinted background for "pursue" badges, primary chips. |
| `--signal-pursue` | `#0A4D3C` | Same as `--action` — pursue uses the action color, deliberately. |
| `--signal-maybe` | `#9A6B00` | Amber, never yellow (yellow tests poorly on off-white). |
| `--signal-skip` | `#7A1E2E` | Burgundy, not red. Skip is a thoughtful recommendation, not an alert. |
| `--signal-pursue-soft` | `#E6EFEB` | |
| `--signal-maybe-soft` | `#FBF1DC` | |
| `--signal-skip-soft` | `#F4E3E5` | |
| `--alert` | `#B0212F` | Reserved for true errors (data load failure, integration broken). NOT used for `skip`. |
| `--focus` | `#0A4D3C` | Outline-color for keyboard focus. 2px solid, 2px offset. |

**Rationale on the action color:** every direct competitor uses coral/orange or amber as their primary action (Instrumentl coral, Candid amber, GrantStation orange). Deep moss-green signals "results" without warming up the screen the way orange does, and it places us visibly outside the three-incumbent cluster.

### 1.2 Type scale

One sans family for everything. Tabular numerals for any digit that compares (scores, $, dates, counts).

| Token | Size / line-height / weight | Use |
|---|---|---|
| `display` | 32 / 36 / 600 | Page hero ("Three grants you can plausibly win this month") |
| `h1` | 24 / 30 / 600 | Section heading, grant detail title |
| `h2` | 18 / 26 / 600 | Card heading, side-panel section |
| `h3` | 15 / 22 / 600 | Inline group label |
| `body` | 14 / 22 / 400 | Default running text |
| `body-strong` | 14 / 22 / 600 | Field label, emphasized inline |
| `caption` | 12 / 18 / 500 | Secondary detail, table secondary cell |
| `eyebrow` | 11 / 16 / 600 / +0.06em / uppercase | Card top-label ("UP TO $250K", "FEDERAL · ALN 84.287") |
| `mono` | `font-variant-numeric: tabular-nums` | Applied to every $, %, date, score |

Font: stay on the system stack inherited via Tailwind (`ui-sans-serif`, `system-ui`, ...). No web font load — pages must paint in <100ms on the analyst dashboards.

### 1.3 Spacing

Restricted scale; everything composes from this. No `gap-7`, no `mt-9`.

```
1  →  4px
2  →  8px
3  →  12px
4  →  16px
5  →  20px
6  →  24px
8  →  32px
12 →  48px
16 →  64px
```

Default page gutter: `24px` desktop, `16px` mobile. Default card padding: `20px`. Default vertical rhythm between sections: `32px`.

### 1.4 Radii

| Token | px |
|---|---|
| `radius-sm` | 4 — chips, badges |
| `radius-md` | 6 — buttons, inputs |
| `radius-lg` | 10 — cards |
| `radius-xl` | 14 — hero panels, modals |

No fully-rounded (`9999px`) pills. The directories use them everywhere; we don't. Buttons are 6px-rounded rectangles, deliberately.

### 1.5 Elevation

Two shadows only. Most surfaces use borders, not shadow.

| Token | Definition |
|---|---|
| `shadow-flat` | `0 0 0 1px var(--canvas-3)` — every card by default |
| `shadow-lift` | `0 1px 2px rgb(14 15 17 / 0.06), 0 0 0 1px var(--canvas-3)` — hover, sticky headers |

### 1.6 Motion

| Token | Duration / curve |
|---|---|
| `motion-fast` | 120ms / cubic-bezier(0.4, 0, 0.2, 1) — hover, focus, color |
| `motion-base` | 200ms / cubic-bezier(0.4, 0, 0.2, 1) — opens/closes |
| `motion-slow` | 320ms / cubic-bezier(0.4, 0, 0.2, 1) — page transition |

No spring animation on data UI. No parallax. No hero animation.

---

## 2. Core components

Specs only. Implementations land in [components/ui/](components/ui/) in Phase 1E.

### 2.1 `<Card>`

Default container. `bg-canvas-1`, `radius-lg`, `shadow-flat`, padding `20px`. Borderless when nested inside another Card; bordered when freestanding.

Variants:
- `Card.Header` — `display: flex`, gap 12, items center; renders an optional eyebrow + title + right-aligned action slot.
- `Card.Section` — divider above (1px `canvas-3`), padding-top 16; vertical rhythm primitive.
- `Card.Empty` — empty-state slot, see §2.8.

### 2.2 `<ScoreBadge score={0-100} variant?>`

A 28×28 (sm) or 40×40 (lg) rounded-square badge with the composite number, optional pursue/maybe/skip color. Variants pull from `--signal-*`. Never displays decimals. Sub-70 scores switch to caption-weight to de-emphasize.

```
[ 82 ]  pursue   (--signal-pursue text, --signal-pursue-soft fill)
[ 64 ]  maybe    (--signal-maybe  text, --signal-maybe-soft  fill)
[ 41 ]  skip     (--signal-skip   text, --signal-skip-soft   fill)
```

Use `<ScoreBadge.Stack>` to show composite + matched-program tag underneath:
```
[ 82 ]
Teen Leadership
```

### 2.3 `<RecommendationPill recommendation={'pursue'|'maybe'|'skip'} reason?>`

Horizontal pill, height 24, padding-x 10, eyebrow type. Variant fills from `--signal-*-soft`, text uses `--signal-*`. Hover reveals the one-line `reason` if provided. This is the first-class visual element — every grant row carries one.

### 2.4 `<EvidenceList items={Evidence[]}>`

The signature surface. Renders the per-factor evidence (Section 3 of `PHASE_0_PLAN.md`) as a tight scannable list:

```
● 55% prior at HHS-ACF (n=12 outcomes)        historical
● Best fit for your Teen Leadership program   semantic
● 3 of 18 peers funded by this funder         funder_affinity
● Census tract qualifies for CRA              eligibility
```

Each row: leading dot (color from factor), bullet text, right-aligned faded factor tag. No row truncation — if it's worth showing, it's worth reading. Cap at 6 items; rest collapses behind "Show all evidence".

### 2.5 `<GrantCard>`

The atomic unit of the discover surface. Composition:

```
┌──────────────────────────────────────────────────────────┐
│  EYEBROW  UP TO $250K · FEDERAL · ALN 84.287   [Pursue]  │
│                                                          │
│  Grant Title (h2, two lines max)                         │
│  Funder Name                                             │
│                                                          │
│  ● 55% prior at HHS-ACF                                  │
│  ● Best fit for your Teen Leadership program             │
│  ● 3 of 18 peers funded                                  │
│                                                          │
│  Deadline · 28 days   |  [ScoreBadge 82]                 │
└──────────────────────────────────────────────────────────┘
```

Card hover: `shadow-lift` + cursor pointer. Entire card is the link to detail.

### 2.6 `<FilterBar chips={Chip[]}>`

Horizontal chip row, no left-rail. Each chip is a single dimension (Amount, Deadline, Source, Funder type, State). Click opens a small popover. Active filters render as filled chips; inactive as outlined. Includes a `Clear all` text button when ≥2 active.

Explicitly NOT a 20-facet faceted sidebar. If a filter doesn't earn a chip, it doesn't ship.

### 2.7 `<DataTable>`

For the cases where a card grid is wrong (pipeline view, reports, peer-orgs panel). Spec:

- Header row: `caption` type, `--ink-2`, uppercase, no background.
- Body rows: 56px tall, hover background `--canvas-2`, click takes you to detail.
- Right-align all numeric columns; left-align text. Mono on $ and %.
- Skip striping — rows separate via 1px `--canvas-3` borders, no zebra.
- Sticky first column on mobile.
- Empty state replaces the body entirely (Card.Empty), never an empty grid.

### 2.8 `<EmptyState icon? title body cta?>`

Used wherever a list / table / score chart has no data. Three variants:

- **`no-data`**: title leads with what they're missing ("No grants discovered yet"), body explains the path forward in one sentence, CTA is the next action ("Run a discovery pass").
- **`filtered-out`**: title says "Filtered out everything" — clears the filters rather than the data.
- **`waiting`**: title leads with what's happening ("Building your peer-funder graph…"), body cites the ETA, no CTA. Skeleton lines in `--canvas-2` for ~3 rows.

No clip-art illustration. A single 16x16 lucide icon at top, muted `--ink-2`.

### 2.9 `<RecommendationGroup pursue maybe skip>`

The win-triage primitive (Phase 6). Renders a `Pursue` heading + count + GrantCards, then `Maybe` heading + count + GrantCards, then `Skip` heading + count + collapsed by default. The Skip section is a feature — when expanded, each card shows the one-line *reason it's a skip* (eligibility hard-zero, deadline passed, funder doesn't fund this segment).

```
Pursue · 3
  [GrantCard]
  [GrantCard]
  [GrantCard]

Maybe · 7
  [GrantCard]
  ...

Skip · 14   [▸ Expand]
```

This is **the** screen Instrumentl literally can't produce, because their data layer has no notion of "why not." It needs to feel obvious.

### 2.10 Buttons

| Variant | Use |
|---|---|
| `primary` | One per surface. `--action` fill, white text, 6px radius, 40px height. |
| `secondary` | `--canvas-2` fill, `--ink-0` text. |
| `ghost` | Transparent; underline on hover. For destructive or in-row actions. |
| `link` | Inline text, `--action` color, underline on hover. |

No outline-on-white pill, no gradient.

### 2.11 Inputs

| Variant | Use |
|---|---|
| `text` | 40px height, 1px `--canvas-3` border, 6px radius, focus-ring `--focus` 2px. |
| `search` | Same, with leading `Search` icon. |
| `combobox` | Same; popover list uses Card style. |

Field labels render above (never floating). Help text below in `caption` `--ink-2`. Errors below in `caption` `--alert`.

---

## 3. POV in copy

A non-visual token. The copy register is consistent.

| Don't say | Say |
|---|---|
| "We searched 34,000+ grants" | "Three grants worth pursuing this week" |
| "Showing 1-50 of 1,287 results" | "8 fit your profile · 14 don't" |
| "Loading…" | "Re-ranking against tonight's 990 graph refresh" |
| "Score: 82" | "82 — pursue. Strong fit on Teen Leadership and 55% prior at HHS-ACF" |
| "Save grant" | "Add to pipeline" |
| Empty state: "Nothing to show" | Empty state: "No grants pass your filters yet. The morning refresh runs at 6am UTC." |

---

## 4. Phase 1E refactor targets

Phase 1E moves three screens onto this system:

1. **`/dashboard`** — the page that's open all day. Replace generic cards with the `RecommendationGroup` primitive.
2. **`/discover`** — `FilterBar` over chips, `GrantCard` grid, no facet sidebar.
3. **`/grant/[id]`** — `ScoreBadge.Stack` + `EvidenceList` lead above the fold; existing financial/notes/tasks tabs keep their structure.

Lower-traffic surfaces (`/settings`, `/onboarding`, `/reports`) are out of scope until Phase 7 polish — but new components built there must use these tokens.

---

## 5. Implementation order in Phase 1E

1. Tokens land in `tailwind.config.ts` + `app/globals.css`.
2. `components/ui/{card,score-badge,recommendation-pill,evidence-list,grant-card,filter-bar,empty-state,recommendation-group}.tsx` ship together.
3. Three target screens refactor in three commits, one per screen, so each diff is reviewable.

Nothing in Phase 2+ should accept an inline color, ad-hoc shadow, or one-off rounded value. The tokens are the contract.
