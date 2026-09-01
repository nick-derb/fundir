'use client';

import { useEffect, useState } from 'react';
import { Table2, RefreshCw, Download, Lock, Pencil, X, ShieldCheck } from 'lucide-react';

// Faithful port of templates/prospecting/Prospecting.dc.html, wired to CYC's
// REAL loaded data (cyc_cultivation / funder_board_members / cyc_research_queue
// / cyc_funder_prospects / cyc_peer_orgs / irs_bmf_il) and the real Instrumentl
// win/loss history from cyc_grant_submissions.

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";

export interface Sheet {
  key: string; label: string; total: string; locked: boolean; note: string;
  cols: string[]; lock: number[] | 'all'; rows: string[][];
}
export interface InstrumentlSummary {
  awarded: number; declined: number; open: number; winRate: number;
  projects: { project: string; sent: number; won: number; rate: number }[];
}

const CSS = `
.pr-root{--radius-kpi:12px;--radius-console:14px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);background:var(--bg-page)}
.pr-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.pr-root .fd-kpi{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.pr-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.pr-root .fd-caption{font-size:12px;line-height:1.5}
@keyframes pr-fade{from{opacity:0}to{opacity:1}}
@keyframes pr-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (max-width:1240px){.pr-root [data-pr-cols]{grid-template-columns:minmax(0,1fr)!important}}
@media (max-width:820px){.pr-root [data-pr-meta]{display:none!important}}
`;

export function ProspectingView({ sheets, instrumentl, bmfTotal, rowLimit }: {
  sheets: Sheet[]; instrumentl: InstrumentlSummary; bmfTotal: string; rowLimit: number;
}) {
  const [active, setActive] = useState(sheets[0]?.key ?? 'cultivation');
  const [replaceOpen, setReplaceOpen] = useState(false);

  useEffect(() => {
    if (document.getElementById('pr-fonts')) return;
    const l = document.createElement('link');
    l.id = 'pr-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  }, []);
  useEffect(() => {
    if (!replaceOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReplaceOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [replaceOpen]);

  const sheet = sheets.find(s => s.key === active) ?? sheets[0];
  const lockAll = sheet.lock === 'all';
  const lockSet = lockAll ? null : new Set(sheet.lock as number[]);
  const shown = sheet.rows.length;
  const lockedSheets = sheets.filter(s => s.locked);

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)' };

  return (
    <div className="pr-root" style={{ padding: '24px 26px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>Chicago Youth Centers</p>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Prospecting</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '62ch' }}>
            One workbook, shared by everyone at CYC. The IRS sheets are replaced wholesale each release without touching your own columns.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setReplaceOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 15px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}><RefreshCw style={{ width: 13, height: 13 }} />Replace IRS data</button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 'var(--radius-kpi)', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', opacity: 0.9 }}><Download style={{ width: 13, height: 13 }} />Export .xlsx</span>
        </div>
      </div>

      {/* workbook */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          <Table2 style={{ width: 15, height: 15, color: 'var(--accent)', flex: 'none' }} />
          <b style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-.005em' }}>Funder Prospecting Master File</b>
          <span className="fd-mono" style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', border: '1px solid var(--border-hairline)', borderRadius: 3, padding: '3px 7px' }}>eo_il.xlsx</span>
          <span style={{ flex: 1 }} />
          <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>All changes saved</span>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Shared with everyone at CYC</span>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-hairline)', overflowX: 'auto', background: 'var(--bg-page)' }}>
          {sheets.map(s => {
            const on = s.key === active;
            return (
              <button key={s.key} onClick={() => setActive(s.key)} style={{ flex: 'none', border: 'none', background: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 15px', whiteSpace: 'nowrap', fontSize: 12.5,
                  ...(on ? { background: 'var(--bg-surface)', borderBottom: '2px solid var(--accent)', color: 'var(--text-primary)', fontWeight: 500 }
                         : { borderBottom: '2px solid transparent', color: 'var(--text-tertiary)' }) }}>
                  {s.label}<i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 9, color: 'var(--text-tertiary)', opacity: on ? 1 : 0.7 }}>{s.total}</i>
                </span>
              </button>
            );
          })}
        </div>

        {/* meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          {sheet.locked
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5B7383', border: '1px solid rgba(91,115,131,.3)', borderRadius: 3, padding: '3px 8px' }}><Lock style={{ width: 11, height: 11 }} />IRS source · replaced each release</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.26)', borderRadius: 3, padding: '3px 8px' }}><Pencil style={{ width: 11, height: 11 }} />Your columns · edit anytime</span>}
          <span data-pr-meta className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{sheet.note}</span>
          <span style={{ flex: 1 }} />
          <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{sheet.total} rows × {sheet.cols.length} cols</span>
        </div>

        {/* table */}
        <div style={{ overflow: 'auto', maxHeight: 460 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, width: 44, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }} />
                {sheet.cols.map((c, i) => (
                  <th key={i} className="fd-eyebrow" style={{ position: 'sticky', top: 0, zIndex: 2, textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)', padding: '8px 10px', whiteSpace: 'nowrap' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown === 0 ? (
                <tr><td colSpan={sheet.cols.length + 1} style={{ padding: '18px 14px', color: 'var(--text-tertiary)', fontSize: 13, borderBottom: '1px solid var(--border-hairline)' }}>No rows loaded for this sheet.</td></tr>
              ) : sheet.rows.map((cells, ri) => (
                <tr key={ri}>
                  <td className="fd-mono" style={{ position: 'sticky', left: 0, zIndex: 1, width: 44, textAlign: 'center', fontSize: 9.5, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>{ri + 1}</td>
                  {cells.map((text, ci) => {
                    const locked = lockAll || (lockSet?.has(ci) ?? false);
                    return (
                      <td key={ci} className={locked ? 'fd-mono' : undefined} style={{
                        fontSize: locked ? 11.5 : 12, color: locked ? 'var(--text-secondary)' : 'var(--text-primary)',
                        borderRight: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)',
                        padding: '7px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        background: locked ? 'var(--bg-page)' : undefined,
                      }} title={text}>{text}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)' }}>Showing {shown.toLocaleString('en-US')} of {sheet.total} rows{sheet.total !== shown.toLocaleString('en-US') ? ` · first ${rowLimit}` : ''}</span>
          <span style={{ flex: 1 }} />
          <a href="/data" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Open in data hub →</a>
        </div>
      </div>

      <div data-pr-cols style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' }}>

        {/* Instrumentl history (real) */}
        <div style={{ ...card, padding: '18px 20px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>Instrumentl history</div>
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Your real exported opportunities, read for what converts</p>
            </div>
            <a href="/org" className="fd-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Pull into profile →</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(132px,1fr))', gap: 12, marginBottom: 16 }}>
            {[['Awarded', instrumentl.awarded], ['Declined', instrumentl.declined], ['Win rate', `${instrumentl.winRate}%`], ['Still open', instrumentl.open]].map(([label, val]) => (
              <div key={label} style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', padding: '12px 13px' }}>
                <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 7px' }}>{label}</p>
                <b className="fd-kpi" style={{ fontSize: 20 }}>{val}</b>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border-hairline)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: 'var(--bg-page)' }}>
              <span className="fd-eyebrow" style={{ flex: 1, color: 'var(--text-tertiary)' }}>Project</span>
              <span className="fd-eyebrow" style={{ width: 58, textAlign: 'right', color: 'var(--text-tertiary)' }}>Sent</span>
              <span className="fd-eyebrow" style={{ width: 58, textAlign: 'right', color: 'var(--text-tertiary)' }}>Won</span>
              <span className="fd-eyebrow" style={{ width: 52, textAlign: 'right', color: 'var(--text-tertiary)' }}>Rate</span>
            </div>
            {instrumentl.projects.length === 0 ? (
              <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', fontSize: 12.5, color: 'var(--text-tertiary)' }}>No decided or open applications yet.</div>
            ) : instrumentl.projects.map(p => (
              <div key={p.project} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-surface)' }}>
                <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.project}>{p.project}</span>
                <span className="fd-mono" style={{ width: 58, textAlign: 'right', fontSize: 11.5, color: 'var(--text-secondary)' }}>{p.sent}</span>
                <span className="fd-mono" style={{ width: 58, textAlign: 'right', fontSize: 11.5, color: 'var(--text-secondary)' }}>{p.won}</span>
                <span className="fd-mono" style={{ width: 52, textAlign: 'right', fontSize: 11.5, color: 'var(--accent)' }}>{p.rate}%</span>
              </div>
            ))}
          </div>
          <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '13px 0 0' }}>Fundir reads this history for what actually converts, then weights new matches by your real foundation win rate.</p>
        </div>

        {/* right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div style={{ ...card, padding: 18 }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 12 }}>How replacement works</span>
            {[
              'A new BMF or 990 release drops. Fundir parses and cleans it into the same column shape.',
              'Locked sheets are swapped wholesale. Nothing you typed lives on them.',
              'Your sheets rejoin on EIN, so owners, notes and outreach status stay attached.',
              'You see a diff first: rows added, assets changed, organizations that disappeared.',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, paddingBottom: i < 3 ? 12 : 0 }}>
                <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--accent)', flex: 'none', paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ ...card, padding: 18 }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 12 }}>Source</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span className="fd-mono" style={{ fontSize: 10, color: 'var(--accent)', flex: 'none' }}>BMF</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>IRS Illinois exempt-org file · {bmfTotal} rows</span>
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>Loaded</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0' }}>
              <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', flex: 'none' }}>CYC</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>Cultivation, board and research columns · your own work</span>
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>Live</span>
            </div>
          </div>
        </div>
      </div>

      <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '22px 0 0' }}>Live workspace · your loaded data</p>

      {/* replace modal */}
      {replaceOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => setReplaceOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(16,25,23,.42)', backdropFilter: 'blur(3px)', animation: 'pr-fade .22s ease' }} />
          <div role="dialog" aria-modal="true" aria-label="Replace IRS data" style={{ position: 'relative', width: 'min(560px,100%)', ...card, boxShadow: '0 24px 60px rgba(16,25,23,.20)', animation: 'pr-rise .26s cubic-bezier(.2,.8,.3,1)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '20px 22px 0' }}>
              <div>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.6rem', lineHeight: 1.1, letterSpacing: '-.015em', margin: '0 0 6px' }}>Replace the IRS sheets</h2>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>Your own columns are untouched. Only the locked source sheets are swapped.</p>
              </div>
              <button onClick={() => setReplaceOpen(false)} aria-label="Close" style={{ width: 30, height: 30, flex: 'none', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X style={{ width: 14, height: 14 }} /></button>
            </div>
            <div style={{ padding: '18px 22px 22px' }}>
              <div style={{ border: '1px dashed var(--border-hairline)', borderRadius: 'var(--radius-kpi)', padding: '26px 20px', textAlign: 'center', background: 'var(--bg-page)' }}>
                <RefreshCw style={{ width: 20, height: 20, color: 'var(--text-tertiary)' }} />
                <b style={{ display: 'block', fontSize: 13.5, fontWeight: 500, margin: '10px 0 4px' }}>Drop the new BMF or 990 extract</b>
                <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Raw IRS format is fine · Fundir cleans and maps the columns</span>
              </div>
              <div style={{ marginTop: 18, border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}><span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Sheets that will be replaced</span></div>
                {lockedSheets.map((s, i) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', borderBottom: i < lockedSheets.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}>
                    <Lock style={{ width: 12, height: 12, color: '#5B7383', flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: 12.5 }}>{s.label}</span>
                    <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.total} rows</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, border: '1px solid rgba(12,107,90,.24)', borderRadius: 'var(--radius-kpi)', padding: '12px 13px', background: 'rgba(12,107,90,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><ShieldCheck style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} /><span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>Kept intact</span></div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>Cultivation List, Board Members and Research Queue keep every value you have entered. They rejoin the new source on EIN.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <span style={{ flex: 1 }} />
                <button onClick={() => setReplaceOpen(false)} style={{ height: 38, padding: '0 16px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => setReplaceOpen(false)} style={{ height: 38, padding: '0 18px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--accent)', color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Preview the diff</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
