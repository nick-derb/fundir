'use client';

import { useEffect, useState } from 'react';
import { Target, Send, Table2, Check, AlertCircle, FileText, Link as LinkIcon } from 'lucide-react';

// Faithful port of templates/connections/Connections.dc.html — the "officer
// trail" design. Specimen figures per the design (illustrative workspace); the
// real officer-resolution pipeline over 990 filings will feed this later.

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";

interface Seat {
  org: string; role: string; tenure: string;
  current?: boolean; cyc?: boolean;
  granted: string; share: string; source: string; external?: boolean; last?: boolean;
  cycAmount?: string; cycDetail?: string;
}
interface Path { initials: string; who: string; how: string; strong?: boolean; }
interface Person {
  id: string; name: string; initials: string; currentLine: string;
  fundedCyc: boolean; movedRecently: boolean; boardPath: boolean;
  confidence: 'high' | 'review'; matchScore?: string; seatCount: string;
  openedOn: string; opening: string;
  thenFact: string; thenSource: string; nowFact: string; nowSource: string;
  pathSummary: string; paths: Path[]; seats: Seat[];
}

const FILTERS = [
  { key: 'opening', label: 'Openings' },
  { key: 'moved', label: 'Moved' },
  { key: 'all', label: 'All' },
] as const;

const PEOPLE: Person[] = [
  {
    id: 'darlow', name: 'Gillian Darlow', initials: 'GD',
    currentLine: 'President, Crown Family Philanthropies · since Mar 2026',
    fundedCyc: true, movedRecently: true, boardPath: true,
    confidence: 'high', seatCount: '4 seats · 2009 to present',
    openedOn: 'Detected Aug 12, 2026',
    opening: 'She funded CYC twice from Polk Bros. Crown Family Philanthropies has never given to CYC, and she has run it since March.',
    thenFact: '$150,000 to CYC across FY22 and FY23 while Chief Executive Officer at Polk Bros. Foundation.',
    thenSource: '990-PF · Polk Bros · FY23 Part XV',
    nowFact: 'Listed as President of Crown Family Philanthropies, a funder with no CYC grant on record.',
    nowSource: '990-PF · Crown Family · FY26 Part VII',
    pathSummary: 'Dana Cole worked with her at Polk Bros',
    paths: [
      { initials: 'DC', who: 'Dana Cole', how: 'Overlapped at Polk Bros. Foundation, 2019 to 2021', strong: true },
      { initials: 'JR', who: 'John Rowe', how: 'Both served on the After School Matters board', strong: true },
      { initials: 'ND', who: 'Nick Derbis', how: 'Through Connie Lindsey at Northern Trust', strong: false },
    ],
    seats: [
      { org: 'Crown Family Philanthropies', role: 'President', tenure: 'Mar 2026 — present', current: true, granted: '$44.1M', share: '18%', source: '990-PF · FY26 · Part VII' },
      { org: 'Polk Bros. Foundation', role: 'Chief Executive Officer', tenure: '2015 — Feb 2026', cyc: true, granted: '$318.6M', share: '41%',
        cycAmount: '$150,000', cycDetail: 'Two general operating grants, FY22 and FY23, for out-of-school time programming in North Lawndale.',
        source: '990-PF · FY16 to FY26 · Part VII' },
      { org: 'Polk Bros. Foundation', role: 'Program Director, Education', tenure: '2009 — 2015', granted: '$142.0M', share: '38%', source: '990-PF · FY10 to FY15 · Part VII' },
      { org: 'Chicago Community Trust', role: 'Senior Program Officer', tenure: '2004 — 2009', granted: 'Not itemized', share: '—', source: '990 · FY05 to FY09 · Part VII', last: true },
    ],
  },
  {
    id: 'lindsey', name: 'Connie Lindsey', initials: 'CL',
    currentLine: 'Trustee, Robert R. McCormick Foundation · since Jan 2026',
    fundedCyc: false, movedRecently: true, boardPath: true,
    confidence: 'high', seatCount: '3 seats · 2011 to present',
    openedOn: 'Detected Jul 30, 2026',
    opening: 'A Northern Trust gala sponsor contact now holds a trustee seat at McCormick, where CYC has a letter of inquiry due September 4.',
    thenFact: 'Executive Vice President at Northern Trust, CYC gala sponsor for six consecutive years.',
    thenSource: 'CYC development records · FY20 to FY26',
    nowFact: 'Seated as a trustee at Robert R. McCormick Foundation as of January 2026.',
    nowSource: '990 · McCormick · FY26 Part VII',
    pathSummary: 'Nick Derbis has met her twice',
    paths: [
      { initials: 'ND', who: 'Nick Derbis', how: 'Gala sponsor contact since 2020', strong: true },
      { initials: 'PL', who: 'Piotr Lewicki', how: 'Northern Trust corporate giving review, 2024', strong: false },
      { initials: 'JR', who: 'John Rowe', how: 'Civic Committee overlap', strong: false },
    ],
    seats: [
      { org: 'Robert R. McCormick Foundation', role: 'Trustee', tenure: 'Jan 2026 — present', current: true, granted: '$302.5M', share: '26%', source: '990 · FY26 · Part VII' },
      { org: 'Northern Trust Foundation', role: 'Chair, Giving Committee', tenure: '2016 — 2025', granted: '$28.6M', share: '31%', source: '990-PF · FY17 to FY25 · Part VII' },
      { org: 'Northern Trust Corporation', role: 'Executive Vice President', tenure: '2011 — 2025', granted: 'Corporate, not itemized', share: '—', source: 'Professional profile', external: true, last: true },
    ],
  },
  {
    id: 'song', name: 'Unmi Song', initials: 'US',
    currentLine: 'President, Lloyd A. Fry Foundation · since 2012',
    fundedCyc: true, movedRecently: false, boardPath: false,
    confidence: 'high', seatCount: '2 seats · 2005 to present',
    openedOn: 'Standing relationship',
    opening: 'A current funder in her fourteenth year at the same seat. Continuity is the asset here, not a move.',
    thenFact: '$60,000 to CYC in FY25 for teen leadership programming.',
    thenSource: '990-PF · Lloyd A. Fry · FY25 Part XV',
    nowFact: 'Still President. Interim report due September 15.',
    nowSource: '990-PF · Lloyd A. Fry · FY26 Part VII',
    pathSummary: 'Dana Cole owns the relationship',
    paths: [
      { initials: 'DC', who: 'Dana Cole', how: 'Current grant relationship, four years', strong: true },
      { initials: 'ND', who: 'Nick Derbis', how: 'Site visit host, 2025', strong: true },
    ],
    seats: [
      { org: 'Lloyd A. Fry Foundation', role: 'President', tenure: '2012 — present', current: true, cyc: true, granted: '$188.4M', share: '44%',
        cycAmount: '$60,000', cycDetail: 'FY25 program grant for teen leadership. Interim report due September 15, 2026.',
        source: '990-PF · FY13 to FY26 · Part VII' },
      { org: 'Lloyd A. Fry Foundation', role: 'Program Officer', tenure: '2005 — 2012', granted: '$96.2M', share: '39%', source: '990-PF · FY06 to FY12 · Part VII', last: true },
    ],
  },
  {
    id: 'crown', name: 'James S. Crown', initials: 'JC',
    currentLine: 'Trustee, Crown Family Philanthropies · since 2003',
    fundedCyc: false, movedRecently: false, boardPath: true,
    confidence: 'review', matchScore: '84%', seatCount: '3 seats · possible duplicate',
    openedOn: 'Awaiting identity check',
    opening: 'Three filings name a Crown trustee with slight spelling variation. Confirm they are one person before the trail is trusted.',
    thenFact: 'Named as "James S. Crown" at Crown Family Philanthropies and "J. Crown" on two earlier returns.',
    thenSource: '990-PF · Crown Family · FY19 to FY26',
    nowFact: 'A former CYC board member lists Crown Holdings as a prior employer.',
    nowSource: 'CYC board roster · 2014 to 2018',
    pathSummary: 'Confirm identity to score the path',
    paths: [
      { initials: 'JR', who: 'John Rowe', how: 'CYC board alumni, Crown Holdings employer overlap', strong: false },
      { initials: 'DC', who: 'Dana Cole', how: 'Unverified, pending identity check', strong: false },
    ],
    seats: [
      { org: 'Crown Family Philanthropies', role: 'Trustee', tenure: '2003 — present', current: true, granted: '$380.6M', share: '22%', source: '990-PF · FY19 to FY26 · Part VII' },
      { org: 'Henry Crown and Company', role: 'Principal', tenure: '1985 — present', granted: 'Corporate, not itemized', share: '—', source: 'Professional profile', external: true },
      { org: 'Chicago Youth Centers', role: 'Board Member', tenure: '2014 — 2018', granted: '—', share: '—', source: 'CYC board roster', last: true },
    ],
  },
  {
    id: 'fitz', name: 'Dennis J. FitzSimons', initials: 'DF',
    currentLine: 'Director, Robert R. McCormick Foundation · since 2009',
    fundedCyc: false, movedRecently: false, boardPath: false,
    confidence: 'high', seatCount: '2 seats · 2003 to present',
    openedOn: 'No opening yet',
    opening: 'A long-seated McCormick director with no CYC history and no resolved path. Low priority until a connection appears.',
    thenFact: 'No grant to CYC from any seat on record.',
    thenSource: '990-PF · McCormick · FY10 to FY26',
    nowFact: 'Director since 2009, chair of the audit committee.',
    nowSource: '990 · McCormick · FY26 Part VII',
    pathSummary: 'No path found',
    paths: [
      { initials: '—', who: 'No path found', how: 'No overlap with current or former CYC board members', strong: false },
    ],
    seats: [
      { org: 'Robert R. McCormick Foundation', role: 'Director, Audit Chair', tenure: '2009 — present', current: true, granted: '$302.5M', share: '26%', source: '990 · FY10 to FY26 · Part VII' },
      { org: 'Tribune Company', role: 'Chairman and Chief Executive', tenure: '2003 — 2008', granted: '—', share: '—', source: 'Professional profile', external: true, last: true },
    ],
  },
];

const CSS = `
.cn-root{--radius-kpi:12px;--radius-console:14px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);background:var(--bg-page)}
.cn-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.cn-root .fd-kpi{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:-.01em}
.cn-root .fd-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.cn-root .fd-caption{font-size:12px;line-height:1.5}
@keyframes cn-pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes cn-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.cn-root [data-cn-person]{transition:background .14s,border-color .14s}
@media (max-width:1180px){.cn-root [data-cn-cols]{grid-template-columns:minmax(0,1fr)!important}.cn-root [data-cn-list]{max-height:none!important}}
@media (max-width:760px){.cn-root [data-cn-filters]{overflow-x:auto}}
`;

const AMBER = '#9C7A2A';
const SLATE = '#5B7383';

function Chip({ text, color, border }: { text: string; color: string; border: string }) {
  return (
    <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color, border: `1px solid ${border}`, borderRadius: 2, padding: '2px 5px' }}>{text}</i>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${accent ? 'rgba(12,107,90,.28)' : 'var(--border-hairline)'}`, borderRadius: 'var(--radius-kpi)', padding: '14px 15px' }}>
      <p className="fd-eyebrow" style={{ color: accent ? 'var(--accent)' : 'var(--text-tertiary)', margin: '0 0 8px' }}>{label}</p>
      <b className="fd-kpi" style={{ fontSize: 22, color: accent ? 'var(--accent)' : undefined }}>{value}</b>
    </div>
  );
}

export function ConnectionsView() {
  const [filter, setFilter] = useState<'opening' | 'moved' | 'all'>('opening');
  const [selected, setSelected] = useState('darlow');

  useEffect(() => {
    if (document.getElementById('cn-fonts')) return;
    const l = document.createElement('link');
    l.id = 'cn-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  }, []);

  const visible = filter === 'moved' ? PEOPLE.filter(p => p.movedRecently)
    : filter === 'opening' ? PEOPLE.filter(p => p.fundedCyc || p.movedRecently)
    : PEOPLE;
  const person = PEOPLE.find(p => p.id === selected) ?? PEOPLE[0];
  const lastIdx = person.seats.length - 1;

  return (
    <div className="cn-root" style={{ padding: '24px 26px 40px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>Chicago Youth Centers</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Connections</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>
          Officers and directors are named in every 990. Fundir resolves the same person across filings and years, so when someone who funded CYC takes a seat somewhere new, that seat becomes a warm prospect instead of a cold one.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Officers tracked" value="1,847" />
        <KpiCard label="Seats resolved" value="4,206" />
        <KpiCard label="Prior CYC funders, new seat" value="7" accent />
        <KpiCard label="Awaiting identity check" value="12" />
      </div>

      <div data-cn-cols style={{ display: 'grid', gridTemplateColumns: '352px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

        {/* left — officer trails */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', overflow: 'hidden', position: 'sticky', top: 68 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Officer trails</span>
              <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{visible.length} of {PEOPLE.length}</span>
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
                      <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)', marginBottom: 6 }}>{p.currentLine}</span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {p.fundedCyc && <Chip text="Funded CYC" color="var(--accent)" border="rgba(12,107,90,.3)" />}
                        {p.movedRecently && <Chip text="New seat" color={AMBER} border="rgba(156,122,42,.32)" />}
                        {p.boardPath && <Chip text="Board path" color={SLATE} border="rgba(91,115,131,.3)" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* right — detail */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* the opening */}
          <div key={person.id} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(12,107,90,.3)', borderRadius: 'var(--radius-console)', overflow: 'hidden', animation: 'cn-rise .3s cubic-bezier(.2,.8,.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: 'rgba(12,107,90,.05)', borderBottom: '1px solid rgba(12,107,90,.18)' }}>
              <Target style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />
              <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>The opening</span>
              <span style={{ flex: 1 }} />
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.openedOn}</span>
            </div>
            <div style={{ padding: '18px 20px 20px' }}>
              <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.25rem,2.1vw,1.6rem)', lineHeight: 1.28, letterSpacing: '-.012em', margin: '0 0 16px' }}>{person.opening}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                {([['Then', person.thenFact, person.thenSource], ['Now', person.nowFact, person.nowSource]] as const).map(([k, fact, src]) => (
                  <div key={k} style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px', background: 'var(--bg-page)' }}>
                    <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 6px' }}>{k}</p>
                    <p style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5 }}>{fact}</p>
                    <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.05em', color: 'var(--accent)' }}>{src}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px', borderRadius: 'var(--radius-kpi)', border: 'none', background: 'var(--accent)', color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}><Send style={{ width: 13, height: 13 }} />Draft the outreach</button>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 'var(--radius-kpi)', border: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}><Table2 style={{ width: 13, height: 13 }} />Add to cultivation list</button>
                <span style={{ flex: 1 }} />
                <span className="fd-caption" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.pathSummary}</span>
              </div>
            </div>
          </div>

          {/* person + seat history */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
              <b style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 500 }}>{person.initials}</b>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.55rem', lineHeight: 1.12, letterSpacing: '-.015em', margin: '0 0 4px' }}>{person.name}</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{person.currentLine}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flex: 'none' }}>
                {person.confidence === 'high'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.28)', borderRadius: 3, padding: '4px 8px', whiteSpace: 'nowrap' }}><Check style={{ width: 11, height: 11 }} />Identity confirmed</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: AMBER, border: '1px solid rgba(156,122,42,.32)', borderRadius: 3, padding: '4px 8px', whiteSpace: 'nowrap' }}><AlertCircle style={{ width: 11, height: 11 }} />Same person? {person.matchScore}</span>}
                <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{person.seatCount}</span>
              </div>
            </div>

            <div style={{ padding: '20px 20px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>Seat history</span>
                <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
                <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Newest first</span>
              </div>

              {person.seats.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {s.current
                      ? <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--bg-surface)', boxShadow: '0 0 0 2px var(--accent)', flex: 'none', marginTop: 4 }} />
                      : s.cyc
                        ? <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', flex: 'none', marginTop: 4 }} />
                        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#CFD8D3', flex: 'none', marginTop: 6 }} />}
                    {i !== lastIdx && <span style={{ flex: 1, width: 1, background: 'var(--border-hairline)', margin: '4px 0' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
                      <b style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.008em' }}>{s.org}</b>
                      {s.current && <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.3)', borderRadius: 2, padding: '2px 6px' }}>Current seat</i>}
                      {!s.current && s.cyc && <i className="fd-mono" style={{ fontStyle: 'normal', fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff', background: 'var(--accent)', borderRadius: 2, padding: '2px 6px' }}>Funded CYC</i>}
                      <span style={{ flex: 1 }} />
                      <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{s.tenure}</span>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.role}</p>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', background: 'var(--bg-page)' }}><i className="fd-eyebrow" style={{ fontStyle: 'normal', color: 'var(--text-tertiary)', marginRight: 7 }}>Granted while seated</i><b className="fd-mono" style={{ fontSize: 11.5, fontWeight: 500 }}>{s.granted}</b></span>
                      <span style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', background: 'var(--bg-page)' }}><i className="fd-eyebrow" style={{ fontStyle: 'normal', color: 'var(--text-tertiary)', marginRight: 7 }}>Youth &amp; education share</i><b className="fd-mono" style={{ fontSize: 11.5, fontWeight: 500 }}>{s.share}</b></span>
                    </div>

                    {s.cycAmount && (
                      <div style={{ border: '1px solid rgba(12,107,90,.26)', borderRadius: 'var(--radius-kpi)', padding: '11px 13px', background: 'rgba(12,107,90,.04)', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <span className="fd-eyebrow" style={{ color: 'var(--accent)' }}>Grant to CYC</span>
                          <span style={{ flex: 1 }} />
                          <b className="fd-mono" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--accent)' }}>{s.cycAmount}</b>
                        </div>
                        <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{s.cycDetail}</p>
                      </div>
                    )}

                    {s.external
                      ? <span className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: SLATE, border: '1px dashed rgba(91,115,131,.4)', borderRadius: 2, padding: '3px 7px' }}><LinkIcon style={{ width: 11, height: 11 }} />{s.source}</span>
                      : <a href="#" className="fd-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid rgba(12,107,90,.25)', paddingBottom: 2 }}><FileText style={{ width: 11, height: 11 }} />{s.source}</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* bottom two-col */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
            {/* how to reach them */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', padding: '18px 20px' }}>
              <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 14 }}>How to reach them</span>
              {person.paths.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                  <b style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 500 }}>{p.initials}</b>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{p.who}</b>
                    <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>{p.how}</span>
                  </div>
                  {p.strong
                    ? <i className="fd-mono" style={{ fontStyle: 'normal', flex: 'none', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(12,107,90,.3)', borderRadius: 2, padding: '2px 6px' }}>Direct</i>
                    : <i className="fd-mono" style={{ fontStyle: 'normal', flex: 'none', fontSize: 8.5, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', border: '1px solid var(--border-hairline)', borderRadius: 2, padding: '2px 6px' }}>2 hops</i>}
                </div>
              ))}
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: '12px 0 0' }}>Paths are scored by edge type and age. Every hop links to the filing or record it came from.</p>
            </div>

            {/* external enrichment */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-console)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <LinkIcon style={{ width: 13, height: 13, color: SLATE, flex: 'none' }} />
                <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>External enrichment</span>
                <span style={{ flex: 1 }} />
                <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', border: '1px solid var(--border-hairline)', borderRadius: 2, padding: '2px 6px', whiteSpace: 'nowrap' }}>Not connected</span>
              </div>
              <div style={{ border: '1px dashed rgba(91,115,131,.4)', borderRadius: 'var(--radius-kpi)', padding: 16, background: 'var(--bg-page)', marginBottom: 12 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>Filings confirm a seat only once a year, and only after it is filed. A professional-profile source would close that gap, surfacing a move within weeks instead of after the next return.</p>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>When connected, externally sourced seats appear on the trail with a dashed marker, never merged into filing-verified history.</p>
              </div>
              {[['01', 'Filing-verified facts stay the system of record'], ['02', 'External claims are labelled, dated and attributed'], ['03', 'A conflict between the two opens a review, never a silent overwrite']].map(([n, t], i) => (
                <div key={n} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--border-hairline)' : 'none' }}>
                  <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--accent)', flex: 'none' }}>{n}</span>
                  <span style={{ flex: 1, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Illustrative workspace · specimen figures</p>
        </div>
      </div>
    </div>
  );
}
