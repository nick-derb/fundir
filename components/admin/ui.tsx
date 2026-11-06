// Shared building blocks for the admin console: one header, one card, one
// table skin, one set of pills. Everything here is server-safe (no event
// handlers), so any admin page can stay a Server Component. Row hover is CSS
// (`.adm-row`), injected once by app/admin/layout.tsx.

import type { ReactNode, CSSProperties } from 'react';

export const ADMIN_CSS = `
.adm-table{width:100%;border-collapse:collapse}
.adm-table th{padding:10px 16px;text-align:left;font-size:11.5px;font-weight:700;color:#475569;white-space:nowrap;background:rgba(0,0,0,.18);border-bottom:1px solid rgba(255,255,255,.07)}
.adm-table td{padding:12px 16px;font-size:13px;color:#cbd5e1;vertical-align:middle;border-top:1px solid rgba(255,255,255,.04)}
.adm-table tbody tr:first-child td{border-top:none}
.adm-row{transition:background .1s}
.adm-row:hover{background:rgba(255,255,255,.025)}
.adm-link{color:#0d9488;text-decoration:none;font-weight:600;font-size:11.5px}
.adm-link:hover{text-decoration:underline}
.adm-page{padding:32px 40px;max-width:1240px}
@media (max-width:900px){.adm-page{padding:20px 16px}}
`;

export const CARD: CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  overflow: 'hidden',
};

export const MONO: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' };

/** Page header: eyebrow, title, one-line summary, optional right-side slot. */
export function AdminHeader({ title, summary, eyebrow = 'Admin console', right }: { title: string; summary?: ReactNode; eyebrow?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 26 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ ...MONO, fontSize: 11.5, fontWeight: 700, color: '#475569', margin: '0 0 6px' }}>{eyebrow}</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
        {summary && <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0', lineHeight: 1.5 }}>{summary}</p>}
      </div>
      {right && <div style={{ flex: 'none' }}>{right}</div>}
    </div>
  );
}

/** Card with an optional titled header strip. */
export function Card({ title, subtitle, action, children, style }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ ...CARD, marginBottom: 20, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 11.5, color: '#64748b', margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Small uppercase tag. tone: neutral | accent | good | warn | bad | info */
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info' }) {
  const c = {
    neutral: ['rgba(148,163,184,0.10)', 'rgba(148,163,184,0.22)', '#94a3b8'],
    accent:  ['rgba(13,148,136,0.10)', 'rgba(13,148,136,0.25)', '#2dd4bf'],
    good:    ['rgba(34,197,94,0.10)', 'rgba(34,197,94,0.22)', '#4ade80'],
    warn:    ['rgba(251,191,36,0.10)', 'rgba(251,191,36,0.25)', '#fbbf24'],
    bad:     ['rgba(239,68,68,0.10)', 'rgba(239,68,68,0.22)', '#f87171'],
    info:    ['rgba(129,140,248,0.10)', 'rgba(129,140,248,0.25)', '#a5b4fc'],
  }[tone];
  return (
    <span style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', background: c[0], border: `1px solid ${c[1]}`, color: c[2], whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

/** Empty-state block for a card body. */
export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '36px 20px', textAlign: 'center', fontSize: 13, color: '#64748b' }}>{children}</div>;
}

/** KPI tile. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div style={{ ...CARD, padding: '16px 18px' }}>
      <p style={{ ...MONO, fontSize: 11.5, fontWeight: 700, color: '#64748b', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: tone ?? '#f1f5f9', margin: '8px 0 2px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11.5, color: '#64748b', margin: 0 }}>{sub}</p>}
    </div>
  );
}

/** Relative time, with an absolute fallback past 30 days. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
