'use client';

// Organizations — the funders, corporations and foundations CYC's graph
// touches, with what the graph knows about each: peer funding, CYC funding,
// trustees on file, CYC people inside, the best lead.

import { useEffect, useMemo, useState } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import type { OrgRow } from '@/lib/network/queries';
import { SERIF, MONO, OrgMark, ScoreBar, Chip, Eyebrow, Skeleton, hueFor, typeLabel, SLATE } from './shared';

const TYPE_ORDER = ['foundation', 'community_foundation', 'corporate_foundation', 'corporation', 'bank', 'nonprofit', 'university', 'government'];

export function OrganizationsView({ onOpenLead, onFocus }: { onOpenLead: (id: string) => void; onFocus: (f: { kind: 'org'; id: string }) => void }) {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [only, setOnly] = useState<'all' | 'leads' | 'peers' | 'people'>('all');
  useEffect(() => { fetch('/api/network/organizations').then(r => r.json()).then(b => setRows(b.organizations ?? [])).catch(() => setRows([])); }, []);
  const typeCounts = useMemo(() => { const m = new Map<string, number>(); for (const r of rows ?? []) m.set(r.type ?? 'other', (m.get(r.type ?? 'other') ?? 0) + 1); return [...m].sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0])); }, [rows]);
  const visible = useMemo(() => (rows ?? []).filter(r => (!types.length || types.includes(r.type ?? 'other')) && (only === 'all' || (only === 'leads' && r.leads) || (only === 'peers' && r.peer_events) || (only === 'people' && r.own_people)) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()))), [rows, types, only, q]);

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Organizations</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>The funders, corporations and foundations that appear in CYC&rsquo;s graph, and what the graph can say about each one from filings, rosters and CYC&rsquo;s own records.</p>
      </div>
      <div className="ni-card" style={{ padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'sticky', top: 56, zIndex: 5 }}>
        <label style={{ position: 'relative', flex: '1 1 200px', minWidth: 150 }}><Search style={{ position: 'absolute', left: 10, top: 9, width: 14, height: 14, color: 'var(--text-tertiary)' }} /><input className="ni-input" placeholder="Search organizations…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search organizations" /></label>
        {typeCounts.map(([t, n]) => <button key={t} type="button" className="ni-seg" aria-pressed={types.includes(t)} onClick={() => setTypes(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t])}>{typeLabel(t) || 'other'}<i>{n}</i></button>)}
        <span style={{ flex: 1 }} />
        <select className="ni-select" value={only} onChange={e => setOnly(e.target.value as typeof only)} aria-label="Show"><option value="all">Everything</option><option value="leads">With a lead</option><option value="peers">Funds CYC peers</option><option value="people">CYC people inside</option></select>
      </div>
      <div className="ni-card" style={{ overflow: 'hidden' }}>
        <div data-ni-grid="org" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) 120px 90px 90px 90px 110px', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }} aria-hidden>
          {['Organization', 'Type', 'Peer grants', 'Trustees', 'CYC people', 'Best lead'].map((h, i) => <span key={h} className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10 }} data-ni-hide-md={i >= 2 && i <= 4 ? true : undefined}>{h}</span>)}
        </div>
        {rows === null && Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}><Skeleton h={14} w={`${40 + (i * 13) % 40}%`} /></div>)}
        {rows !== null && visible.length === 0 && <p className="fd-caption" style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No organizations match.</p>}
        {visible.map((r, i) => (
          <div key={r.id} data-ni-grid="org" className="ni-row ni-rise" role="button" tabIndex={0} onClick={() => (r.top_lead_id ? onOpenLead(r.top_lead_id) : onFocus({ kind: 'org', id: r.id }))} onKeyDown={e => { if (e.key === 'Enter') (r.top_lead_id ? onOpenLead(r.top_lead_id) : onFocus({ kind: 'org', id: r.id })); }}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) 120px 90px 90px 90px 110px', gap: 12, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--border-hairline)', animationDelay: `${Math.min(400, i * 18)}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <OrgMark name={r.name} size={30} accent={!!r.top_lead_id} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <b style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</b>
                  {r.website && <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-tertiary)', lineHeight: 0, flex: 'none' }} aria-label="Website"><ExternalLink style={{ width: 11, height: 11 }} /></a>}
                </div>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                  {[r.city, r.state].filter(Boolean).length > 0 && <span className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{[r.city, r.state].filter(Boolean).join(', ')}</span>}
                  {r.funded_cyc && <Chip text="Funded CYC" color="var(--accent)" border="rgba(12,107,90,.3)" />}
                  {r.insight_types.slice(0, 2).map(t => <Chip key={t} text={hueFor(t).short} color={hueFor(t).color} border={hueFor(t).border} />)}
                </span>
              </div>
            </div>
            <span className="fd-mono" style={{ fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{typeLabel(r.type) || '—'}</span>
            <span data-ni-hide-md className="fd-mono" style={{ fontSize: 12, color: r.peer_events ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: MONO }}>{r.peer_events || '—'}</span>
            <span data-ni-hide-md className="fd-mono" style={{ fontSize: 12, color: r.trustees ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: MONO }}>{r.trustees || '—'}</span>
            <span data-ni-hide-md className="fd-mono" style={{ fontSize: 12, color: r.own_people ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: MONO }}>{r.own_people || '—'}</span>
            {r.top_score !== null ? <ScoreBar score={r.top_score} width={44} /> : <span className="fd-caption" style={{ color: SLATE, fontSize: 11 }}>view in map →</span>}
          </div>
        ))}
        <div style={{ padding: '9px 16px', background: 'var(--bg-page)' }}><span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{visible.length} of {rows?.length ?? 0}</span></div>
      </div>
    </div>
  );
}
