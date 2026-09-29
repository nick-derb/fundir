'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

// Faithful port of templates/org-profile/OrgProfile.dc.html — "What Fundir knows
// about CYC" — wired to REAL data: programs (cyc-profile), audited FY25 financials
// + impact + board (cyc-live-data), and the live funder_board_members counts.

export interface OrgKpi { label: string; value: string; }
export interface OrgRow { name: string; scope: string; value: string; period: string; source: string; state: 'confirmed' | 'pending' | 'corrected'; }
export interface OrgFacet { key: string; label: string; title: string; blurb: string; rows: OrgRow[]; }

const CSS = `
.op-root{color:var(--text-primary);background:var(--bg-page)}
.op-root .op-cols{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start}
.op-root .op-facets{position:sticky;top:64px;display:flex;flex-direction:column;gap:12px;min-width:0}
.op-root .op-facet{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;border-bottom:1px solid var(--border-hairline);background:none;padding:10px 12px;cursor:pointer;font:inherit;color:var(--text-secondary);font-size:13px;transition:background-color var(--motion-fast)}
.op-root .op-facet:last-child{border-bottom:none}
.op-root .op-facet:hover{background:var(--bg-elevated)}
.op-root .op-facet[aria-current="true"]{background:var(--bg-elevated);box-shadow:inset 2px 0 0 var(--accent);color:var(--text-primary);font-weight:500}
.op-root .op-facet i{font-style:normal;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary);margin-left:auto}
.op-root .op-src{font-size:12px;color:var(--accent);border-bottom:1px solid rgba(12,107,90,.26);display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:1180px){.op-root .op-cols{grid-template-columns:minmax(0,1fr)}.op-root .op-facets{position:static}.op-root .op-facetlist{display:flex;flex-wrap:wrap}.op-root .op-facet{width:auto;border-bottom:none}}
@media (max-width:900px){.op-root .op-hide{display:none}}
`;

const STATE_TAG: Record<OrgRow['state'], { tone: string; label: string }> = {
  confirmed: { tone: 'accent', label: 'Confirmed' },
  pending: { tone: 'warning', label: 'Watch' },
  corrected: { tone: 'info', label: 'Corrected' },
};

export function OrgProfileView({ ein, facets, kpis, gaps }: { ein: string; facets: OrgFacet[]; kpis: OrgKpi[]; gaps: string[] }) {
  const [active, setActive] = useState(facets[1]?.key ?? facets[0]?.key ?? '');
  const section = facets.find(f => f.key === active) ?? facets[0];

  return (
    <div className="op-root" style={{ padding: '22px 24px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="fd-page-head">
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Chicago Youth Centers · EIN {ein}</p>
          <h1>What Fundir knows about you</h1>
          <p className="fd-lede">Read from your own filings and audited statements. Every fact carries the source it came from.</p>
        </div>
      </div>

      <div className="fd-stats" style={{ marginBottom: 18 }}>
        {kpis.map(k => (
          <div key={k.label} className="fd-stat"><span className="fd-eyebrow">{k.label}</span><b>{k.value}</b></div>
        ))}
      </div>

      <div className="op-cols">
        <div className="op-facets">
          <div className="fd-card op-facetlist" style={{ overflow: 'hidden' }}>
            {facets.map(f => (
              <button key={f.key} className="op-facet" aria-current={f.key === active ? 'true' : undefined} onClick={() => setActive(f.key)}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                <i>{f.rows.length}</i>
              </button>
            ))}
          </div>
          <div className="fd-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <AlertCircle style={{ width: 13, height: 13, color: 'var(--warning)', flex: 'none' }} />
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>{gaps.length} things to watch</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gaps.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <i style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--warning)', flex: 'none', marginTop: 7 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{g}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div key={section.key} className="fd-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
            <h2 className="fd-h2" style={{ margin: '0 0 3px' }}>{section.title}</h2>
            <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>{section.blurb}</p>
          </div>
          <table className="fd-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>Fact</th>
                <th className="num">Value</th>
                <th className="op-hide">Period</th>
                <th className="op-hide">Source</th>
                <th style={{ paddingRight: 16 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ paddingLeft: 16 }}>
                    <b style={{ display: 'block', fontWeight: 500, letterSpacing: '-.005em', marginBottom: 2 }}>{r.name}</b>
                    <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{r.scope}</span>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.value}</td>
                  <td className="op-hide fd-mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.period}</td>
                  <td className="op-hide" style={{ maxWidth: 210 }}><span className="op-src">{r.source}</span></td>
                  <td style={{ paddingRight: 16 }}><span className="fd-tag" data-tone={STATE_TAG[r.state].tone}>{STATE_TAG[r.state].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-hairline)' }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>{section.rows.length} {section.label.toLowerCase()} fact{section.rows.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '18px 0 0' }}>Live workspace · audited &amp; profile data</p>
    </div>
  );
}
