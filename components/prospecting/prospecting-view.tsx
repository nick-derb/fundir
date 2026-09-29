'use client';

import { useState } from 'react';
import { Table2, RefreshCw, Download, Lock, Pencil } from 'lucide-react';
import { IrsReplaceModal } from '@/components/prospecting/irs-replace-modal';

// Faithful port of templates/prospecting/Prospecting.dc.html, wired to CYC's
// REAL loaded data (cyc_cultivation / funder_board_members / cyc_research_queue
// / cyc_funder_prospects / cyc_peer_orgs / irs_bmf_il) and the real Instrumentl
// win/loss history from cyc_grant_submissions.

export interface Sheet {
  key: string; label: string; total: string; locked: boolean; note: string;
  cols: string[]; lock: number[] | 'all'; rows: string[][];
}
export interface InstrumentlSummary {
  awarded: number; declined: number; open: number; winRate: number;
  projects: { project: string; sent: number; won: number; rate: number }[];
}

const CSS = `
.pr-root{color:var(--text-primary);background:var(--bg-page)}
.pr-root .pr-tabs{display:flex;align-items:stretch;border-bottom:1px solid var(--border-hairline);overflow-x:auto;background:var(--bg-page)}
.pr-root .pr-tab{flex:none;border:none;background:none;font:inherit;cursor:pointer;padding:0}
.pr-root .pr-tab > span{display:flex;align-items:center;gap:7px;padding:10px 14px;white-space:nowrap;font-size:12.5px;border-bottom:2px solid transparent;color:var(--text-tertiary)}
.pr-root .pr-tab[aria-selected="true"] > span{background:var(--bg-surface);border-bottom-color:var(--accent);color:var(--text-primary);font-weight:500}
.pr-root .pr-tab i{font-style:normal;font-family:var(--font-mono);font-size:9.5px;color:var(--text-tertiary)}
.pr-root .pr-grid th{position:sticky;top:0;z-index:2;text-align:left;font-weight:500;color:var(--text-secondary);background:var(--bg-elevated);border-right:1px solid var(--border-hairline);border-bottom:1px solid var(--border-hairline);padding:8px 10px;white-space:nowrap}
.pr-root .pr-grid td{border-right:1px solid var(--border-hairline);border-bottom:1px solid var(--border-hairline);padding:7px 10px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.pr-root .pr-grid td[data-locked="true"]{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--text-secondary);background:var(--bg-page)}
.pr-root .pr-grid .pr-n{position:sticky;left:0;z-index:1;width:44px;text-align:center;font-family:var(--font-mono);font-size:9.5px;color:var(--text-tertiary);background:var(--bg-elevated)}
.pr-root .pr-grid thead .pr-n{z-index:3}
.pr-root .pr-cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.pr-root .pr-step{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;padding:9px 0;border-bottom:1px solid var(--border-hairline);font-size:12.5px;line-height:1.5;color:var(--text-secondary)}
.pr-root .pr-step:last-child{border-bottom:none}
@media (max-width:1240px){.pr-root .pr-cols{grid-template-columns:minmax(0,1fr)}}
@media (max-width:820px){.pr-root .pr-meta-note{display:none}}
`;

export function ProspectingView({ sheets, instrumentl, bmfTotal, rowLimit, canReplace }: {
  sheets: Sheet[]; instrumentl: InstrumentlSummary; bmfTotal: string; rowLimit: number; canReplace: boolean;
}) {
  const [active, setActive] = useState(sheets[0]?.key ?? 'cultivation');
  const [replaceOpen, setReplaceOpen] = useState(false);

  const sheet = sheets.find(s => s.key === active) ?? sheets[0];
  const lockAll = sheet.lock === 'all';
  const lockSet = lockAll ? null : new Set(sheet.lock as number[]);
  const shown = sheet.rows.length;
  const lockedSheets = sheets.filter(s => s.locked);

  return (
    <div className="pr-root" style={{ padding: '22px 24px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div className="fd-page-head">
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Chicago Youth Centers</p>
          <h1>Prospecting</h1>
          <p className="fd-lede">One workbook, shared by everyone at CYC. IRS sheets are replaced each release; your own columns stay put.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="fd-btn" onClick={() => setReplaceOpen(true)}><RefreshCw style={{ width: 13, height: 13 }} />Replace IRS data</button>
          <span className="fd-btn-primary" style={{ opacity: 0.9 }}><Download style={{ width: 13, height: 13 }} />Export .xlsx</span>
        </div>
      </div>

      {/* workbook */}
      <div className="fd-card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          <Table2 style={{ width: 14, height: 14, color: 'var(--accent)', flex: 'none' }} />
          <b style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-.005em' }}>Funder Prospecting Master File</b>
          <span className="fd-tag" data-tone="slate">eo_il.xlsx</span>
          <span style={{ flex: 1 }} />
          <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>All changes saved</span>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Shared with everyone at CYC</span>
        </div>

        {/* tabs */}
        <div className="pr-tabs" role="tablist">
          {sheets.map(s => (
            <button key={s.key} role="tab" aria-selected={s.key === active} className="pr-tab" onClick={() => setActive(s.key)}>
              <span>{s.label}<i>{s.total}</i></span>
            </button>
          ))}
        </div>

        {/* meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          {sheet.locked
            ? <span className="fd-tag" data-tone="slate"><Lock style={{ width: 10, height: 10 }} />IRS source · replaced each release</span>
            : <span className="fd-tag" data-tone="accent"><Pencil style={{ width: 10, height: 10 }} />Your columns · edit anytime</span>}
          <span className="pr-meta-note fd-caption" style={{ color: 'var(--text-tertiary)' }}>{sheet.note}</span>
          <span style={{ flex: 1 }} />
          <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{sheet.total} rows × {sheet.cols.length} cols</span>
        </div>

        {/* table */}
        <div style={{ overflow: 'auto', maxHeight: 460 }}>
          <table className="pr-grid" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th className="pr-n" />
                {sheet.cols.map((c, i) => <th key={i} className="fd-eyebrow">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown === 0 ? (
                <tr><td colSpan={sheet.cols.length + 1} style={{ padding: '18px 14px', color: 'var(--text-tertiary)', fontSize: 13, whiteSpace: 'normal', maxWidth: 'none' }}>No rows loaded for this sheet.</td></tr>
              ) : sheet.rows.map((cells, ri) => (
                <tr key={ri}>
                  <td className="pr-n">{ri + 1}</td>
                  {cells.map((text, ci) => {
                    const locked = lockAll || (lockSet?.has(ci) ?? false);
                    return <td key={ci} data-locked={locked ? 'true' : undefined} title={text}>{text}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Showing {shown.toLocaleString('en-US')} of {sheet.total} rows{sheet.total !== shown.toLocaleString('en-US') ? ` · first ${rowLimit}` : ''}</span>
          <span style={{ flex: 1 }} />
          <a href="/data" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Open in data hub →</a>
        </div>
      </div>

      <div className="pr-cols">

        {/* Instrumentl history (real) */}
        <div className="fd-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '14px 16px 12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div className="fd-h2">Instrumentl history</div>
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '3px 0 0' }}>Your real exported opportunities, read for what converts</p>
            </div>
            <a href="/org" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Pull into profile →</a>
          </div>
          <div className="fd-stats" style={{ padding: '0 16px', borderBottom: 'none' }}>
            <div className="fd-stat"><span className="fd-eyebrow">Awarded</span><b>{instrumentl.awarded}</b></div>
            <div className="fd-stat"><span className="fd-eyebrow">Declined</span><b>{instrumentl.declined}</b></div>
            <div className="fd-stat" data-accent="true"><span className="fd-eyebrow">Win rate</span><b>{instrumentl.winRate}%</b></div>
            <div className="fd-stat"><span className="fd-eyebrow">Still open</span><b>{instrumentl.open}</b></div>
          </div>
          <table className="fd-table">
            <thead>
              <tr><th style={{ paddingLeft: 16 }}>Project</th><th className="num">Sent</th><th className="num">Won</th><th className="num" style={{ paddingRight: 16 }}>Rate</th></tr>
            </thead>
            <tbody>
              {instrumentl.projects.length === 0 ? (
                <tr><td colSpan={4} style={{ paddingLeft: 16, color: 'var(--text-tertiary)' }}>No decided or open applications yet.</td></tr>
              ) : instrumentl.projects.map(p => (
                <tr key={p.project}>
                  <td style={{ paddingLeft: 16, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.project}>{p.project}</td>
                  <td className="num" style={{ color: 'var(--text-secondary)' }}>{p.sent}</td>
                  <td className="num" style={{ color: 'var(--text-secondary)' }}>{p.won}</td>
                  <td className="num" style={{ paddingRight: 16, color: 'var(--accent)' }}>{p.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0, padding: '12px 16px', borderTop: '1px solid var(--border-hairline)' }}>Fundir reads this history for what actually converts, then weights new matches by your real foundation win rate.</p>
        </div>

        {/* right column: how replacement works + source, one card, two ruled sections */}
        <div className="fd-card" style={{ minWidth: 0, padding: '14px 16px' }}>
          <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>How replacement works</span>
          {[
            'A new BMF or 990 release drops. Fundir parses and cleans it into the same column shape.',
            'Locked sheets are swapped wholesale. Nothing you typed lives on them.',
            'Your sheets rejoin on EIN, so owners, notes and outreach status stay attached.',
            'You see a diff first: rows added, assets changed, organizations that disappeared.',
          ].map((t, i) => (
            <div key={i} className="pr-step">
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--accent)', paddingTop: 3 }}>{String(i + 1).padStart(2, '0')}</span>
              <span>{t}</span>
            </div>
          ))}
          <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', margin: '18px 0 4px' }}>Source</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-hairline)' }}>
            <span className="fd-mono" style={{ fontSize: 10, color: 'var(--accent)', flex: 'none', width: 28 }}>BMF</span>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)' }}>IRS Illinois exempt-org file · {bmfTotal} rows</span>
            <span className="fd-tag" data-tone="accent">Loaded</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0' }}>
            <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 'none', width: 28 }}>CYC</span>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)' }}>Cultivation, board and research columns · your own work</span>
            <span className="fd-tag">Live</span>
          </div>
        </div>
      </div>

      <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '18px 0 0' }}>Live workspace · your loaded data</p>

      <IrsReplaceModal open={replaceOpen} onClose={() => setReplaceOpen(false)} lockedSheets={lockedSheets} canReplace={canReplace} />
    </div>
  );
}
