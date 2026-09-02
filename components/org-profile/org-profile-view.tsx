'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

// Faithful port of templates/org-profile/OrgProfile.dc.html — "What Fundir knows
// about CYC" — wired to REAL data: programs (cyc-profile), audited FY25 financials
// + impact + board (cyc-live-data), and the live funder_board_members counts.

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";

export interface OrgKpi { label: string; value: string; }
export interface OrgRow { name: string; scope: string; value: string; period: string; source: string; state: 'confirmed' | 'pending' | 'corrected'; }
export interface OrgFacet { key: string; label: string; title: string; blurb: string; rows: OrgRow[]; }

const CSS = `
.op-root{--radius-kpi:12px;--radius-console:14px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);background:var(--bg-page)}
.op-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.op-root .fd-kpi{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.op-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.op-root .fd-caption{font-size:12px;line-height:1.5}
.op-root .fd-h2{font-size:17px;line-height:1.4;font-weight:600}
@keyframes op-swap{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:1180px){.op-root [data-op-cols]{grid-template-columns:minmax(0,1fr)!important}.op-root [data-op-facets]{position:static!important;flex-direction:row!important;flex-wrap:wrap;max-height:none!important}}
@media (max-width:900px){.op-root [data-op-summary]{grid-template-columns:repeat(2,minmax(0,1fr))!important}.op-root [data-op-hidecol]{display:none!important}}
@media (max-width:620px){.op-root [data-op-summary]{grid-template-columns:minmax(0,1fr)!important}}
`;

function StateTag({ state }: { state: OrgRow['state'] }) {
  const map = {
    confirmed: { c: 'var(--accent)', bg: 'rgba(12,107,90,.10)', b: 'rgba(12,107,90,.26)', t: 'Confirmed' },
    pending: { c: '#9C7A2A', bg: 'rgba(156,122,42,.10)', b: 'rgba(156,122,42,.3)', t: 'Watch' },
    corrected: { c: '#3E6CA8', bg: 'rgba(62,108,168,.10)', b: 'rgba(62,108,168,.3)', t: 'Corrected' },
  }[state];
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: map.c, background: map.bg, border: `1px solid ${map.b}`, borderRadius: 3, padding: '3px 7px' }}>{map.t}</span>;
}

export function OrgProfileView({ ein, facets, kpis, gaps }: { ein: string; facets: OrgFacet[]; kpis: OrgKpi[]; gaps: string[] }) {
  const [active, setActive] = useState(facets[1]?.key ?? facets[0]?.key ?? '');

  useEffect(() => {
    if (document.getElementById('op-fonts')) return;
    const l = document.createElement('link');
    l.id = 'op-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  }, []);

  const section = facets.find(f => f.key === active) ?? facets[0];
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)' };

  return (
    <div className="op-root" style={{ padding: '24px 26px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div style={{ marginBottom: 22, minWidth: 0 }}>
        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 11px' }}>Chicago Youth Centers · EIN {ein}</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>What Fundir knows about you</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
          Read from your own filings and audited statements. Every fact carries the source it came from, so an answer can always be traced back.
        </p>
      </div>

      {/* summary */}
      <div data-op-summary style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 22 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderRadius: 'var(--radius-console)', padding: '15px 17px' }}>
            <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>{k.label}</p>
            <b className="fd-kpi" style={{ fontSize: 23 }}>{k.value}</b>
          </div>
        ))}
      </div>

      <div data-op-cols style={{ display: 'grid', gridTemplateColumns: '238px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

        {/* facets + gaps */}
        <div data-op-facets style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ ...card, overflow: 'hidden' }}>
            {facets.map(f => {
              const on = f.key === active;
              return (
                <button key={f.key} onClick={() => setActive(f.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border-hairline)', borderLeft: `2px solid ${on ? 'var(--accent)' : 'transparent'}`, background: on ? 'var(--bg-page)' : 'none', padding: '11px 14px', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{f.label}</span>
                  <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 'none' }}>{f.rows.length}</span>
                </button>
              );
            })}
          </div>
          <div style={{ ...card, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <AlertCircle style={{ width: 14, height: 14, color: '#9C7A2A', flex: 'none' }} />
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>{gaps.length} things to watch</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {gaps.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 9 }}>
                  <i style={{ width: 4, height: 4, borderRadius: '50%', background: '#9C7A2A', flex: 'none', marginTop: 6 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{g}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* facts table */}
        <div key={section.key} style={{ animation: 'op-swap .24s cubic-bezier(.2,.8,.3,1)', minWidth: 0 }}>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 20px 15px' }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="fd-h2" style={{ margin: '0 0 4px' }}>{section.title}</h2>
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{section.blurb}</p>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Fact', 'Value', 'Period', 'Source', 'State'].map((h, i) => (
                    <th key={h} data-op-hidecol={i === 2 || i === 3 ? '' : undefined} className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', textAlign: i === 1 ? 'right' : 'left', fontWeight: 500, padding: i === 0 ? '8px 20px' : '8px 12px', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
                      <b style={{ display: 'block', fontSize: 13, fontWeight: 500, letterSpacing: '-.005em', marginBottom: 3 }}>{r.name}</b>
                      <i className="fd-caption" style={{ fontStyle: 'normal', color: 'var(--text-tertiary)' }}>{r.scope}</i>
                    </td>
                    <td className="fd-mono" style={{ padding: 12, borderBottom: '1px solid var(--border-hairline)', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.value}</td>
                    <td data-op-hidecol className="fd-mono" style={{ padding: 12, borderBottom: '1px solid var(--border-hairline)', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.period}</td>
                    <td data-op-hidecol style={{ padding: 12, borderBottom: '1px solid var(--border-hairline)', maxWidth: 210 }}>
                      <span style={{ fontSize: 12, color: 'var(--accent)', borderBottom: '1px solid rgba(12,107,90,.26)', paddingBottom: 1, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source}</span>
                    </td>
                    <td style={{ padding: 12, borderBottom: '1px solid var(--border-hairline)' }}><StateTag state={r.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', flexWrap: 'wrap' }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>{section.rows.length} {section.label.toLowerCase()} fact{section.rows.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '22px 0 0' }}>Live workspace · audited &amp; profile data</p>
    </div>
  );
}
