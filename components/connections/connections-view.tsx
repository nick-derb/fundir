'use client';

import { useState } from 'react';
import { Target, Send, Table2, Check, FileText } from 'lucide-react';

// Real board-network view in the "officer trail" design language, wired to
// funder_board_members + cyc_cultivation facts + the Instrumentl funding history.
// (The multi-year seat trail across 990 filings is a future pipeline; this shows
// the real board seats, connections, and CYC funding relationships we do have.)

const AMBER = '#9C7A2A';
const SLATE = '#5B7383';

export interface CnPerson {
  id: string; name: string; initials: string; foundation: string; title: string;
  connectionToCyc: string; connectionType: string; whoKnows: string; outreachStatus: string;
  warm: boolean; awaiting: boolean;
  funderType: string; assets: string; fundingFocus: string; notes: string;
  cycFunded: 'awarded' | 'applied' | 'declined' | 'pipeline' | null; cycAmount: string;
}
export interface CnKpis { board: number; foundations: number; warm: number; awaiting: number; }

const CSS = `
.cn-root{color:var(--text-primary);background:var(--bg-page)}
.cn-root h2{font-family:var(--font-display);font-weight:400}
.cn-root [data-cn-person]{transition:background .14s}
@media (max-width:1180px){.cn-root [data-cn-cols]{grid-template-columns:minmax(0,1fr)!important}.cn-root [data-cn-list]{max-height:none!important}}
@media (max-width:760px){.cn-root [data-cn-filters]{overflow-x:auto}}
`;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'warm', label: 'Warm' },
  { key: 'awaiting', label: 'Awaiting' },
] as const;

function Chip({ text, color, border }: { text: string; color: string; border: string }) {
  return <i className="fd-tag" style={{ color, borderColor: border }}>{text}</i>;
}
function Stat({ label, value, accent, sub }: { label: string; value: number; accent?: boolean; sub?: string }) {
  return (
    <div className="fd-stat" data-accent={accent ? 'true' : undefined}>
      <span className="fd-eyebrow">{label}</span>
      <b>{value.toLocaleString('en-US')}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}
function Source({ children }: { children: React.ReactNode }) {
  return <span className="fd-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}><FileText style={{ width: 11, height: 11 }} />Source: {children}</span>;
}

export function ConnectionsView({ people, kpis }: { people: CnPerson[]; kpis: CnKpis }) {
  const [filter, setFilter] = useState<'all' | 'warm' | 'awaiting'>('all');
  const [selected, setSelected] = useState(people[0]?.id ?? '');


  const visible = filter === 'warm' ? people.filter(p => p.warm)
    : filter === 'awaiting' ? people.filter(p => p.awaiting)
    : people;
  const person = people.find(p => p.id === selected) ?? people[0];

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)' };

  if (!person) {
    return (
      <div className="cn-root" style={{ padding: '24px 26px 40px' }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>Chicago Youth Centers</p>
        <h1 className="fd-display" style={{ fontSize: 'clamp(1.7rem,2.6vw,2.15rem)', margin: 0 }}>Connections</h1>
        <p style={{ marginTop: 12, color: 'var(--text-secondary)', maxWidth: '60ch' }}>No board-member connections loaded yet. Add them in the Prospecting workbook (Board Members tab) and they will appear here.</p>
      </div>
    );
  }

  const openingLine = person.warm
    ? `${person.whoKnows || 'Someone at CYC'} has a ${person.connectionType ? person.connectionType.toLowerCase() : 'connection'} to ${person.name}, who sits on the ${person.foundation} board.`
    : `${person.name} sits on the ${person.foundation} board. No connection to CYC is mapped yet — a warm path would turn this seat from cold to workable.`;

  return (
    <div className="cn-root" style={{ padding: '24px 26px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="fd-page-head">
        <div style={{ minWidth: 0 }}>
          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Chicago Youth Centers</p>
          <h1>Connections</h1>
          <p className="fd-lede">The board members behind the funders CYC is pursuing: who at CYC can reach them, and whether the foundation has funded CYC before. A warm introduction turns a cold prospect into a workable one.</p>
        </div>
      </div>

      <div className="fd-stats" style={{ marginBottom: 20 }}>
        <Stat label="Board members" value={kpis.board} sub="tracked from filings" />
        <Stat label="Foundations" value={kpis.foundations} sub="covered" />
        <Stat label="Warm connections" value={kpis.warm} accent sub="a path into CYC" />
        <Stat label="Awaiting outreach" value={kpis.awaiting} sub="no contact yet" />
      </div>

      <div data-cn-cols style={{ display: 'grid', gridTemplateColumns: '352px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

        {/* left list */}
        <div style={{ ...card, overflow: 'hidden', position: 'sticky', top: 68 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Board members</span>
              <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{visible.length} of {people.length}</span>
            </div>
            <div data-cn-filters style={{ display: 'flex', gap: 6 }}>
              {FILTERS.map(f => {
                const on = f.key === filter;
                return (
                  <button key={f.key} type="button" className="fd-seg" aria-pressed={on} onClick={() => setFilter(f.key)}>{f.label}</button>
                );
              })}
            </div>
          </div>
          <div data-cn-list style={{ maxHeight: 620, overflowY: 'auto' }}>
            {visible.map(p => {
              const on = p.id === selected;
              return (
                <div key={p.id} data-cn-person onClick={() => setSelected(p.id)} style={{ borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer', background: on ? 'var(--bg-page)' : undefined }}>
                  <div style={{ display: 'flex', gap: 11, padding: '13px 16px', ...(on ? { boxShadow: 'inset 2px 0 0 var(--accent)' } : {}) }}>
                    <b style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: on ? 'var(--accent)' : 'var(--bg-elevated)', color: on ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500 }}>{p.initials}</b>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 13, fontWeight: 500, letterSpacing: '-.005em', marginBottom: 2 }}>{p.name}</b>
                      <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title ? `${p.title}, ` : ''}{p.foundation}</span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {p.warm && <Chip text="Warm" color="var(--accent)" border="rgba(12,107,90,.3)" />}
                        {p.cycFunded === 'awarded' && <Chip text="Funded CYC" color="var(--accent)" border="rgba(12,107,90,.3)" />}
                        {p.whoKnows && <Chip text="Known" color={SLATE} border="rgba(91,115,131,.3)" />}
                        {p.awaiting && <Chip text="No outreach" color={AMBER} border="rgba(156,122,42,.32)" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* detail */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* the connection */}
          <div key={person.id} style={{ ...card, borderColor: 'rgba(12,107,90,.3)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: 'rgba(12,107,90,.05)', borderBottom: '1px solid rgba(12,107,90,.18)' }}>
              <Target style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
              <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>The connection</span>
              <span style={{ flex: 1 }} />
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.outreachStatus || 'No outreach yet'}</span>
            </div>
            <div style={{ padding: '18px 20px 20px' }}>
              <p className="fd-display" style={{ fontSize: 'clamp(1.2rem,2vw,1.5rem)', lineHeight: 1.3, margin: '0 0 14px' }}>{openingLine}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '0 24px', borderTop: '1px solid var(--border-hairline)' }}>
                <div style={{ padding: '12px 0' }}>
                  <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Connection</p>
                  <p style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5 }}>{person.warm ? `${person.connectionToCyc}${person.connectionType ? ` · ${person.connectionType}` : ''}` : 'No connection to CYC mapped.'}</p>
                  <Source>board roster</Source>
                </div>
                <div style={{ padding: '12px 0' }}>
                  <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Funding</p>
                  <p style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5 }}>{person.cycFunded === 'awarded' ? `${person.foundation} has funded CYC${person.cycAmount ? ` (${person.cycAmount})` : ''}.` : person.cycFunded === 'applied' ? `CYC has applied to ${person.foundation}; no decision yet.` : person.cycFunded === 'declined' ? `CYC applied to ${person.foundation} and was declined.` : person.cycFunded === 'pipeline' ? `${person.foundation} is on CYC's Instrumentl radar (researching / outreach); no application yet.` : `No CYC grant from ${person.foundation} on record.`}</p>
                  <Source>Instrumentl history</Source>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" className="fd-btn-primary"><Send style={{ width: 13, height: 13 }} />Draft the outreach</button>
                <button type="button" className="fd-btn"><Table2 style={{ width: 13, height: 13 }} />Add to cultivation list</button>
                <span style={{ flex: 1 }} />
                <span className="fd-caption" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.whoKnows ? `${person.whoKnows} knows them` : 'No path recorded'}</span>
              </div>
            </div>
          </div>

          {/* person + seat */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
              <b style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{person.initials}</b>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontSize: '1.45rem', lineHeight: 1.12, letterSpacing: '-.015em', margin: '0 0 4px' }}>{person.name}</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{person.title ? `${person.title}, ` : ''}{person.foundation}</p>
              </div>
              <span className="fd-tag" data-tone={person.warm ? 'accent' : 'slate'} style={{ flex: 'none', padding: '4px 8px' }}>
                {person.warm ? <Check style={{ width: 11, height: 11 }} /> : null}{person.warm ? 'Warm connection' : 'Cold seat'}
              </span>
            </div>

            <div style={{ padding: '20px 20px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Board seat</span>
                <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
                <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>From filings</span>
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--bg-surface)', boxShadow: '0 0 0 2px var(--accent)', flex: 'none', marginTop: 4 }} />
                  {person.cycFunded === 'awarded' && <span style={{ flex: 1, width: 1, background: 'var(--border-hairline)', margin: '4px 0' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: person.cycFunded === 'awarded' ? 22 : 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
                    <b style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.008em' }}>{person.foundation}</b>
                    <i className="fd-tag" data-tone="accent">Current seat</i>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-secondary)' }}>{person.title || 'Board member'}</p>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: 12 }}>
                    {person.funderType && <span><span style={{ color: 'var(--text-tertiary)' }}>Type </span><b style={{ fontWeight: 500 }}>{person.funderType}</b></span>}
                    {person.assets && <span><span style={{ color: 'var(--text-tertiary)' }}>Assets </span><b className="fd-mono" style={{ fontWeight: 500 }}>{person.assets}</b></span>}
                  </div>
                  <Source>board roster, from filings</Source>
                </div>
              </div>

              {person.cycFunded === 'awarded' && (
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', flex: 'none', marginTop: 4 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
                    <div className="fd-inset" style={{ padding: '11px 13px', borderColor: 'rgba(12,107,90,.26)', background: 'var(--accent-tint)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>Grant to CYC</span>
                        <span style={{ flex: 1 }} />
                        {person.cycAmount && <b className="fd-mono" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--accent)' }}>{person.cycAmount}</b>}
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{person.foundation} has funded CYC before — an existing relationship this board seat sits on top of.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* bottom two-col */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
            <div style={{ ...card, padding: '18px 20px' }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 14 }}>How to reach them</span>
              {person.whoKnows ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                  <b style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500 }}>{person.whoKnows.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</b>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{person.whoKnows}</b>
                    <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>{person.connectionType || 'Knows this board member'}</span>
                  </div>
                  <i className="fd-tag" data-tone="accent" style={{ flex: 'none' }}>Direct</i>
                </div>
              ) : (
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>No path recorded yet. Fill in &ldquo;Who at CYC knows them&rdquo; on the Board Members tab and it appears here.</p>
              )}
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '12px 0 0' }}>Paths come from the connections your team records. Every one links back to the board roster it came from.</p>
            </div>

            <div style={{ ...card, padding: '18px 20px' }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 14 }}>Foundation profile</span>
              {(person.funderType || person.assets || person.fundingFocus) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {person.funderType && <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Type</span><span style={{ fontSize: 12.5, fontWeight: 500 }}>{person.funderType}</span></div>}
                  {person.assets && <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Total assets</span><span className="fd-mono" style={{ fontSize: 12 }}>{person.assets}</span></div>}
                  {person.fundingFocus && <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Focus</span><span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{person.fundingFocus}</span></div>}
                  {person.notes && <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{person.notes}</p>}
                </div>
              ) : (
                <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Not on the cultivation list yet — no foundation profile loaded for {person.foundation}.</p>
              )}
            </div>
          </div>

          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Live workspace · your board &amp; funding data</p>
        </div>
      </div>
    </div>
  );
}
