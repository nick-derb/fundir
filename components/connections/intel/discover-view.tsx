'use client';

// Discover — the opportunity ledger. Three numbers, the patterns Fundir
// noticed, a filter rail that reads like a sentence, and the leads as a dense
// table you can walk with the keyboard. Scores animate in on first paint.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import type { LeadRow, InsightRow } from '@/lib/network/queries';
import { PathRail } from './path-rail';
import { SERIF, MONO, ScoreBar, ConfChip, TypeChip, StatusChip, Eyebrow, hueFor, STATUS_LABEL, fmtDate } from './shared';

export interface DiscoverFilters { q: string; types: string[]; conf: string[]; min: number; status: 'open' | 'all' | 'active' | 'closed'; sort: 'score' | 'updated' | 'name' | 'confidence' }
export const DEFAULT_FILTERS: DiscoverFilters = { q: '', types: [], conf: [], min: 0, status: 'open', sort: 'score' };
const OPEN = new Set(['NEW', 'RESEARCHING', 'INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'AWAITING_DECISION', 'DEFERRED']);
const ACTIVE = new Set(['INTRODUCTION_NEEDED', 'INTRO_REQUESTED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'AWAITING_DECISION']);
const CONF_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export function applyFilters(leads: LeadRow[], f: DiscoverFilters): LeadRow[] {
  const q = f.q.trim().toLowerCase();
  const out = leads.filter(l => {
    if (f.status === 'open' && !OPEN.has(l.pipeline_status)) return false;
    if (f.status === 'active' && !ACTIVE.has(l.pipeline_status)) return false;
    if (f.status === 'closed' && OPEN.has(l.pipeline_status)) return false;
    if (f.types.length && !f.types.includes(l.insight_type ?? '')) return false;
    if (f.conf.length && !f.conf.includes(l.confidence ?? '')) return false;
    if (l.score < f.min) return false;
    if (q && !`${l.target?.name ?? ''} ${l.via?.name ?? ''} ${l.trustee?.name ?? ''} ${l.via_org ?? ''} ${l.thesis}`.toLowerCase().includes(q)) return false;
    return true;
  });
  out.sort((a, b) => f.sort === 'name' ? (a.target?.name ?? '').localeCompare(b.target?.name ?? '') : f.sort === 'updated' ? b.updated_at.localeCompare(a.updated_at) : f.sort === 'confidence' ? (CONF_RANK[b.confidence ?? ''] ?? 0) - (CONF_RANK[a.confidence ?? ''] ?? 0) || b.score - a.score : b.score - a.score);
  return out;
}

export function DiscoverView({ leads, insights, filters, onFilters, selectedId, onOpen, onInsight }: {
  leads: LeadRow[]; insights: InsightRow[]; filters: DiscoverFilters; onFilters: (f: DiscoverFilters) => void;
  selectedId: string | null; onOpen: (id: string) => void; onInsight: (i: InsightRow) => void;
}) {
  const visible = useMemo(() => applyFilters(leads, filters), [leads, filters]);
  const typeCounts = useMemo(() => { const m = new Map<string, number>(); for (const l of leads) if (OPEN.has(l.pipeline_status)) m.set(l.insight_type ?? 'Lead', (m.get(l.insight_type ?? 'Lead') ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, [leads]);
  const high = leads.filter(l => l.confidence === 'High' && OPEN.has(l.pipeline_status)).length;
  const untapped = leads.filter(l => l.insight_type === 'Untapped Funder' && OPEN.has(l.pipeline_status)).length;
  const withPath = leads.filter(l => l.via && OPEN.has(l.pipeline_status)).length;
  const listRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);

  // Keyboard walk when nothing is open: ↑/↓ move the focus row, Enter opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); setFocusIdx(i => Math.min(visible.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); }
      else if (e.key === 'Enter' && focusIdx >= 0 && visible[focusIdx]) onOpen(visible[focusIdx].id);
      else if (e.key === '/') { e.preventDefault(); (document.getElementById('ni-search') as HTMLInputElement | null)?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, focusIdx, selectedId, onOpen]);
  useEffect(() => { if (focusIdx >= 0) listRef.current?.querySelectorAll<HTMLElement>('[data-row]')[focusIdx]?.focus(); }, [focusIdx]);

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const topInsights = insights.slice(0, 10);

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Discover</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '66ch' }}>
            Every opportunity Fundir can see in CYC&rsquo;s graph, scored the same way and explained from evidence: funders reachable through a board member, corporations a CYC person works at, and funders of CYC&rsquo;s peers that show no CYC relationship yet.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 10, flex: '0 1 460px' }}>
          <Kpi label="Open leads" value={leads.filter(l => OPEN.has(l.pipeline_status)).length} />
          <Kpi label="High confidence" value={high} accent />
          <Kpi label="Warm paths" value={withPath} sub={`${untapped} white space`} />
        </div>
      </div>

      {/* patterns */}
      {topInsights.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Eyebrow color="var(--text-secondary)">Patterns Fundir noticed</Eyebrow>
            <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
            <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{insights.length}</span>
          </div>
          <div className="ni-strip">
            {topInsights.map((i, k) => { const h = hueFor(i.insight_type); return (
              <button key={i.id} type="button" className="ni-insight ni-rise" style={{ animationDelay: `${k * 35}ms`, textAlign: 'left', borderTop: `2px solid ${h.color}` }} onClick={() => onInsight(i)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><TypeChip type={i.insight_type} /><span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{Math.round(i.score)}</span></span>
                <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, marginBottom: 4 }}>{i.title}</b>
                <span className="fd-caption" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--text-secondary)', fontSize: 11.5 }}>{i.summary}</span>
              </button>
            ); })}
          </div>
        </div>
      )}

      {/* filter rail */}
      <div className="ni-card" style={{ position: 'sticky', top: 56, zIndex: 5, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ position: 'relative', flex: '1 1 220px', minWidth: 160 }}>
          <Search style={{ position: 'absolute', left: 10, top: 9, width: 14, height: 14, color: 'var(--text-tertiary)' }} />
          <input id="ni-search" className="ni-input" placeholder="Search funders, people, employers…  ( / )" value={filters.q} onChange={e => onFilters({ ...filters, q: e.target.value })} aria-label="Search leads" />
        </label>
        <span data-ni-hide-sm style={{ width: 1, height: 22, background: 'var(--border-hairline)' }} />
        {typeCounts.map(([t, n]) => <button key={t} type="button" className="ni-seg" aria-pressed={filters.types.includes(t)} onClick={() => onFilters({ ...filters, types: toggle(filters.types, t) })}><span style={{ width: 6, height: 6, borderRadius: 3, background: hueFor(t).color }} />{hueFor(t).short}<i>{n}</i></button>)}
        <span data-ni-hide-sm style={{ width: 1, height: 22, background: 'var(--border-hairline)' }} />
        {(['High', 'Medium', 'Low'] as const).map(c => <button key={c} type="button" className="ni-seg" aria-pressed={filters.conf.includes(c)} onClick={() => onFilters({ ...filters, conf: toggle(filters.conf, c) })}>{c}</button>)}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)' }} data-ni-hide-md>
          Min score <input type="range" min={0} max={100} step={5} value={filters.min} onChange={e => onFilters({ ...filters, min: Number(e.target.value) })} style={{ width: 90, accentColor: 'var(--accent)' }} aria-label="Minimum score" /><b className="fd-mono" style={{ fontSize: 11, minWidth: 22 }}>{filters.min}</b>
        </label>
        <select className="ni-select" value={filters.status} onChange={e => onFilters({ ...filters, status: e.target.value as DiscoverFilters['status'] })} aria-label="Pipeline filter">
          <option value="open">Open</option><option value="active">In motion</option><option value="closed">Closed</option><option value="all">All</option>
        </select>
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <ArrowUpDown style={{ position: 'absolute', left: 8, width: 11, height: 11, color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <select className="ni-select" style={{ paddingLeft: 24 }} value={filters.sort} onChange={e => onFilters({ ...filters, sort: e.target.value as DiscoverFilters['sort'] })} aria-label="Sort">
            <option value="score">Score</option><option value="confidence">Confidence</option><option value="updated">Recently updated</option><option value="name">Name</option>
          </select>
        </span>
      </div>

      {/* ledger */}
      <div className="ni-card" style={{ overflow: 'hidden' }} ref={listRef}>
        <div data-ni-grid="lead" style={{ display: 'grid', gridTemplateColumns: '112px minmax(220px,1.5fr) minmax(240px,2fr) 90px 110px', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }} aria-hidden>
          {['Score', 'Opportunity', 'Why', 'Confidence', 'Status'].map(h => <span key={h} className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10 }} data-ni-hide-md={h === 'Why' || h === 'Status' ? true : undefined}>{h}</span>)}
        </div>
        {visible.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontFamily: SERIF, fontSize: '1.3rem', margin: '0 0 6px' }}>Nothing matches.</p>
            <p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Loosen a filter, or run a refresh to look for new paths.</p>
          </div>
        )}
        {visible.map((l, i) => (
          <div key={l.id} data-row data-ni-grid="lead" tabIndex={0} role="button" className="ni-row" data-active={l.id === selectedId} onClick={() => onOpen(l.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(l.id); }}
            style={{ display: 'grid', gridTemplateColumns: '112px minmax(220px,1.5fr) minmax(240px,2fr) 90px 110px', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)' }} aria-label={`${l.target?.name ?? 'Lead'}, score ${l.score}, ${l.confidence ?? ''} confidence`}>
            <ScoreBar score={l.score} delay={Math.min(600, i * 22)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, minWidth: 0 }}>
                <b style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-.006em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.target?.name ?? l.trustee?.name ?? '—'}</b>
                <TypeChip type={l.insight_type} />
              </div>
              <PathRail path={l.path.slice(1)} confidence={l.confidence} compact />
            </div>
            <p data-ni-hide-md style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.thesis}</p>
            <ConfChip confidence={l.confidence} />
            <div data-ni-hide-md style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              <StatusChip status={l.pipeline_status} />
              <span className="fd-mono" style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>{fmtDate(l.updated_at)}</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'var(--bg-page)' }}>
          <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{visible.length} of {leads.length}</span>
          <span style={{ flex: 1 }} />
          <span data-ni-hide-sm className="fd-caption" style={{ color: 'var(--text-tertiary)', fontSize: 10.5, display: 'inline-flex', gap: 6, alignItems: 'center' }}><span className="ni-kbd">↑</span><span className="ni-kbd">↓</span> move <span className="ni-kbd" style={{ marginLeft: 6 }}>↵</span> open <span className="ni-kbd" style={{ marginLeft: 6 }}>/</span> search</span>
        </div>
      </div>
      <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '16px 0 0' }}>Scores are deterministic · explanations cite their evidence · statuses: {Object.values(STATUS_LABEL).length} states</p>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className="ni-kpi" style={accent ? { borderColor: 'rgba(12,107,90,.28)' } : undefined}>
      <span className="fd-eyebrow" style={{ display: 'block', color: accent ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 6, fontSize: 10 }}>{label}</span>
      <b className="fd-kpi" style={{ fontSize: 22, color: accent ? 'var(--accent)' : undefined, fontFamily: MONO }}>{value.toLocaleString('en-US')}</b>
      {sub && <span className="fd-caption" style={{ display: 'block', color: 'var(--text-tertiary)', marginTop: 2, fontSize: 11 }}>{sub}</span>}
    </div>
  );
}
