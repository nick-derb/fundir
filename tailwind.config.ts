import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Instrumentl-inspired primary teal
        brand: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',   // primary CTA
          700: '#0f766e',   // hover
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // Page backgrounds
        surface: {
          DEFAULT: '#f8fafc',  // main bg
          card:    '#ffffff',  // card/panel bg
          hover:   '#f1f5f9',  // row hover
          subtle:  '#f8fafc',  // subtle section bg
        },
        // Borders
        border: {
          DEFAULT: '#e2e8f0',
          strong:  '#cbd5e1',
        },
        // Text hierarchy
        ink: {
          DEFAULT: '#0f172a',  // primary text
          dim:     '#475569',  // secondary text
          faint:   '#94a3b8',  // placeholder / disabled
        },
        // Status colors
        score: {
          high:   '#16a34a',   // green
          medium: '#d97706',   // amber
          low:    '#dc2626',   // red
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        panel: '0 4px 12px rgba(0,0,0,0.08)',
        drop:  '0 10px 30px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
        xl: '14px',
      },
    },
  },
  plugins: [],
}
export default config
