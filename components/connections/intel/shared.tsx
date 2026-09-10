'use client';

// Shared primitives for the Connections console (Phase 8). One CSS string, a
// handful of typographic atoms, the type/confidence palette, and the score
// glyphs. Everything reads the app's tokens so light and dark both work.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PipelineState } from '@/lib/network/queries';

export const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
export const SANS = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
export const MONO = "'JetBrains Mono',ui-monospace,monospace";
export const AMBER = '#9C7A2A';
export const SLATE = '#5B7383';
export const INFO = '#3E6CA8';

export const CSS = `
.ni-root{--radius-kpi:12px;--radius-console:14px;font-family:${SANS};color:var(--text-primary);background:var(--bg-page);min-height:60vh}
.ni-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.ni-root .fd-kpi{font-family:${MONO};font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.ni-root .fd-mono,.ni-peek .fd-mono{font-family:${MONO};font-variant-numeric:tabular-nums}
.ni-root .fd-caption,.ni-peek .fd-caption{font-size:12px;line-height:1.5}
.ni-root button,.ni-peek button{font-family:inherit}
@keyframes ni-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes ni-peek-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@keyframes ni-flash{0%{background:var(--accent-tint)}100%{background:transparent}}
@keyframes ni-pulse{0%,100%{opacity:.35}50%{opacity:.8}}
.ni-rise{animation:ni-rise .32s cubic-bezier(.2,.8,.2,1) both}
.ni-row{transition:background-color .14s,box-shadow .14s;cursor:pointer;outline:none}
.ni-row:hover{background:var(--bg-elevated)}
.ni-row[data-active="true"]{background:var(--bg-elevated);box-shadow:inset 2px 0 0 var(--accent)}
.ni-row:focus-visible{box-shadow:inset 2px 0 0 var(--accent),inset 0 0 0 1px var(--accent-tint)}
.ni-bar{height:4px;border-radius:2px;background:var(--score-track);overflow:hidden}
.ni-bar > i{display:block;height:100%;border-radius:2px;transform-origin:left;transform:scaleX(var(--w,0));transition:transform .7s cubic-bezier(.2,.8,.2,1)}
.ni-tab{position:relative;border:none;background:none;cursor:pointer;padding:0;font:inherit;color:var(--text-tertiary);transition:color .14s}
.ni-tab:hover{color:var(--text-primary)}
.ni-tab[aria-selected="true"]{color:var(--text-primary);font-weight:500}
.ni-indicator{position:absolute;bottom:-1px;height:2px;background:var(--accent);border-radius:1px;transition:transform .32s cubic-bezier(.2,.8,.2,1),width .32s cubic-bezier(.2,.8,.2,1)}
.ni-seg{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--border-hairline);background:var(--bg-surface);color:var(--text-secondary);font-size:11.5px;cursor:pointer;white-space:nowrap;transition:background .14s,color .14s,border-color .14s}
.ni-seg:hover{background:var(--bg-elevated);color:var(--text-primary)}
.ni-seg[aria-pressed="true"]{background:var(--text-primary);color:var(--bg-surface);border-color:var(--text-primary)}
.ni-seg[aria-pressed="true"] i{color:inherit;opacity:.7}
.ni-seg i{font-style:normal;font-family:${MONO};font-size:9.5px;color:var(--text-tertiary)}
.ni-input{height:32px;padding:0 10px 0 30px;border-radius:8px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;font-size:12.5px;color:var(--text-primary);outline:none;transition:border-color .14s,box-shadow .14s;width:100%}
.ni-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.ni-select{height:28px;padding:0 26px 0 9px;border-radius:6px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;font-size:11.5px;color:var(--text-primary);appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' fill='none' stroke='%238696AE' stroke-width='1.4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;cursor:pointer}
.ni-select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.ni-peek{position:fixed;top:48px;right:0;bottom:0;width:min(640px,100vw);z-index:60;background:var(--bg-surface);border-left:1px solid var(--border-hairline);box-shadow:-24px 0 60px rgba(11,18,32,.10);display:flex;flex-direction:column;font-family:${SANS};color:var(--text-primary);animation:ni-peek-in .28s cubic-bezier(.2,.8,.2,1) both}
[data-theme="dark"] .ni-peek{box-shadow:-24px 0 60px rgba(0,0,0,.5)}
.ni-peek .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.ni-cite{display:inline-flex;align-items:center;font-family:${MONO};font-size:9.5px;line-height:1;padding:3px 5px;border-radius:4px;background:var(--accent-tint);color:var(--accent);border:none;cursor:pointer;margin-left:3px;vertical-align:2px;transition:background .12s,color .12s}
.ni-cite:hover,.ni-cite[data-on="true"]{background:var(--accent);color:var(--accent-on)}
.ni-source{padding:10px 12px;border-radius:8px;border:1px solid transparent;transition:border-color .2s}
.ni-source[data-hi="true"]{border-color:var(--accent);animation:ni-flash 1.6s ease-out}
.ni-skel{background:var(--bg-elevated);border-radius:6px;animation:ni-pulse 1.4s ease-in-out infinite}
.ni-card{background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius-console)}
.ni-kpi{background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius-kpi);padding:14px 15px;min-width:0}
.ni-ghost{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--border-hairline);background:var(--bg-surface);color:var(--text-primary);font-size:12px;cursor:pointer;white-space:nowrap;transition:background .14s}
.ni-ghost:hover{background:var(--bg-elevated)}
.ni-ghost:disabled{opacity:.5;cursor:default}
.ni-primary{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;border-radius:8px;border:none;background:var(--accent);color:var(--accent-on);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .14s}
.ni-primary:hover{background:var(--accent-hover)}
.ni-strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x proximity}
.ni-strip::-webkit-scrollbar{height:4px}
.ni-insight{flex:0 0 300px;scroll-snap-align:start;background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius-kpi);padding:12px 14px;cursor:pointer;transition:border-color .14s,transform .2s cubic-bezier(.2,.8,.2,1)}
.ni-insight:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.ni-kbd{display:inline-block;font-family:${MONO};font-size:9.5px;padding:1px 5px;border:1px solid var(--border-hairline);border-bottom-width:2px;border-radius:4px;color:var(--text-tertiary);background:var(--bg-surface)}
@media (max-width:1100px){.ni-root [data-ni-hide-md]{display:none!important}.ni-root [data-ni-grid="lead"]{grid-template-columns:112px minmax(0,1fr) 90px!important}.ni-root [data-ni-grid="org"]{grid-template-columns:minmax(0,1fr) 110px 100px!important}.ni-root [data-ni-grid="edge"]{grid-template-columns:minmax(0,1fr) 30px minmax(0,1fr) 120px 50px!important}}
@media (max-width:760px){.ni-root [data-ni-hide-sm]{display:none!important}.ni-peek{top:0;width:100vw}}
@media (prefers-reduced-motion:reduce){.ni-rise,.ni-peek,.ni-source[data-hi="true"]{animation:none}.ni-bar > i,.ni-indicator,.ni-insight{transition:none}}
`;

export function useConsoleFonts() {
  useEffect(() => {
    if (document.getElementById('cn-fonts')) return;
    const l = document.createElement('link');
    l.id = 'cn-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  }, []);
}

// ── Palette by meaning ──────────────────────────────────────────────────────
export function hueFor(insightType: string | null | undefined): { color: string; border: string; tint: string; short: string } {
  switch (insightType) {
    case 'Warm Introduction': return { color: 'var(--accent)', border: 'rgba(12,107,90,.32)', tint: 'var(--accent-tint)', short: 'Warm path' };
    case 'High-Confidence Path': return { color: 'var(--accent)', border: 'rgba(12,107,90,.32)', tint: 'var(--accent-tint)', short: 'Strong path' };
    case 'Untapped Funder': return { color: AMBER, border: 'rgba(156,122,42,.36)', tint: 'rgba(156,122,42,.10)', short: 'White space' };
    case 'Corporate Giving Opportunity': return { color: INFO, border: 'rgba(62,108,168,.34)', tint: 'rgba(62,108,168,.10)', short: 'Corporate' };
    case 'Shared Employer': return { color: SLATE, border: 'rgba(91,115,131,.34)', tint: 'rgba(91,115,131,.10)', short: 'Shared employer' };
    case 'Shared Board': return { color: SLATE, border: 'rgba(91,115,131,.34)', tint: 'rgba(91,115,131,.10)', short: 'Shared board' };
    case 'Funder Cluster': return { color: INFO, border: 'rgba(62,108,168,.34)', tint: 'rgba(62,108,168,.10)', short: 'Cluster' };
    case 'Repeated Peer Funder': return { color: AMBER, border: 'rgba(156,122,42,.36)', tint: 'rgba(156,122,42,.10)', short: 'Repeat funder' };
    case 'Emerging Funder': return { color: AMBER, border: 'rgba(156,122,42,.36)', tint: 'rgba(156,122,42,.10)', short: 'Emerging' };
    case 'Dormant Relationship': return { color: 'var(--critical)', border: 'rgba(194,78,62,.34)', tint: 'var(--critical-tint)', short: 'Dormant' };
    default: return { color: SLATE, border: 'rgba(91,115,131,.34)', tint: 'rgba(91,115,131,.10)', short: insightType ?? 'Lead' };
  }
}
export const confColor = (c: string | null | undefined) => (c === 'High' ? 'var(--accent)' : c === 'Medium' ? SLATE : AMBER);

export const STATUS_LABEL: Record<PipelineState, string> = {
  NEW: 'New', RESEARCHING: 'Researching', INTRODUCTION_NEEDED: 'Intro needed', INTRO_REQUESTED: 'Intro requested', CONTACTED: 'Contacted',
  MEETING: 'Meeting', PROPOSAL: 'Proposal', AWAITING_DECISION: 'Awaiting decision', WON: 'Won', LOST: 'Lost', DEFERRED: 'Deferred', NOT_A_FIT: 'Not a fit',
};
export const statusTone = (s: string) => (s === 'WON' ? 'var(--accent)' : s === 'LOST' || s === 'NOT_A_FIT' ? 'var(--text-tertiary)' : s === 'NEW' ? SLATE : AMBER);

export const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—';
export const typeLabel = (t: string | null | undefined) => (t ? t.replace(/_/g, ' ') : '');
export const relLabel = (t: string) => ({ former_colleague: 'former colleagues', current_colleague: 'current colleagues', shared_employer: 'shared employer', shared_board: 'shared board', shared_university: 'shared university', shared_nonprofit: 'shared nonprofit', existing_cyc_relationship: 'CYC relationship', second_degree: 'second degree', corporate_connection: 'corporate tie', foundation_connection: 'foundation link', geographic_overlap: 'service area', philanthropic_overlap: 'funds CYC peers', seat: 'board seat', employment: 'employment', membership: 'CYC member', relationship: 'relationship', funding: 'funds', white_space: 'white space' } as Record<string, string>)[t] ?? t.replace(/_/g, ' ');

// ── Atoms ───────────────────────────────────────────────────────────────────
export function Chip({ text, color, border, tint, style }: { text: string; color: string; border: string; tint?: string; style?: CSSProperties }) {
  return <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color, border: `1px solid ${border}`, background: tint, borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap', lineHeight: 1.3, ...style }}>{text}</i>;
}
export function TypeChip({ type }: { type: string | null | undefined }) { const h = hueFor(type); return <Chip text={h.short} color={h.color} border={h.border} />; }
export function ConfChip({ confidence }: { confidence: string | null | undefined }) {
  const c = confColor(confidence);
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: c, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: c }} />{confidence ?? '—'}</span>;
}
export function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return <Chip text={STATUS_LABEL[status as PipelineState] ?? status} color={tone} border={tone === 'var(--text-tertiary)' ? 'var(--border-hairline)' : `color-mix(in srgb, ${tone} 35%, transparent)`} />;
}
export function Avatar({ name, size = 28, own }: { name: string; size?: number; own?: boolean }) {
  return <b aria-hidden style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: own ? 'var(--accent)' : 'var(--bg-elevated)', color: own ? 'var(--accent-on)' : 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: Math.max(9, size * 0.34), fontWeight: 500 }}>{initialsOf(name)}</b>;
}
export function OrgMark({ name, size = 28, accent }: { name: string; size?: number; accent?: boolean }) {
  return <b aria-hidden style={{ width: size, height: size, flex: 'none', borderRadius: Math.round(size * 0.22), background: accent ? 'var(--accent-tint)' : 'var(--bg-elevated)', color: accent ? 'var(--accent)' : 'var(--text-secondary)', border: `1px solid ${accent ? 'rgba(12,107,90,.3)' : 'var(--border-hairline)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: Math.max(9, size * 0.32), fontWeight: 500 }}>{initialsOf(name)}</b>;
}

/** Score as a short bar + number; the bar grows in on mount (score is the first thing the eye reads). */
export function ScoreBar({ score, width = 64, delay = 0 }: { score: number; width?: number; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(Math.max(0, Math.min(100, score)) / 100), 30 + delay); return () => clearTimeout(t); }, [score, delay]);
  const tone = score >= 70 ? 'var(--accent)' : score >= 45 ? SLATE : AMBER;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <b className="fd-mono" style={{ fontSize: 13, fontWeight: 600, color: tone, minWidth: 26, textAlign: 'right' }}>{Math.round(score)}</b>
      <span className="ni-bar" style={{ width }}><i style={{ ['--w' as string]: w, background: tone }} /></span>
    </span>
  );
}

/** The drawer's score glyph: an arc that draws itself, subtotals underneath. */
export function ScoreRing({ score, size = 72, subtotals }: { score: number; size?: number; subtotals?: Record<string, number> | null }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const [len, setLen] = useState(0);
  useEffect(() => { const t = setTimeout(() => setLen(Math.max(0, Math.min(100, score)) / 100), 60); return () => clearTimeout(t); }, [score]);
  const tone = score >= 70 ? 'var(--accent)' : score >= 45 ? SLATE : AMBER;
  const parts = subtotals ? [['relationship', 'Relationship'], ['funding_fit', 'Funding fit'], ['accessibility', 'Access'], ['recency', 'Recency']] as const : [];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Opportunity score ${Math.round(score)} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--score-track)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - len)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
        <text x="50%" y="50%" dy="0.36em" textAnchor="middle" style={{ fontFamily: MONO, fontSize: size * 0.3, fontWeight: 600, fill: 'var(--text-primary)' }}>{Math.round(score)}</text>
      </svg>
      {parts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '4px 10px', alignItems: 'center', minWidth: 190 }}>
          {parts.map(([k, label]) => {
            const v = subtotals?.[k] ?? 0; const max = k === 'relationship' ? 40 : k === 'funding_fit' ? 50 : k === 'accessibility' ? 30 : 25;
            return [
              <span key={`${k}-l`} className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{label}</span>,
              <span key={`${k}-b`} className="ni-bar" style={{ width: '100%' }}><i style={{ ['--w' as string]: Math.max(0, v) / max, background: v < 0 ? 'var(--critical)' : 'var(--text-secondary)' }} /></span>,
              <b key={`${k}-v`} className="fd-mono" style={{ fontSize: 10.5, color: v < 0 ? 'var(--critical)' : 'var(--text-secondary)', textAlign: 'right' }}>{v > 0 ? `+${v}` : v}</b>,
            ];
          })}
          {typeof subtotals?.penalties === 'number' && subtotals.penalties < 0 && [
            <span key="p-l" className="fd-caption" style={{ color: 'var(--critical)', fontSize: 11 }}>Penalties</span>,
            <span key="p-b" />,
            <b key="p-v" className="fd-mono" style={{ fontSize: 10.5, color: 'var(--critical)', textAlign: 'right' }}>{subtotals.penalties}</b>,
          ]}
        </div>
      )}
    </div>
  );
}

export function Skeleton({ h = 14, w = '100%', style }: { h?: number; w?: number | string; style?: CSSProperties }) { return <span className="ni-skel" style={{ display: 'block', height: h, width: w, ...style }} />; }

export function Eyebrow({ children, color = 'var(--text-tertiary)', style }: { children: ReactNode; color?: string; style?: CSSProperties }) { return <span className="fd-eyebrow" style={{ color, ...style }}>{children}</span>; }

export function SectionRule({ label, right }: { label: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
      <Eyebrow color="var(--text-secondary)">{label}</Eyebrow>
      <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
      {right}
    </div>
  );
}

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
