'use client';

// Peer Network — who runs fundraising and leadership at the organizations most
// like CYC, and what CYC can do with each of them. One list, one record panel.
// Deliberately separate from Connections (CYC's own board, trustees, leads).

import { useMemo, useState } from 'react';
import { Search, ExternalLink, Route, Landmark, Briefcase, GraduationCap, Users, Building2, ArrowRight } from 'lucide-react';
import type { PeerOrgCard, PeerPerson, FunderRelation } from '@/lib/network/peer-network';
import type { PeerStaffStatus } from '@/lib/network/peer-staff';
import { PeerScanPanel } from '@/components/peers/peer-scan-panel';
import { useConsoleFonts, SERIF, MONO, Avatar, Chip, Eyebrow, SectionRule, ScoreBar, SLATE, AMBER, INFO } from '@/components/connections/intel/shared';

const CSS = `
.pn-root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary)}
.pn-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.pn-root .fd-mono{font-family:${MONO};font-variant-numeric:tabular-nums}
.pn-row{display:grid;grid-template-columns:34px minmax(0,1fr) 92px;gap:12px;align-items:center;padding:11px 12px;border-bottom:1px solid var(--border-hairline);cursor:pointer;transition:background .14s}
.pn-row:hover{background:var(--bg-elevated)}
.pn-row[data-on="true"]{background:var(--accent-tint)}
.pn-cols{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
.pn-list{max-height:calc(100vh - 330px);overflow-y:auto}
.pn-pill{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border-hairline);background:var(--bg-surface);font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap}
.pn-pill[data-on="true"]{border-color:var(--accent);color:var(--accent);background:var(--accent-tint)}
.pn-orgs{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}
.pn-org{flex:0 0 190px;background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:12px;padding:10px 12px;cursor:pointer;transition:border-color .14s}
.pn-org:hover{border-color:var(--border-strong)}
.pn-org[data-on="true"]{border-color:var(--accent)}
@media (max-width:1100px){.pn-cols{grid-template-columns:minmax(0,1fr)}.pn-list{max-height:none}.pn-panel{position:static!important}}
`;

const REL: Record<FunderRelation | 'peer_funder', { label: string; color: string }> = {
  funds_cyc: { label: 'Funds CYC', color: 'var(--accent)' }, cyc_pursuing: { label: 'CYC pursuing', color: AMBER }, untapped: { label: 'Not yet approached', color: SLATE }, peer_funder: { label: 'Funds a peer', color: INFO },
};
const TIER: Record<PeerPerson['tier'], { label: string; color: string }> = { development: { label: 'Development', color: 'var(--accent)' }, executive: { label: 'Leadership', color: INFO }, other: { label: 'Staff', color: SLATE } };
const verColor = (v: string) => (v === 'verified' ? 'var(--accent)' : v === 'probable' ? SLATE : AMBER);
const years = (s: number | null, e: number | null, cur: boolean) => (s || e || cur ? `${s ?? '…'}–${cur ? 'present' : e ?? '…'}` : '');

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${accent ? 'rgba(12,107,90,.28)' : 'var(--border-hairline)'}`, borderRadius: 12, padding: '13px 15px' }}>
      <Eyebrow color={accent ? 'var(--accent)' : undefined}>{label}</Eyebrow>
      <b className="fd-mono" style={{ display: 'block', marginTop: 6, fontSize: 22, fontWeight: 600, color: accent ? 'var(--accent)' : undefined }}>{value}</b>
    </div>
  );
}

export function PeerNetworkView({ peers, people, status, isAdmin }: { peers: PeerOrgCard[]; people: PeerPerson[]; status: PeerStaffStatus; isAdmin: boolean }) {
  useConsoleFonts();
  const [q, setQ] = useState('');
  const [org, setOrg] = useState<string | null>(null);
  const [tier, setTier] = useState<'all' | 'development' | 'executive'>('all');
  const [only, setOnly] = useState<'all' | 'path' | 'funder'>('all');
  const [sort, setSort] = useState<'best' | 'name' | 'org'>('best');
  const [selected, setSelected] = useState<string | null>(people[0]?.id ?? null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = people.filter(p =>
      (!org || p.orgId === org) &&
      (tier === 'all' || p.tier === tier) &&
      (only === 'all' || (only === 'path' ? p.paths.length > 0 : p.funderPast.length > 0 || p.cycAlumni)) &&
      (!needle || `${p.name} ${p.title ?? ''} ${p.org} ${p.career.map(c => c.org).join(' ')}`.toLowerCase().includes(needle)));
    if (sort === 'name') r = [...r].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'org') r = [...r].sort((a, b) => a.org.localeCompare(b.org) || b.score - a.score);
    return r;
  }, [people, q, org, tier, only, sort]);
  const person = people.find(p => p.id === selected) ?? rows[0] ?? null;
  const peerOf = person ? peers.find(p => p.id === person.orgId) : null;
  const withPath = people.filter(p => p.paths.length).length;
  const exFunder = people.filter(p => p.funderPast.length || p.cycAlumni).length;
  const overlapFunders = new Set(peers.flatMap(p => p.funders.filter(f => f.relation !== 'untapped').map(f => f.name))).size;

  return (
    <div className="pn-root" style={{ padding: '24px 26px 40px' }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Eyebrow>Peer network</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: '8px 0 0' }}>People at CYC&apos;s peer organizations</h1>
          <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '68ch' }}>
            The development and leadership staff at the youth-serving nonprofits most like CYC, read from public LinkedIn profiles. Each person shows every documented way CYC could reach them: a colleague of a CYC board member, a past job at a funder CYC tracks, or the funders behind their own organization. These are not CYC contacts; those live under Connections.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Kpi label="Peers scanned" value={`${status.scanned} / ${status.peers}`} />
        <Kpi label="People found" value={people.length} />
        <Kpi label="With a path to CYC" value={withPath} accent />
        <Kpi label="Ex-funder or CYC alumni" value={exFunder} />
        <Kpi label="Funders in common" value={overlapFunders} />
      </div>

      {isAdmin && <PeerScanPanel status={status} />}

      {/* Organizations strip */}
      <SectionRule label="Organizations" right={org ? <button type="button" className="pn-pill" onClick={() => setOrg(null)}>Show all</button> : undefined} />
      <div className="pn-orgs">
        {peers.map(p => (
          <div key={p.id} className="pn-org" data-on={org === p.id} onClick={() => setOrg(org === p.id ? null : p.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 style={{ width: 13, height: 13, color: 'var(--text-tertiary)', flex: 'none' }} />
              <b style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
            </div>
            <p className="fd-mono" style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              {p.scan ? (p.scan.status === 'done' ? `${p.staff} people · ${p.withPath} with a path` : p.scan.status === 'no_company' ? 'not on LinkedIn' : 'scan error') : 'not scanned yet'}
            </p>
            {p.funders.some(f => f.relation !== 'untapped') && <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Shares {p.funders.filter(f => f.relation !== 'untapped').length} funder{p.funders.filter(f => f.relation !== 'untapped').length === 1 ? '' : 's'} with CYC&apos;s list</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 10px' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'var(--bg-surface)', minWidth: 220 }}>
          <Search style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, title, employer…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--text-primary)', width: '100%' }} />
        </label>
        {(['all', 'development', 'executive'] as const).map(t => <button key={t} type="button" className="pn-pill" data-on={tier === t} onClick={() => setTier(t)}>{t === 'all' ? 'All roles' : TIER[t].label}</button>)}
        <span style={{ width: 1, height: 18, background: 'var(--border-hairline)' }} />
        <button type="button" className="pn-pill" data-on={only === 'path'} onClick={() => setOnly(only === 'path' ? 'all' : 'path')}><Route style={{ width: 12, height: 12, marginRight: 5 }} />Has a path to CYC</button>
        <button type="button" className="pn-pill" data-on={only === 'funder'} onClick={() => setOnly(only === 'funder' ? 'all' : 'funder')}><Landmark style={{ width: 12, height: 12, marginRight: 5 }} />Ex-funder / CYC alumni</button>
        <span style={{ flex: 1 }} />
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{ height: 30, border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, padding: '0 8px' }}>
          <option value="best">Best paths first</option><option value="name">Name</option><option value="org">Organization</option>
        </select>
        <span className="fd-mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rows.length} of {people.length}</span>
      </div>

      <div className="pn-cols">
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 14, overflow: 'hidden' }}>
          <div className="pn-list">
            {rows.length === 0 && <p style={{ padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>{people.length ? 'No one matches these filters.' : 'No peer staff yet. Run the scan above to read the peers.'}</p>}
            {rows.map((p, i) => (
              <div key={p.id} className="pn-row" data-on={person?.id === p.id} onClick={() => setSelected(p.id)}>
                <Avatar name={p.name} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: verColor(p.verification), flex: 'none' }} title={p.enrichedAt ? 'Profile read' : 'Found by search; profile not read yet'} />
                    <b style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
                    <Chip text={TIER[p.tier].label} color={TIER[p.tier].color} border={`color-mix(in srgb, ${TIER[p.tier].color} 35%, transparent)`} />
                    {p.paths.length > 0 && <Chip text={`${p.paths.length} path${p.paths.length === 1 ? '' : 's'}`} color="var(--accent)" border="rgba(12,107,90,.3)" />}
                    {p.cycAlumni && <Chip text="CYC alum" color={AMBER} border="rgba(156,122,42,.35)" />}
                    {p.funderPast.length > 0 && <Chip text="Ex-funder" color={INFO} border="rgba(62,108,168,.35)" />}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[p.title, p.org, p.location].filter(Boolean).join(' · ')}</p>
                </div>
                <ScoreBar score={p.score} delay={i * 12} />
              </div>
            ))}
          </div>
        </div>

        {/* Record panel */}
        <div className="pn-panel" style={{ position: 'sticky', top: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 14, padding: '18px 18px 20px', minHeight: 200 }}>
          {!person ? <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Select a person.</p> : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Avatar name={person.name} size={44} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, lineHeight: 1.1, margin: 0 }}>{person.name}</h2>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{[person.title, person.org].filter(Boolean).join(' · ')}{person.location ? <><br />{person.location}</> : null}</p>
                  {person.headline && person.headline !== person.title && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>{person.headline}</p>}
                </div>
                {person.linkedinUrl && <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[7px] border border-hairline text-[11.5px] text-secondary" style={{ flex: 'none' }}>LinkedIn <ExternalLink style={{ width: 11, height: 11 }} /></a>}
              </div>

              <SectionRule label="Why this person matters" />
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {person.why.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
              </ul>
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-tint)', border: '1px solid rgba(12,107,90,.2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <ArrowRight style={{ width: 14, height: 14, color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-primary)' }}><b style={{ fontWeight: 600 }}>Suggested move.</b> {person.move}</p>
              </div>

              {person.paths.length > 0 && (
                <>
                  <SectionRule label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users style={{ width: 12, height: 12 }} />Paths to CYC</span>} />
                  {person.paths.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                      <Avatar name={p.person.name} size={26} own={p.person.kind !== 'trustee' && p.person.kind !== 'executive'} />
                      <div style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 12.5, fontWeight: 500 }}>{p.person.name}</b> <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{p.person.kindLabel}{p.person.title ? ` · ${p.person.title}` : ''}</span>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{p.summary ?? p.label} <span className="fd-mono" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: verColor(p.verification) }}>{p.verification}</span></p>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <SectionRule label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Briefcase style={{ width: 12, height: 12 }} />Career</span>} />
              {person.career.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{person.enrichedAt ? 'No career history on the profile.' : 'Profile not read yet; the next scan step will read it.'}</p>}
              {person.career.map((c, i) => {
                const fp = person.funderPast.find(f => f.org === c.org);
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
                    <span className="fd-mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{years(c.start, c.end, c.current)}</span>
                    <span><b style={{ fontWeight: 500 }}>{c.org}</b>{c.title ? <span style={{ color: 'var(--text-secondary)' }}> · {c.title}</span> : null}{fp && <> <Chip text={REL[fp.relation].label} color={REL[fp.relation].color} border={`color-mix(in srgb, ${REL[fp.relation].color} 35%, transparent)`} /></>}{person.peerPast.includes(c.org) && <> <Chip text="CYC peer" color={SLATE} border="var(--border-hairline)" /></>}</span>
                  </div>
                );
              })}

              {person.education.length > 0 && (
                <>
                  <SectionRule label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><GraduationCap style={{ width: 12, height: 12 }} />Education</span>} />
                  {person.education.map((e, i) => <p key={i} style={{ margin: '0 0 4px', fontSize: 12.5 }}><b style={{ fontWeight: 500 }}>{e.school}</b>{e.degree || e.field ? <span style={{ color: 'var(--text-secondary)' }}> · {[e.degree, e.field].filter(Boolean).join(', ')}</span> : null}</p>)}
                </>
              )}

              {peerOf && peerOf.funders.length > 0 && (
                <>
                  <SectionRule label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Landmark style={{ width: 12, height: 12 }} />Who funds {peerOf.name}</span>} />
                  <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>From the funders&apos; IRS 990 filings. Green means the funder already gives to CYC; amber means CYC is pursuing them; grey means CYC has not approached them.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {peerOf.funders.map((f, i) => <span key={i} title={`${f.events} grant${f.events === 1 ? '' : 's'}${f.lastYear ? `, latest ${f.lastYear}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}><span style={{ width: 7, height: 7, borderRadius: 4, background: REL[f.relation].color }} />{f.name}</span>)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
