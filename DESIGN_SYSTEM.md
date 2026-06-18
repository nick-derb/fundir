# Fundir Design System — v2 "Operations Console"

A specification, not a marketing page. This is the source of truth for tokens,
core components, and the visual point-of-view that distinguishes Fundir from
the grant directories we're trying to beat.

---

## POV

Fundir is an **operations console** for grant teams — precise, dense-but-calm,
instrument-grade. References: Palantir Foundry, Bloomberg Terminal, Linear,
Stripe Sigma. The opposite of a generic AI-built dashboard.

- **Anti-list.** Instrumentl, Candid, GrantStation all lead with "100,000+
  funders". We don't. Our screens lead with **what to do today**: a small set
  of ranked, justified opportunities, every "why" inspectable on every row.
  Listing more is anti-feature.
- **Win-focused.** "Pursue / Maybe / Skip" is a first-class visual element,
  with a quiet eyebrow + semantic dot + mono count — not a buried detail.
- **Evidence beats vibes.** Every score component opens. Every match reason
  cites a concrete signal. The competition shows a number; we show *why*.
- **Dense, calm.** Tabular figures, mono $$, tight vertical rhythm. The
  animated, color-blocked SaaS marketing style works against trust on a daily
  work surface.

---

## §1 — Tokens

Single source of truth: CSS variables in [`app/globals.css`](app/globals.css),
mapped onto Tailwind utility names in [`tailwind.config.ts`](tailwind.config.ts).
Both light and dark are produced from one token set.

### §1.1 Color

#### Ink scale — cool graphite neutrals (never pure gray/black/white)

| Token | Hex | Role |
|---|---|---|
| `--ink-900` | `#0B1220` | Dark-mode page bg; light-mode primary text/display |
| `--ink-800` | `#131C2E` | Dark-mode card surface |
| `--ink-700` | `#1E2A40` | Dark-mode elevated/inset |
| `--ink-600` | `#33425C` | Muted text (light) |
| `--ink-500` | `#5A6B86` | Secondary text |
| `--ink-400` | `#8696AE` | Tertiary text, dark-mode secondary |
| `--ink-300` | `#B6C2D4` | Stronger separators |
| `--ink-200` | `#DCE3ED` | Hairline border |
| `--ink-100` | `#EEF2F7` | Elevated surface (hover row, code chip) |
| `--ink-50`  | `#F6F8FB` | Page background |
| `--surface` | `#FFFFFF` | Card surface |

#### Role tokens (resolve via theme)

```
Light                              Dark
--bg-page         = ink-50         ink-900
--bg-surface      = surface        ink-800
--bg-elevated     = ink-100        ink-700
--border-hairline = ink-200        rgba(255,255,255,.08)
--text-primary    = ink-900        ink-100
--text-secondary  = ink-500        ink-400
--text-tertiary   = ink-400        ink-500
--text-muted      = ink-600        ink-300
```

#### Brand accent — deepened, NOT default emerald

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent`        | `#0C6B5A` | `#1A8B77` | Primary actions, active nav, KPI emphasis. Sparingly. |
| `--accent-hover`  | `#0A5648` | `#15917A` | Button hover |
| `--accent-bright` | `#15917A` | `#2BAB95` | Active nav text in dark mode |
| `--accent-tint`   | `rgba(12,107,90,.10)` | `rgba(26,139,119,.18)` | Citation chip background, selection |

#### Semantic — desaturated, signal-only

| Token | Light | Dark |
|---|---|---|
| `--success`  | `#2F9E6E` | `#3FB07F` |
| `--warning`  | `#C0852B` | `#D4A152` |
| `--critical` | `#C24E3E` | `#D86B5C` |
| `--info`     | `#3E6CA8` | `#5F8DC9` |

**Each semantic is used as:**
- a 3px **left border** on the card row
- a small **uppercase tag** (text-color only, no fill)
- and/or text — with a `~8% tint` background **only** when a fill is truly needed

**Never** as a full-saturation solid-fill status card.

### §1.2 Typography

| Family | Token | Used for |
|---|---|---|
| Geist (sans) | `var(--font-geist-sans)` | All UI prose, headings, labels |
| Geist Mono   | `var(--font-geist-mono)` | All numerals — $, scores, confidence, EINs, dates, IDs, % |

Loaded via `next/font` in [`app/layout.tsx`](app/layout.tsx). All mono text
sets `font-variant-numeric: tabular-nums` so columns of numbers align.

**Scale** (Tailwind utility · size/leading · weight · tracking)

| Utility | px / lh | Weight | Tracking | Use |
|---|---|---|---|---|
| `text-display` | 30 / 34 | 600 | -0.02em | Big hero numbers (rare) |
| `text-h1`      | 22 / 28 | 600 | -0.01em | Page titles |
| `text-h2`      | 17 / 24 | 600 | — | Section headlines |
| `text-h3`      | 15 / 22 | 600 | — | Sub-section |
| `text-body`    | 14 / 22 | 400 | — | Body prose |
| `text-body-strong` | 14 / 22 | 500 | — | Emphasized labels in tables |
| `text-data`    | 14 / 20 | 500 | — | (mono) Inline data cells |
| `text-kpi`     | 28 / 32 | 600 | -0.01em | (mono) KpiCard value |
| `text-caption` | 12 / 18 | 400 | — | Secondary line under headings |
| `text-eyebrow` | 11 / 14 | 600 | 0.08em | UPPERCASE section labels (`text-secondary`) |

### §1.3 Shape, border, elevation

- **Radius:** `8px` default, `6px` for chips/inputs/buttons. `rounded-full`
  only for avatars and status dots. **No pill-shaped buttons.**
- **Borders:** 1px hairline everywhere — `border-hairline`. Visible separators
  use `border-strong`.
- **Elevation = surface tint, NOT shadow.** Static cards have a 1px hairline
  border and no shadow. The only shadow token is `shadow-overlay` —
  `0 1px 2px rgba(11,18,32,.06), 0 4px 12px rgba(11,18,32,.05)` — used
  **only** for floating popovers and menus.

### §1.4 Spacing

4px base. Steps `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`. Card padding `20–24`.
Section gap `24–32`. Content max-width `max-w-content` (1280px).

### §1.5 Motion

```
--motion-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1)
--motion-base: 200ms cubic-bezier(0.4, 0, 0.2, 1)
--motion-slow: 320ms cubic-bezier(0.4, 0, 0.2, 1)
```

Transitions on `background-color`, `color`, `transform`. Never on `opacity`
for things meant to convey state — opacity changes hide state.

---

## §2 — Component patterns

### §2.1 KpiCard

`bg-surface border border-hairline rounded-sm` · padding `px-4 py-3` · contents:

```
[eyebrow uppercase text-secondary  ]   ← label, e.g. "Tracked"
[font-mono text-kpi  text-primary  ]   ← value, e.g. "197"
[text-caption text-tertiary        ]   ← caption, e.g. "12 high-match"
```

Optional `tone="success" | "warning" | "critical" | "info"` adds a 3px left
border in that semantic color. Tones are **value judgements** — most KPIs
leave it off (a count of "tracked grants" carries no signal on its own).

Reference: [`app/dashboard/page.tsx`](app/dashboard/page.tsx) → `<KpiCard>` helper.

### §2.2 Quiet section heading

For Pursue / Maybe / Skip, dashboard sub-sections, and panel sub-divisions.

```
[●] EYEBROW LABEL  font-mono count
```

- 1.5px semantic dot
- `text-eyebrow uppercase text-primary` label
- `font-mono text-caption text-secondary` count

Used by [`<RecommendationGroup>`](components/ui/recommendation-group.tsx).

### §2.3 Quiet uppercase status tag (text only, no fill)

For relationship state (Existing / Prospect / Declined / Dormant), action verb
(Deepen / Open / Monitor), tracked_status, etc. Color reads from the text
token; no chip background.

```
text-eyebrow uppercase tracking-wider text-{success|accent|tertiary|...}
```

### §2.4 Risk-flag row (3px left border + uppercase tag)

The pattern for any severity-bearing row — concentration risk flags, financial
intelligence flags, validation warnings.

```html
<li class="flex items-start gap-3 pl-3 border-l-[3px] border-l-warning">
  <span class="text-eyebrow uppercase text-warning">Elevated</span>
  <div>
    <div class="text-body-strong text-primary">Metric headline</div>
    <div class="text-caption text-secondary">Remediation copy</div>
  </div>
</li>
```

Never use a full-saturation fill card. Severity reads from border + tag.

### §2.5 Confidence / score with mono number + thin track bar

For CRA panel confidence, ScoreBreakdown bars, any 0-100 signal:

```
[mono number, right-aligned, w-24]
[thin 4px bar: bg-elevated, fill bg-accent at value%]
```

Reference: `<BankRow>` in [`components/cra-intelligence-panel.tsx`](components/cra-intelligence-panel.tsx).

### §2.6 Table-style row (CRA, Funder Intelligence)

Grid layout with hairline dividers; sticky-style header row in
`text-eyebrow uppercase text-tertiary border-b border-hairline bg-elevated/40`.
Columns right-aligned for numerics, left-aligned for prose.

### §2.7 Citation chip + Unverified field tag (briefs)

- **Citation chip:** mono superscript number, `bg-accent-tint text-accent`,
  hovers to `bg-accent text-accent-on`. Click → source URL.
- **Unverified field tag:** muted text with `<Info>` icon, never alarming red.
  Hidden by default behind a "Show unverified fields" toggle
  ([`components/funder-brief-detail.tsx`](components/funder-brief-detail.tsx)).
  The honesty stays in the data; it just shouldn't look like leftover scaffolding.

### §2.8 Sidebar nav — active = accent text + 2px left bar

No filled pill. Active link:

```css
.shell-nav-active {
  color: var(--nav-active-text);   /* accent */
  font-weight: 500;
}
.shell-nav-active::before {
  content: '';
  position: absolute;
  left: -10px; top: 6px; bottom: 6px;
  width: 2px;
  background: var(--nav-active-bar);
}
```

### §2.9 Win-triage (Pursue / Maybe / Skip)

Three sections; each with the §2.2 quiet header. Skip is collapsed by default
— and that's the differentiator: directories can't ship "why not".

---

## §3 — Charts

- Bars scale to actual values; **no equal-length bars** for distinct numbers.
- 1px baselines, no gridlines on bar charts (only horizontal for line charts).
- **No gradients, no shadows** on chart elements.
- **≤1 accent + neutrals** per chart. Pipeline stage strips: one accent (the
  active / destination state), `ink-300 / ink-400 / ink-500` for the others.
- Direct labels on bars, not legends.

Reference: pipeline distribution bar in [`app/dashboard/page.tsx`](app/dashboard/page.tsx);
HHI precision scale in [`components/concentration-panel.tsx`](components/concentration-panel.tsx).

---

## §4 — Hard rules (the "AI-built" tells we remove)

1. **No drop shadows on static cards** → hairline borders + tint steps.
2. **No default-emerald** → `--accent` only.
3. **No saturated solid-fill status cards** → 3px semantic left border + tag.
4. **One radius system** → no mixing pills + rounded + sharp.
5. **All data in mono tabular numerals.**
6. **One icon set, one stroke weight, consistent sizing** (Lucide,
   `w-3.5 h-3.5` chrome / `w-4 h-4` interactive).
7. **Light is the default theme.** Dark works from the same tokens.
8. **WCAG AA contrast**, visible focus states (2px accent outline).

---

## §5 — Migration & legacy

The token system in [`globals.css`](app/globals.css) and
[`tailwind.config.ts`](tailwind.config.ts) defines the new vocabulary
(`bg-page / bg-surface / bg-elevated`, `border-hairline`, `text-primary`,
`accent`, `success/warning/critical/info`) **and** keeps every legacy alias
mapped to the new tokens, so unmigrated screens keep building:

- `canvas-0/1/2/3` → `bg-page / bg-surface / bg-elevated / border-hairline`
- `ink-0/1/2/3`     → `text-primary / text-muted / text-secondary / text-tertiary`
- `action / action-hover / action-soft` → `accent / accent-hover / accent-tint`
- `signal-pursue / signal-maybe / signal-skip` → `success / warning / critical`
- `shadow-flat / shadow-card / shadow-lift` → flattened to a 1px ring (no shadow)

Aliases drop after every screen is migrated. The reference implementation as
of Phase 0 is `/dashboard` + the AppShell — see §6 for the files to read.

---

## §6 — Files

| Layer | File |
|---|---|
| Tokens (runtime) | [`app/globals.css`](app/globals.css) |
| Tokens (Tailwind mapping) | [`tailwind.config.ts`](tailwind.config.ts) |
| Font load | [`app/layout.tsx`](app/layout.tsx) |
| Global shell | [`components/app-shell.tsx`](components/app-shell.tsx) |
| Reference screen | [`app/dashboard/page.tsx`](app/dashboard/page.tsx) |
| Panel: HHI precision scale + risk flags | [`components/concentration-panel.tsx`](components/concentration-panel.tsx) |
| Panel: CRA table-style list + thin track | [`components/cra-intelligence-panel.tsx`](components/cra-intelligence-panel.tsx) |
| Panel: Funder Intelligence + Unverified toggle | [`components/funder-intelligence-panel.tsx`](components/funder-intelligence-panel.tsx) + [`components/funder-brief-detail.tsx`](components/funder-brief-detail.tsx) |
| Quiet section headers | [`components/ui/recommendation-group.tsx`](components/ui/recommendation-group.tsx) |

---

## §7 — Phase 0 acceptance gates (Dashboard reference)

Before extending Phase 1+ to other screens, the following must hold on
`/dashboard` in **both** light and dark:

- [x] No drop shadows on static cards
- [x] No default-emerald (`#0d9488`); accent is `--accent`
- [x] No solid-fill status cards — flags read as 3px left border + uppercase tag
- [x] One radius system — `rounded-sm` everywhere; `rounded-full` only on
      avatars / status dots
- [x] All data displayed in mono tabular numerals
- [x] Light is the default theme (`localStorage` default flipped)
- [x] Org name not truncated in sidebar (two-line treatment with tooltip)
- [x] Active nav = accent text + 2px left bar (no filled pill)
- [x] Quiet section headers with mono counts (no clipped triage banner)
- [x] Urgent Deadlines day badge color rule: `≤1d` critical, `≤7d` warning,
      else neutral
- [x] `[TODO: ...]` markers hidden by default; "Show unverified fields"
      toggle reveals muted "Unverified" tags inline
- [x] `tsc --noEmit` clean
- [x] `next build` succeeds
- [x] No runtime console errors at 1440 / 1024 / 390 px
