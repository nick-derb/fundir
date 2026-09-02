'use client';

import { useEffect, useState } from 'react';
import { Target, Send, Table2, Check, FileText } from 'lucide-react';

// Real board-network view in the "officer trail" design language, wired to
// funder_board_members + cyc_cultivation facts + the Instrumentl funding history.
// (The multi-year seat trail across 990 filings is a future pipeline; this shows
// the real board seats, connections, and CYC funding relationships we do have.)

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const AMBER = '#9C7A2A';
const SLATE = '#5B7383';

export interface CnPerson {
  id: string; name: string; initials: string; foundation: string; title: string;
  connectionToCyc: string; connectionType: string; whoKnows: string; outreachStatus: string;
  warm: boolean; awaiting: boolean;
  funderType: string; assets: string; fundingFocus: string; notes: string;
  cycFunded: 'awarded' | 'applied' | null; cycAmount: string;
}
export interface CnKpis { board: number; foundations: number; warm: number; awaiting: number; }

const CSS = `
.cn-root{--radius-kpi:12px;--radius-console:14px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);background:var(--bg-page)}
.cn-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.cn-root .fd-kpi{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.cn-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.cn-root .fd-caption{font-size:12px;line-height:1.5}
@keyframes cn-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
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
  return <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color, border: `1px solid ${border}`, borderRadius: 2, padding: '2px 5px' }}>{text}</i>;
}
function KpiCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${accent ? 'rgba(12,107,90,.28)' : 'var(--border-hairline)'}`, borderRadius: 'var(--radius-kpi)', padding: '14px 15px' }}>
      <p className="fd-eyebrow" style={{ color: accent ? 'var(--accent)' : 'var(--text-tertiary)', margin: '0 0 8px' }}>{label}</p>
      <b className="fd-kpi" style={{ fontSize: 22, color: accent ? 'var(--accent)' : undefined }}>{value.toLocaleString('en-US')}</b>
    </div>
  );
}

export function ConnectionsView({ people, kpis }: { people: CnPerson[]; kpis: CnKpis }) {
  const [filter, setFilter] = useState<'all' | 'warm' | 'awaiting'>('all');
  const [selected, setSelected] = useState(people[0]?.id ?? '');

  useEffect(() => {
    if (document.getElementById('cn-fonts')) return;
    const l = document.createElement('link');
    l.id = 'cn-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  }, []);

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
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', margin: 0 }}>Connections</h1>
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

      <div style={{ marginBottom: 20 }}>
        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>Chicago Youth Centers</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Connections</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>
          The board members behind the funders CYC is pursuing, with who at CYC can reach them and whether the foundation has funded CYC before. A warm introduction turns a cold prospect into a workable one.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Board members tracked" value={kpis.board} />
        <KpiCard label="Foundations covered" value={kpis.foundations} />
        <KpiCard label="Warm connections to CYC" value={kpis.warm} accent />
        <KpiCard label="Awaiting outreach" value={kpis.awaiting} />
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
                  <button key={f.key} onClick={() => setFilter(f.key)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer', flex: 'none' }}>
                    <span className="fd-mono" style={{ display: 'block', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 3, whiteSpace: 'nowrap',
                      ...(on ? { background: 'var(--accent)', color: '#fff' } : { border: '1px solid var(--border-hairline)', color: 'var(--text-tertiary)', background: 'var(--bg-surface)' }) }}>{f.label}</span>
                  </button>
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
                    <b style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: on ? 'var(--accent)' : 'var(--bg-elevated)', color: on ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 500 }}>{p.initials}</b>
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
          <div key={person.id} style={{ ...card, border: '1px solid rgba(12,107,90,.3)', overflow: 'hidden', animation: 'cn-rise .3s cubic-bezier(.2,.8,.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: 'rgba(12,107,90,.05)', borderBottom: '1px solid rgba(12,107,90,.18)' }}>
              <Target style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
              <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>The connection</span>
              <span style={{ flex: 1 }} />
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.outreachStatus || 'No outreach yet'}</span>
            </div>
            <div style={{ padding: '18px 20px 20px' }}>
              <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.25rem,2.1vw,1.6rem)', lineHeight: 1.28, letterSpacing: '-.012em', margin: '0 0 16px' }}>{openingLine}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px', background: 'var(--bg-page)' }}>
                  <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Connection</p>
                  <p style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5 }}>{person.warm ? `${person.connectionToCyc}${person.connectionType ? ` · ${person.connectionType}` : ''}` : 'No connection to CYC mapped.'}</p>
                  <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.05em', color: 'var(--accent)' }}>funder_board_members</span>
                </div>
                <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px', background: 'var(--bg-page)' }}>
                  <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Funding</p>
                  <p style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5 }}>{person.cycFunded === 'awarded' ? `${person.foundation} has funded CYC${person.cycAmount ? ` (${person.cycAmount})` : ''}.` : person.cycFunded === 'applied' ? `CYC has applied to ${person.foundation}, no award yet.` : `No CYC grant from ${person.foundation} on record.`}</p>
                  <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.05em', color: 'var(--accent)' }}>Instrumentl history</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--accent)', color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}><Send style={{ width: 13, height: 13 }} />Draft the outreach</button>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}><Table2 style={{ width: 13, height: 13 }} />Add to cultivation list</button>
                <span style={{ flex: 1 }} />
                <span className="fd-caption" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.whoKnows ? `${person.whoKnows} knows them` : 'No path recorded'}</span>
              </div>
            </div>
          </div>

          {/* person + seat */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
              <b style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 500 }}>{person.initials}</b>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.55rem', lineHeight: 1.12, letterSpacing: '-.015em', margin: '0 0 4px' }}>{person.name}</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{person.title ? `${person.title}, ` : ''}{person.foundation}</p>
              </div>
              <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: person.warm ? 'var(--accent)' : SLATE, border: `1px solid ${person.warm ? 'rgba(12,107,90,.28)' : 'rgba(91,115,131,.3)'}`, borderRadius: 3, padding: '4px 8px', whiteSpace: 'nowrap' }}>
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
                    <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.3)', borderRadius: 2, padding: '2px 6px' }}>Current seat</i>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-secondary)' }}>{person.title || 'Board member'}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {person.funderType && <span style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', background: 'var(--bg-page)' }}><i className="fd-eyebrow" style={{ fontStyle: 'normal', color: 'var(--text-tertiary)', marginRight: 7 }}>Type</i><b style={{ fontSize: 11.5, fontWeight: 500 }}>{person.funderType}</b></span>}
                    {person.assets && <span style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', background: 'var(--bg-page)' }}><i className="fd-eyebrow" style={{ fontStyle: 'normal', color: 'var(--text-tertiary)', marginRight: 7 }}>Assets</i><b className="fd-mono" style={{ fontSize: 11.5, fontWeight: 500 }}>{person.assets}</b></span>}
                  </div>
                  <span className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', borderBottom: '1px solid rgba(12,107,90,.25)', paddingBottom: 2 }}><FileText style={{ width: 11, height: 11 }} />funder_board_members</span>
                </div>
              </div>

              {person.cycFunded === 'awarded' && (
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', flex: 'none', marginTop: 4 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
                    <div style={{ border: '1px solid rgba(12,107,90,.26)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px', background: 'rgba(12,107,90,.04)' }}>
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
                  <b style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 500 }}>{person.whoKnows.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</b>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{person.whoKnows}</b>
                    <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>{person.connectionType || 'Knows this board member'}</span>
                  </div>
                  <i className="fd-mono" style={{ fontStyle: 'normal', flex: 'none', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.3)', borderRadius: 2, padding: '2px 6px' }}>Direct</i>
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
