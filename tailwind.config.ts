import type { Config } from 'tailwindcss'

// ════════════════════════════════════════════════════════════════════════════
// Fundir Design System tokens. See DESIGN_SYSTEM.md for the POV + rationale.
//
// The `canvas/ink/action/signal/alert/focus` token names are the contract
// going forward. The legacy `brand/surface/border/ink/score` tokens are
// kept as a transitional layer so existing screens compile during the
// Phase 1E refactor — they get dropped once every screen migrates.
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
        // ── Design system tokens (DESIGN_SYSTEM.md §1.1) ─────────────────
        canvas: {
          0: '#FAFAF7',   // page
          1: '#FFFFFF',   // card
          2: '#F2F1EC',   // panel / hover row / code chip
          3: '#E5E4DE',   // border / divider
        },
        ink: {
          DEFAULT: '#0E0F11',  // primary text / display
          0: '#0E0F11',
          1: '#3A3D44',        // secondary
          2: '#6B6F77',        // tertiary, captions
          3: '#9CA0A7',        // disabled, placeholder
          // legacy aliases kept until Phase 1E migrations finish:
          dim:   '#3A3D44',
          faint: '#9CA0A7',
        },
        action: {
          DEFAULT: '#0A4D3C',
          hover:   '#073A2D',
          soft:    '#E6EFEB',
        },
        signal: {
          pursue:      '#0A4D3C',
          'pursue-soft':'#E6EFEB',
          maybe:       '#9A6B00',
          'maybe-soft':'#FBF1DC',
          skip:        '#7A1E2E',
          'skip-soft': '#F4E3E5',
        },
        alert: {
          DEFAULT: '#B0212F',
        },
        focus: {
          DEFAULT: '#0A4D3C',
        },

        // ── Legacy tokens (DO NOT USE in new code) ───────────────────────
        // Instrumentl-derived teal. Replaced by `action` + `canvas`. Kept
        // so the existing screens build during Phase 1E migration; removed
        // once /dashboard, /discover, /grant/[id] all read from the new
        // tokens.
        brand: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        surface: {
          DEFAULT: '#f8fafc',
          card:    '#ffffff',
          hover:   '#f1f5f9',
          subtle:  '#f8fafc',
        },
        border: {
          DEFAULT: '#e2e8f0',
          strong:  '#cbd5e1',
        },
        score: {
          high:   '#16a34a',
          medium: '#d97706',
          low:    '#dc2626',
        },
      },
      fontFamily: {
        // System stack — see DESIGN_SYSTEM.md §1.2 (no web font load).
        sans: [
          'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'Helvetica', 'Arial', 'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Design-system type scale (size · line-height).
        // Weight is applied via Tailwind utilities (`font-semibold`, etc).
        display:  ['32px', { lineHeight: '36px', letterSpacing: '-0.01em' }],
        h1:       ['24px', { lineHeight: '30px' }],
        h2:       ['18px', { lineHeight: '26px' }],
        h3:       ['15px', { lineHeight: '22px' }],
        body:     ['14px', { lineHeight: '22px' }],
        caption:  ['12px', { lineHeight: '18px' }],
        eyebrow:  ['11px', { lineHeight: '16px', letterSpacing: '0.06em' }],
      },
      boxShadow: {
        // Two shadows only — DESIGN_SYSTEM.md §1.5
        flat: '0 0 0 1px #E5E4DE',
        lift: '0 1px 2px rgb(14 15 17 / 0.06), 0 0 0 1px #E5E4DE',
        // legacy:
        card:  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        panel: '0 4px 12px rgba(0,0,0,0.08)',
        drop:  '0 10px 30px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        DEFAULT: '6px',  // md
        sm:  '4px',      // chips, badges
        md:  '6px',      // buttons, inputs
        lg:  '10px',     // cards
        xl:  '14px',     // hero panels, modals
      },
      transitionTimingFunction: {
        ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
    },
  },
  plugins: [],
}
export default config
