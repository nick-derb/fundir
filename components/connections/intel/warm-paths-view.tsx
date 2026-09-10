'use client';

// Warm paths — the same leads, grouped by the CYC person who can make the
// introduction. Reads as "through Phil Doherty: four doors", which is how a
// development director actually plans an ask.

import { useMemo } from 'react';
import type { LeadRow } from '@/lib/network/queries';
import { PathRail } from './path-rail';
import { SERIF, Avatar, ConfChip, ScoreBar, TypeChip, Eyebrow } from './shared';

export function WarmPathsView({ leads, selectedId, onOpen, onPerson }: { leads: LeadRow[]; selectedId: string | null; onOpen: (id: string) => void; onPerson: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, { via: NonNullable<LeadRow['via']>; leads: LeadRow[] }>();
    for (const l of leads) { if (!l.via || ['NOT_A_FIT', 'LOST'].includes(l.pipeline_status)) continue; const g = m.get(l.via.id) ?? { via: l.via, leads: [] }; g.leads.push(l); m.set(l.via.id, g); }
    return [...m.values()].map(g => ({ ...g, leads: g.leads.sort((a, b) => b.score - a.score), best: Math.max(...g.leads.map(l => l.score)) })).sort((a, b) => b.best - a.best || b.leads.length - a.leads.length);
  }, [leads]);
  const funders = new Set(leads.filter(l => l.via).map(l => l.target?.id).filter(Boolean)).size;

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Warm paths</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>
          {groups.length ? `${groups.length} CYC ${groups.length === 1 ? 'person opens' : 'people open'} doors at ${funders} funder${funders === 1 ? '' : 's'}. Each path is a shared room — an employer, a board — never an assumed friendship; the connector shows how well that room is documented.` : 'No warm paths yet. Map board members’ LinkedIn URLs and run a refresh; paths appear here as career histories overlap with funder trustees.'}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((g, gi) => (
          <div key={g.via.id} className="ni-card ni-rise" style={{ overflow: 'hidden', animationDelay: `${gi * 40}ms` }}>
            <button type="button" onClick={() => onPerson(g.via.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 18px', border: 'none', background: 'var(--bg-page)', borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer', textAlign: 'left', color: 'inherit' }} title="Open in map">
              <Avatar name={g.via.name} size={34} own />
              <span style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'block', fontSize: 14.5, fontWeight: 500, letterSpacing: '-.008em' }}>Through {g.via.name}</b>
                <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>{g.via.role ? `CYC ${g.via.role}` : 'CYC'} · {g.leads.length} path{g.leads.length === 1 ? '' : 's'} · best {g.best}</span>
              </span>
            </button>
            {g.leads.map(l => (
              <div key={l.id} className="ni-row" data-active={l.id === selectedId} role="button" tabIndex={0} onClick={() => onOpen(l.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(l.id); }} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 90px', gap: 14, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--border-hairline)' }}>
                <ScoreBar score={l.score} width={52} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}><b style={{ fontSize: 13, fontWeight: 500 }}>{l.target?.name}</b><TypeChip type={l.insight_type} /></div>
                  <PathRail path={l.path.slice(2)} confidence={l.confidence} compact />
                </div>
                <ConfChip confidence={l.confidence} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
