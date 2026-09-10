'use client';

// Map — the graph explorer. Opens on the overview (the paths behind the
// strongest leads), focuses on whatever you double-click or search for, and
// keeps a breadcrumb so you can walk back. A side card describes the
// selected node and offers the lead behind it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Home, ChevronRight, Loader2, Maximize2 } from 'lucide-react';
import type { GraphPayload, GraphNode } from '@/lib/network/queries';
import { GraphCanvas } from './graph-canvas';
import { SERIF, MONO, Eyebrow, Chip, hueFor, typeLabel, relLabel } from './shared';

export interface MapFocus { kind: 'person' | 'org'; id: string }

export function MapView({ focus, onFocus, onOpenLead }: { focus: MapFocus | null; onFocus: (f: MapFocus | null) => void; onOpenLead: (id: string) => void }) {
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [q, setQ] = useState('');
  const [trail, setTrail] = useState<Array<{ label: string; focus: MapFocus | null }>>([{ label: 'Overview', focus: null }]);
  const [full, setFull] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (f: MapFocus | null, query?: string) => {
    setLoading(true); setError('');
    try {
      const sp = new URLSearchParams(); if (query) sp.set('q', query); else if (f) { sp.set('kind', f.kind); sp.set('id', f.id); }
      const b = await fetch(`/api/network/graph?${sp}`).then(r => r.json());
      if (b.error) { setError(b.error); return; }
      const p = b as GraphPayload;
      setData(p); setSelected(p.nodes.find(n => n.focus) ?? null);
      const fx = p.focus ? { kind: p.focus.kind, id: p.focus.id } : null;
      setTrail(t => { const label = p.focus?.label ?? 'Overview'; const idx = t.findIndex(x => (x.focus?.id ?? null) === (fx?.id ?? null)); return idx >= 0 ? t.slice(0, idx + 1) : [...t, { label, focus: fx }].slice(-6); });
      if ((fx?.id ?? null) !== (f?.id ?? null)) onFocus(fx);
    } catch { setError('Could not load the map'); }
    finally { setLoading(false); }
  }, [onFocus]);

  useEffect(() => { load(focus); }, [focus?.id, focus?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const degree = selected ? (data?.links.filter(l => l.source === selected.id || l.target === selected.id).length ?? 0) : 0;
  const neighbours = selected ? (data?.links.filter(l => l.source === selected.id || l.target === selected.id).map(l => ({ link: l, other: data!.nodes.find(n => n.id === (l.source === selected.id ? l.target : l.source)) })).filter(x => x.other).slice(0, 12) ?? []) : [];

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Map</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '60ch' }}>The overview shows only the paths behind CYC&rsquo;s strongest leads. Double-click anything to see everything it touches; the graph moves rather than reshuffles, so you can keep your bearings.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (q.trim()) load(null, q.trim()); }} style={{ position: 'relative', flex: '0 1 320px', minWidth: 220 }}>
          <Search style={{ position: 'absolute', left: 10, top: 9, width: 14, height: 14, color: 'var(--text-tertiary)' }} />
          <input className="ni-input" placeholder="Focus on a person or organization…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a node" />
        </form>
      </div>

      <div ref={wrapRef} style={{ display: 'grid', gridTemplateColumns: full ? '1fr' : 'minmax(0,1fr) 300px', gap: 14, alignItems: 'stretch' }}>
        <div className="ni-card" style={{ overflow: 'hidden', position: 'relative', minHeight: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface)', flexWrap: 'wrap' }}>
            {trail.map((t, i) => (
              <span key={`${t.focus?.id ?? 'root'}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <ChevronRight style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} />}
                <button type="button" onClick={() => load(t.focus)} style={{ border: 'none', background: 'none', padding: '2px 4px', font: 'inherit', fontSize: 12, cursor: 'pointer', color: i === trail.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === trail.length - 1 ? 500 : 400, display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 4 }}>
                  {i === 0 && <Home style={{ width: 12, height: 12 }} />}{t.label}
                </button>
              </span>
            ))}
            <span style={{ flex: 1 }} />
            {loading && <Loader2 className="animate-spin" style={{ width: 13, height: 13, color: 'var(--text-tertiary)' }} />}
            {data && <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{data.nodes.length} nodes · {data.links.length} links</span>}
            <button type="button" className="ni-ghost" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => setFull(f => !f)} aria-pressed={full}><Maximize2 style={{ width: 11, height: 11 }} />{full ? 'Show panel' : 'Wide'}</button>
          </div>
          {error ? <p className="fd-caption" style={{ padding: 20, color: 'var(--warning)' }}>{error}</p> : (
            <GraphCanvas data={data} height={full ? 640 : 520} selectedId={selected?.id ?? null} onSelect={n => setSelected(n ?? data?.nodes.find(x => x.focus) ?? null)} onActivate={n => { if (n.rowId) load({ kind: n.kind, id: n.rowId }); }} />
          )}
        </div>

        {!full && (
          <div className="ni-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {selected ? (
              <div className="ni-rise" key={selected.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Chip text={selected.own ? 'CYC' : selected.kind === 'person' ? 'person' : typeLabel(selected.orgType) || 'organization'} color={selected.own ? 'var(--accent)' : 'var(--text-secondary)'} border={selected.own ? 'rgba(12,107,90,.3)' : 'var(--border-hairline)'} />
                  {selected.score !== null && <span className="fd-mono" style={{ fontSize: 10, color: selected.score >= 70 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: MONO }}>score {selected.score}</span>}
                </div>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: '1.35rem', lineHeight: 1.15, letterSpacing: '-.012em', margin: '0 0 4px' }}>{selected.label}</h2>
                {selected.sub && <p className="fd-caption" style={{ margin: 0, color: 'var(--text-secondary)' }}>{selected.sub}</p>}
                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  {selected.rowId && !selected.focus && <button type="button" className="ni-ghost" style={{ height: 28 }} onClick={() => load({ kind: selected.kind, id: selected.rowId! })}>Focus here</button>}
                  {selected.lead_id && <button type="button" className="ni-primary" style={{ height: 28 }} onClick={() => onOpenLead(selected.lead_id!)}>Open lead</button>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px' }}><Eyebrow color="var(--text-secondary)">{degree} link{degree === 1 ? '' : 's'} here</Eyebrow><span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} /></div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {neighbours.map(({ link, other }) => (
                    <li key={other!.id}>
                      <button type="button" onClick={() => setSelected(other!)} onDoubleClick={() => other!.rowId && load({ kind: other!.kind, id: other!.rowId })} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'none', padding: '4px 0', font: 'inherit', cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
                        <span style={{ width: 16, borderTop: `1.5px ${link.verification === 'verified' ? 'solid' : link.verification === 'probable' ? 'dashed' : 'dotted'} ${link.type === 'white_space' ? '#9C7A2A' : 'var(--text-secondary)'}`, flex: 'none' }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <b style={{ display: 'block', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{other!.label}</b>
                          <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', letterSpacing: '.04em' }}>{relLabel(link.type)}{link.label && link.type !== 'relationship' ? ` · ${link.label.slice(0, 40)}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {degree > neighbours.length && <li className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>and {degree - neighbours.length} more — focus here to see them all</li>}
                </ul>
              </div>
            ) : (
              <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Click a node to read about it; double-click to make it the centre.</p>
            )}
            <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
              <Eyebrow style={{ display: 'block', marginBottom: 6 }}>Reading the map</Eyebrow>
              <p className="fd-caption" style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 11.5 }}>Circles are people, squares are organizations. <span style={{ color: hueFor('Untapped Funder').color }}>Amber</span> squares carry a lead. A solid line is documented with dates; dashed is documented but undated; dotted is inferred. Scroll to zoom, drag to pan, drag a node to pin it while you look.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
