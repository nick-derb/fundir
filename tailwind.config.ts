import type { Config } from 'tailwindcss'

// ════════════════════════════════════════════════════════════════════════════
// Fundir Design System — Phase 2 "Operations Console" tokens.
//
// Color utilities map onto CSS variables defined in app/globals.css.
// This file is the contract between component code (Tailwind utility
// classes) and the runtime token system. The new utility names map
// directly to the brief's token vocabulary:
//
//   bg-page / bg-surface / bg-elevated     → page bg, card surface, panel inset
//   border-hairline / border-strong         → 1px hairlines + visible separators
//   text-primary / text-secondary           → text roles
//   ink-50 … ink-900                        → raw graphite scale (use sparingly)
//   accent / accent-hover / accent-bright   → brand accent
//   success / warning / critical / info     → semantic, used as left border + tag
//
// Legacy aliases (canvas/ink-0..3/action/signal/brand/surface/border/score)
// are kept so unmigrated screens compile during the screen-by-screen rollout.
// They all resolve to the same CSS variables as the new tokens.
// ════════════════════════════════════════════════════════════════════════════

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Surfaces ────────────────────────────────────────────────────
        page:     'var(--bg-page)',
        surface:  'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        subtle:   'var(--bg-subtle)',

        // ── Borders ─────────────────────────────────────────────────────
        hairline: 'var(--border-hairline)',
        'border-strong': 'var(--border-strong)',

        // ── Text roles ──────────────────────────────────────────────────
        primary:   'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary:  'var(--text-tertiary)',
        muted:     'var(--text-muted)',
        inverse:   'var(--text-inverse)',

        // ── Ink scale — full graphite range ─────────────────────────────
        ink: {
          DEFAULT: 'var(--text-primary)',
          50:  '#F6F8FB',
          100: '#EEF2F7',
          200: '#DCE3ED',
          300: '#B6C2D4',
          400: '#8696AE',
          500: '#5A6B86',
          600: '#33425C',
          700: '#1E2A40',
          800: '#131C2E',
          900: '#0B1220',
          // legacy aliases kept for unmigrated code (resolve to text roles):
          0:    'var(--text-primary)',
          1:    'var(--text-muted)',
          2:    'var(--text-secondary)',
          3:    'var(--text-tertiary)',
          dim:   'var(--text-muted)',
          faint: 'var(--text-tertiary)',
        },

        // ── Brand accent ────────────────────────────────────────────────
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          bright:  'var(--accent-bright)',
          tint:    'var(--accent-tint)',
          on:      'var(--accent-on)',
        },

        // ── Semantic signal colors ──────────────────────────────────────
        success:  { DEFAULT: 'var(--success)',  tint: 'var(--success-tint)'  },
        warning:  { DEFAULT: 'var(--warning)',  tint: 'var(--warning-tint)'  },
        critical: { DEFAULT: 'var(--critical)', tint: 'var(--critical-tint)' },
        info:     { DEFAULT: 'var(--info)',     tint: 'var(--info-tint)'     },

        // ──────────────────────────────────────────────────────────────────
        // LEGACY ALIASES — same vars as above, named for unmigrated code.
        // ──────────────────────────────────────────────────────────────────
        canvas: {
          0: 'var(--bg-page)',
          1: 'var(--bg-surface)',
          2: 'var(--bg-elevated)',
          3: 'var(--border-hairline)',
        },
        action: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          soft:    'var(--accent-tint)',
        },
        signal: {
          pursue:        'var(--success)',
          'pursue-soft': 'var(--success-tint)',
          maybe:         'var(--warning)',
          'maybe-soft':  'var(--warning-tint)',
          skip:          'var(--critical)',
          'skip-soft':   'var(--critical-tint)',
        },
        alert: { DEFAULT: 'var(--critical)' },
        focus: { DEFAULT: 'var(--focus-ring)' },
        brand: {
          50:  '#F6F8FB',
          100: '#EEF2F7',
          500: 'var(--accent)',
          600: 'var(--accent)',
          700: 'var(--accent-hover)',
        },
        surfaceLegacy: {
          DEFAULT: 'var(--bg-page)',
          card:    'var(--bg-surface)',
          hover:   'var(--bg-elevated)',
          subtle:  'var(--bg-page)',
        },
        border: {
          DEFAULT: 'var(--border-hairline)',
          strong:  'var(--border-strong)',
        },
        score: {
          high:   'var(--success)',
          medium: 'var(--warning)',
          low:    'var(--critical)',
        },
      },

      fontFamily: {
        // Geist sans + mono are loaded via next/font in app/layout.tsx
        // and exposed as CSS variables. Fall back to the system stack so
        // the page still renders if the font ever fails to load.
        sans: [
          'var(--font-geist-sans)',
          'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'Helvetica', 'Arial', 'sans-serif',
        ],
        mono: [
          'var(--font-geist-mono)',
          'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace',
        ],
      },

      fontSize: {
        // Operations-console type scale (size · line-height · tracking).
        display:        ['30px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1:             ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        h2:             ['17px', { lineHeight: '24px', fontWeight: '600' }],
        h3:             ['15px', { lineHeight: '22px', fontWeight: '600' }],
        body:           ['14px', { lineHeight: '22px' }],
        'body-strong':  ['14px', { lineHeight: '22px', fontWeight: '500' }],
        data:           ['14px', { lineHeight: '20px', fontWeight: '500' }],
        kpi:            ['28px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        caption:        ['12px', { lineHeight: '18px' }],
        eyebrow:        ['11px', { lineHeight: '14px', letterSpacing: '0.08em', fontWeight: '600' }],
      },

      borderRadius: {
        // One radius system — no pills (except via rounded-full for avatars).
        DEFAULT: '8px',
        sm:      '6px',
        md:      '8px',
        lg:      '8px',
        xl:      '8px',
        pill:    '9999px',
      },

      boxShadow: {
        // Per brief: NO drop shadows on static cards. The only shadow
        // is `overlay` for floating popovers/menus.
        overlay: 'var(--shadow-overlay)',
        // Legacy aliases — all flatten to a 1px hairline ring or no-op
        // so unmigrated `shadow-flat` / `shadow-card` etc. visually
        // simplify to "no shadow" without crashing the build.
        flat:  '0 0 0 1px var(--border-hairline)',
        lift:  '0 0 0 1px var(--border-hairline)',
        card:  '0 0 0 1px var(--border-hairline)',
        panel: '0 0 0 1px var(--border-hairline)',
        drop:  'var(--shadow-overlay)',
      },

      transitionTimingFunction: {
        ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },

      maxWidth: {
        content: '1280px',
      },
    },
  },
  plugins: [],
}
export default config
