'use client';

// Relationships — the edge explorer. Every derived link in the graph with its
// grade and its source, filterable by kind and by how well it is documented.
// Click a row to see the two endpoints on the map.

import { useEffect, useMemo, useState } from 'react';
import type { EdgeRow } from '@/lib/network/queries';
import { SERIF, MONO, Avatar, OrgMark, Chip, Eyebrow, Skeleton, relLabel, AMBER, SLATE } from './shared';

const VER_TONE: Record<string, string> = { verified: 'var(--accent)', probable: SLATE, inferred: AMBER };
const VER_LABEL: Record<string, string> = { verified: 'documented', probable: 'undated', inferred: 'inferred' };

export function RelationshipsView({ onFocus }: { onFocus: (f: { kind: 'person' | 'org'; id: string }) => void }) {
  const [edges, setEdges] = useState<EdgeRow[] | null>(null);
  const [type, setType] = useState<string>('');
  const [ver, setVer] = useState<string>('');
  const [q, setQ] = useState('');
  useEffect(() => {
    setEdges(null);
    const sp = new URLSearchParams(); if (type) sp.set('type', type); if (ver) sp.set('verification', ver); sp.set('limit', '500');
    fetch(`/api/network/relationships?${sp}`).then(r => r.json()).then(b => setEdges(b.edges ?? [])).catch(() => setEdges([]));
  }, [type, ver]);
  const types = useMemo(() => { const m = new Map<string, number>(); for (const e of edges ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, [edges]);
  const visible = useMemo(() => (edges ?? []).filter(e => !q.trim() || `${e.a.name} ${e.b.name} ${e.summary ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [edges, q]);
  const verCounts = useMemo(() => { const m: Record<string, number> = { verified: 0, probable: 0, inferred: 0 }; for (const e of edges ?? []) m[e.verification] = (m[e.verification] ?? 0) + 1; return m; }, [edges]);

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Relationships</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>Every link Fundir derived, graded by how well it is documented: <b style={{ color: 'var(--accent)', fontWeight: 500 }}>documented</b> links have cited facts on both ends and dated overlap; <b style={{ color: SLATE, fontWeight: 500 }}>undated</b> ones are cited but cannot prove the overlap; <b style={{ color: AMBER, fontWeight: 500 }}>inferred</b> ones rest on an uncited fact.</p>
      </div>
      <div className="ni-card" style={{ padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'sticky', top: 56, zIndex: 5 }}>
        <input className="ni-input" style={{ paddingLeft: 10, flex: '1 1 200px', minWidth: 150 }} placeholder="Search names or evidence…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search relationships" />
        {(['verified', 'probable', 'inferred'] as const).map(v => <button key={v} type="button" className="ni-seg" aria-pressed={ver === v} onClick={() => setVer(ver === v ? '' : v)}><span style={{ width: 14, borderTop: `1.5px ${v === 'verified' ? 'solid' : v === 'probable' ? 'dashed' : 'dotted'} ${VER_TONE[v]}` }} />{VER_LABEL[v]}<i>{verCounts[v] ?? 0}</i></button>)}
        <span style={{ flex: 1 }} />
        <select className="ni-select" value={type} onChange={e => setType(e.target.value)} aria-label="Relationship type">
          <option value="">All types</option>
          {['former_colleague', 'current_colleague', 'shared_employer', 'shared_board', 'shared_university', 'existing_cyc_relationship', 'corporate_connection', 'foundation_connection', 'philanthropic_overlap', 'geographic_overlap', 'second_degree'].map(t => <option key={t} value={t}>{relLabel(t)}</option>)}
        </select>
      </div>
      <div className="ni-card" style={{ overflow: 'hidden' }}>
        {edges === null && Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}><Skeleton h={14} w={`${45 + (i * 17) % 40}%`} /></div>)}
        {edges !== null && visible.length === 0 && <p className="fd-caption" style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No relationships match.</p>}
        {visible.map((e, i) => (
          <div key={e.id} data-ni-grid="edge" className="ni-row ni-rise" role="button" tabIndex={0} onClick={() => onFocus({ kind: e.a.own ? e.b.kind : e.a.kind, id: e.a.own ? e.b.id : e.a.id })} onKeyDown={ev => { if (ev.key === 'Enter') onFocus({ kind: e.a.kind, id: e.a.id }); }}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 30px minmax(180px,1fr) 130px minmax(200px,1.6fr) 60px', gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border-hairline)', animationDelay: `${Math.min(400, i * 14)}ms` }}>
            <End e={e.a} />
            <span aria-hidden style={{ display: 'flex', justifyContent: 'center' }}><span style={{ width: 24, borderTop: `1.5px ${e.verification === 'verified' ? 'solid' : e.verification === 'probable' ? 'dashed' : 'dotted'} ${VER_TONE[e.verification]}` }} /></span>
            <End e={e.b} />
            <span><Chip text={relLabel(e.type)} color={VER_TONE[e.verification]} border={`color-mix(in srgb, ${VER_TONE[e.verification]} 35%, transparent)`} /></span>
            <span data-ni-hide-md className="fd-caption" style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.summary ?? ''}>{e.summary ?? '—'}{e.source_type ? <span className="fd-mono" style={{ color: 'var(--text-tertiary)', fontSize: 9.5, marginLeft: 6 }}>· {e.source_type.replace(/_/g, ' ')}</span> : null}</span>
            <b className="fd-mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'right', fontFamily: MONO }}>{Math.round(e.strength)}</b>
          </div>
        ))}
        <div style={{ padding: '9px 16px', background: 'var(--bg-page)' }}><span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{visible.length} link{visible.length === 1 ? '' : 's'}{edges && edges.length >= 500 ? ' · showing the strongest 500' : ''} · types: {types.slice(0, 4).map(([t, n]) => `${relLabel(t)} ${n}`).join(' · ')}</span></div>
      </div>
    </div>
  );
}

function End({ e }: { e: EdgeRow['a'] }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      {e.kind === 'person' ? <Avatar name={e.name} size={24} own={e.own} /> : <OrgMark name={e.name} size={24} />}
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</b>
        {e.own && <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>CYC</span>}
      </span>
    </span>
  );
}
