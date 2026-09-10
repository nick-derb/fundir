'use client';

// People — the directory. Everyone the graph knows: CYC's board, auxiliary
// board, council and staff, and the trustees and executives of the funders
// around them. Built from the references the user shared: people-first rows
// (avatar, name with a status dot, title · org · location, tag pills, an
// iconized meta strip, inline actions), a card grid for the same data, row
// selection with an export, and a record panel with tabs.

import { useEffect, useMemo, useState } from 'react';
import { Search, LayoutList, LayoutGrid, ExternalLink, Map as MapIcon, Sparkles, Briefcase, Landmark, Route, Clock, Link2, Download, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { PersonRow } from '@/lib/network/queries';
import { SERIF, MONO, Avatar, Chip, Eyebrow, Skeleton, fmtDate, SLATE, AMBER, INFO } from './shared';

const KINDS: Array<{ key: string; label: string; match: (p: PersonRow) => boolean }> = [
  { key: 'board', label: 'CYC board', match: p => p.kind === 'board' },
  { key: 'auxiliary', label: 'Auxiliary board', match: p => p.kind === 'auxiliary' },
  { key: 'council', label: 'Council', match: p => p.kind === 'council' },
  { key: 'staff', label: 'Staff', match: p => p.kind === 'staff' },
  { key: 'trustee', label: 'Funder trustees', match: p => p.kind === 'trustee' },
  { key: 'executive', label: 'Funder executives', match: p => p.kind === 'executive' },
];
const PAGE = 25;

/** The dot next to the name: what the graph knows about this person, at a glance. */
function statusOf(p: PersonRow): { tone: string; label: string } {
  if (p.own) return p.enriched_at ? { tone: 'var(--accent)', label: `Profile read ${fmtDate(p.enriched_at)}` } : p.linkedin_url ? { tone: SLATE, label: 'LinkedIn URL on file, not read yet' } : { tone: AMBER, label: 'No LinkedIn URL yet' };
  return p.verification === 'verified' ? { tone: 'var(--accent)', label: 'Documented in a filing or roster' } : p.verification === 'inferred' ? { tone: AMBER, label: 'Inferred' } : { tone: SLATE, label: 'On a roster' };
}
const roleLine = (p: PersonRow) => [p.title ?? (p.own && p.board_role ? `CYC ${p.board_role}` : null), p.org, p.location].filter(Boolean).join(' · ');

export function PeopleView({ selectedId, onOpen, onOpenLead, onFocus }: { selectedId: string | null; onOpen: (id: string) => void; onOpenLead: (id: string) => void; onFocus: (f: { kind: 'person' | 'org'; id: string }) => void }) {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [q, setQ] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [only, setOnly] = useState<'all' | 'paths' | 'mapped' | 'needs_url'>('all');
  const [sort, setSort] = useState<'relevance' | 'name' | 'org' | 'recent'>('relevance');
  const [mode, setMode] = useState<'list' | 'grid'>('list');
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => { fetch('/api/network/people').then(r => r.json()).then(b => setRows(b.people ?? [])).catch(() => setRows([])); }, []);
  const setModePersist = (m: 'list' | 'grid') => setMode(m);

  const counts = useMemo(() => Object.fromEntries(KINDS.map(k => [k.key, (rows ?? []).filter(k.match).length])), [rows]);
  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = (rows ?? []).filter(p => (!kinds.length || KINDS.filter(k => kinds.includes(k.key)).some(k => k.match(p)))
      && (only === 'all' || (only === 'paths' && p.paths > 0) || (only === 'mapped' && !!p.enriched_at) || (only === 'needs_url' && p.own && !p.linkedin_url))
      && (!t || `${p.name} ${p.title ?? ''} ${p.org ?? ''} ${p.location ?? ''} ${p.boards.map(b => b.name).join(' ')}`.toLowerCase().includes(t)));
    out.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'org' ? (a.org ?? '').localeCompare(b.org ?? '') || a.name.localeCompare(b.name) : sort === 'recent' ? (b.enriched_at ?? '').localeCompare(a.enriched_at ?? '') || b.paths - a.paths : Number(b.own) - Number(a.own) || b.paths - a.paths || (b.best_lead?.score ?? 0) - (a.best_lead?.score ?? 0) || a.name.localeCompare(b.name));
    return out;
  }, [rows, q, kinds, only, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  // Any filter change returns to page one (derived state, set during render).
  const filterKey = `${q}|${kinds.join(',')}|${only}|${sort}`;
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (filterKey !== seenFilter) { setSeenFilter(filterKey); setPage(0); }
  const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE);
  const togglePick = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = pageRows.length > 0 && pageRows.every(p => picked.has(p.id));

  function exportCsv() {
    const list = (rows ?? []).filter(p => picked.has(p.id));
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Name', 'Kind', 'Role', 'Title', 'Organization', 'Location', 'LinkedIn', 'Boards', 'Warm paths', 'Best lead', 'Score', 'Source', 'Last read'];
    const body = list.map(p => [p.name, p.kind, p.board_role ?? '', p.title ?? '', p.org ?? '', p.location ?? '', p.linkedin_url ?? '', p.boards.map(b => b.name).join('; '), p.paths, p.best_lead?.target ?? '', p.best_lead?.score ?? '', p.source_type ?? '', p.enriched_at ? fmtDate(p.enriched_at) : ''].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fundir-people-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="ni-root" style={{ padding: '24px 26px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Eyebrow style={{ display: 'block', margin: '0 0 9px' }}>Chicago Youth Centers · Network intelligence</Eyebrow>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>People</h1>
          <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>Everyone the graph knows — CYC&rsquo;s own people and the trustees and executives of the funders around them. No photos are stored; every fact traces to a filing, a roster, a public bio or a profile CYC pasted.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {picked.size > 0 && <button type="button" className="ni-primary" onClick={exportCsv}><Download style={{ width: 12, height: 12 }} />Export {picked.size} selected</button>}
          <span style={{ display: 'inline-flex', border: '1px solid var(--border-hairline)', borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="View mode">
            <button type="button" aria-pressed={mode === 'list'} onClick={() => setModePersist('list')} title="List" style={{ border: 'none', height: 32, width: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: mode === 'list' ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: mode === 'list' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}><LayoutList style={{ width: 14, height: 14 }} /></button>
            <button type="button" aria-pressed={mode === 'grid'} onClick={() => setModePersist('grid')} title="Cards" style={{ border: 'none', borderLeft: '1px solid var(--border-hairline)', height: 32, width: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: mode === 'grid' ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: mode === 'grid' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}><LayoutGrid style={{ width: 14, height: 14 }} /></button>
          </span>
        </div>
      </div>

      {/* filter rail */}
      <div className="ni-card" style={{ position: 'sticky', top: 56, zIndex: 5, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ position: 'relative', flex: '1 1 220px', minWidth: 160 }}><Search style={{ position: 'absolute', left: 10, top: 9, width: 14, height: 14, color: 'var(--text-tertiary)' }} /><input className="ni-input" placeholder="Search people, titles, employers, boards…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people" /></label>
        <span data-ni-hide-sm style={{ width: 1, height: 22, background: 'var(--border-hairline)' }} />
        {KINDS.map(k => counts[k.key] ? <button key={k.key} type="button" className="ni-seg" aria-pressed={kinds.includes(k.key)} onClick={() => setKinds(x => x.includes(k.key) ? x.filter(y => y !== k.key) : [...x, k.key])}>{k.label}<i>{counts[k.key]}</i></button> : null)}
        <span style={{ flex: 1 }} />
        <select className="ni-select" value={only} onChange={e => setOnly(e.target.value as typeof only)} aria-label="Show"><option value="all">Everyone</option><option value="paths">With a warm path</option><option value="mapped">Profile read</option><option value="needs_url">Needs a LinkedIn URL</option></select>
        <select className="ni-select" value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort"><option value="relevance">Most relevant</option><option value="name">Name</option><option value="org">Organization</option><option value="recent">Recently read</option></select>
      </div>

      {rows === null && <div className="ni-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Skeleton h={36} w={36} style={{ borderRadius: 18 }} /><div style={{ flex: 1 }}><Skeleton h={12} w={`${30 + (i * 11) % 30}%`} /><Skeleton h={10} w={`${50 + (i * 7) % 30}%`} style={{ marginTop: 6 }} /></div></div>)}</div>}
      {rows !== null && visible.length === 0 && <div className="ni-card" style={{ padding: '40px 20px', textAlign: 'center' }}><p style={{ fontFamily: SERIF, fontSize: '1.3rem', margin: '0 0 6px' }}>No one matches.</p><p className="fd-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>Loosen a filter or search another name.</p></div>}

      {rows !== null && visible.length > 0 && mode === 'list' && (
        <div className="ni-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-page)' }}>
            <Checkbox checked={allOnPage} onChange={() => setPicked(s => { const n = new Set(s); if (allOnPage) pageRows.forEach(p => n.delete(p.id)); else pageRows.forEach(p => n.add(p.id)); return n; })} label="Select page" />
            <span className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>Showing {page * PAGE + 1}–{Math.min(visible.length, (page + 1) * PAGE)} of {visible.length}</span>
          </div>
          {pageRows.map((p, i) => <PersonRowItem key={p.id} p={p} i={i} active={p.id === selectedId} picked={picked.has(p.id)} onPick={() => togglePick(p.id)} onOpen={() => onOpen(p.id)} onOpenLead={onOpenLead} onFocus={onFocus} />)}
          <Pager page={page} pages={pages} onPage={setPage} />
        </div>
      )}
      {rows !== null && visible.length > 0 && mode === 'grid' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {pageRows.map((p, i) => <PersonCard key={p.id} p={p} i={i} active={p.id === selectedId} picked={picked.has(p.id)} onPick={() => togglePick(p.id)} onOpen={() => onOpen(p.id)} />)}
          </div>
          <div className="ni-card" style={{ marginTop: 10 }}><Pager page={page} pages={pages} onPage={setPage} /></div>
        </>
      )}
    </div>
  );
}

function PersonRowItem({ p, i, active, picked, onPick, onOpen, onOpenLead, onFocus }: { p: PersonRow; i: number; active: boolean; picked: boolean; onPick: () => void; onOpen: () => void; onOpenLead: (id: string) => void; onFocus: (f: { kind: 'person' | 'org'; id: string }) => void }) {
  const st = statusOf(p);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="ni-row ni-rise" data-active={active} role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }} style={{ display: 'grid', gridTemplateColumns: '28px 44px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', borderLeft: `3px solid ${p.own ? 'var(--accent)' : 'transparent'}`, animationDelay: `${Math.min(300, i * 16)}ms` }}>
      <span onClick={stop}><Checkbox checked={picked} onChange={onPick} label={`Select ${p.name}`} /></span>
      <span style={{ position: 'relative', display: 'inline-flex' }}><Avatar name={p.name} size={40} own={p.own} /><span title={st.label} style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, background: st.tone, border: '2px solid var(--bg-surface)' }} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-.006em' }}>{p.name}</b>
          {p.own && <Chip text={p.kind === 'staff' ? 'CYC staff' : p.kind === 'board' ? `CYC board${p.board_role ? ` · ${p.board_role}` : ''}` : p.kind === 'auxiliary' ? 'Auxiliary board' : 'Council'} color="var(--accent)" border="rgba(12,107,90,.32)" />}
          {!p.own && p.boards.slice(0, 2).map(b => <Chip key={b.id} text={`${b.title ?? 'Trustee'} · ${b.name}`} color={SLATE} border="rgba(91,115,131,.34)" />)}
          {p.paths > 0 && <Chip text={`${p.paths} warm path${p.paths === 1 ? '' : 's'}`} color={AMBER} border="rgba(156,122,42,.36)" />}
        </div>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleLine(p) || p.headline || '—'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 7, flexWrap: 'wrap' }}>
          <Meta icon={<Clock />} text={p.enriched_at ? `read ${fmtDate(p.enriched_at)}` : p.own ? 'not read yet' : 'from filings'} />
          {p.employers > 0 && <Meta icon={<Briefcase />} text={`${p.employers} employer${p.employers === 1 ? '' : 's'}`} />}
          {p.boards.length > 0 && <Meta icon={<Landmark />} text={`${p.boards.length} board${p.boards.length === 1 ? '' : 's'}`} />}
          {p.best_lead && <Meta icon={<Route />} text={`best lead ${p.best_lead.score} · ${p.best_lead.target}`} tone={p.best_lead.score >= 70 ? 'var(--accent)' : undefined} />}
          {p.source_type && <Meta icon={<Link2 />} text={p.source_type.replace(/_/g, ' ')} />}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={stop}>
        {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="ni-ghost" style={{ height: 30, width: 30, padding: 0, justifyContent: 'center', color: INFO }} title="Open LinkedIn profile" aria-label="Open LinkedIn profile"><ExternalLink style={{ width: 13, height: 13 }} /></a>}
        <button type="button" className="ni-ghost" style={{ height: 30, width: 30, padding: 0, justifyContent: 'center' }} title="View in map" aria-label="View in map" onClick={() => onFocus({ kind: 'person', id: p.id })}><MapIcon style={{ width: 13, height: 13 }} /></button>
        {p.best_lead ? <button type="button" className="ni-primary" style={{ height: 30 }} onClick={() => onOpenLead(p.best_lead!.id)}><Sparkles style={{ width: 12, height: 12 }} />Lead</button> : <button type="button" className="ni-ghost" style={{ height: 30 }} onClick={onOpen}>Details</button>}
      </div>
    </div>
  );
}

function PersonCard({ p, i, active, picked, onPick, onOpen }: { p: PersonRow; i: number; active: boolean; picked: boolean; onPick: () => void; onOpen: () => void }) {
  const st = statusOf(p);
  return (
    <div className="ni-card ni-rise" role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }} style={{ padding: '14px 14px 12px', cursor: 'pointer', borderColor: active ? 'var(--accent)' : undefined, animationDelay: `${Math.min(300, i * 16)}ms`, display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color .14s, transform .2s cubic-bezier(.2,.8,.2,1)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}><Avatar name={p.name} size={40} own={p.own} /><span title={st.label} style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, background: st.tone, border: '2px solid var(--bg-surface)' }} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: 'block', fontSize: 13.5, fontWeight: 500, letterSpacing: '-.006em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roleLine(p) || p.headline || '—'}</span>
        </div>
        <span onClick={e => e.stopPropagation()}><Checkbox checked={picked} onChange={onPick} label={`Select ${p.name}`} /></span>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minHeight: 18 }}>
        {p.own && <Chip text={p.kind === 'board' ? `CYC board` : p.kind} color="var(--accent)" border="rgba(12,107,90,.32)" />}
        {!p.own && p.boards.slice(0, 1).map(b => <Chip key={b.id} text={`${b.title ?? 'Trustee'} · ${b.name}`} color={SLATE} border="rgba(91,115,131,.34)" />)}
        {p.paths > 0 && <Chip text={`${p.paths} path${p.paths === 1 ? '' : 's'}`} color={AMBER} border="rgba(156,122,42,.36)" />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
        <Meta icon={<Briefcase />} text={`${p.employers}`} />
        <Meta icon={<Landmark />} text={`${p.boards.length}`} />
        {p.best_lead && <Meta icon={<Route />} text={`${p.best_lead.score}`} tone={p.best_lead.score >= 70 ? 'var(--accent)' : undefined} />}
        <span style={{ flex: 1 }} />
        <span className="fd-mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '.04em' }}>See details ›</span>
      </div>
    </div>
  );
}

function Meta({ icon, text, tone }: { icon: React.ReactElement<{ style?: React.CSSProperties }>; text: string; tone?: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: tone ?? 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{{ ...icon, props: { ...icon.props, style: { width: 12, height: 12, flex: 'none' } } } as React.ReactElement}{text}</span>;
}
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange} style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`, background: checked ? 'var(--accent)' : 'var(--bg-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, transition: 'background .12s, border-color .12s' }}>
      {checked && <Check style={{ width: 11, height: 11, color: 'var(--accent-on)' }} />}
    </button>
  );
}
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums = [...new Set([0, page - 1, page, page + 1, pages - 1].filter(n => n >= 0 && n < pages))].sort((a, b) => a - b);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 16px', background: 'var(--bg-page)' }}>
      <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft style={{ width: 13, height: 13 }} /></button>
      {nums.map((n, i) => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{i > 0 && nums[i - 1] !== n - 1 && <span className="fd-mono" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>…</span>}<button type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className="fd-mono" style={{ height: 28, minWidth: 28, padding: '0 8px', borderRadius: 6, border: `1px solid ${n === page ? 'var(--text-primary)' : 'var(--border-hairline)'}`, background: n === page ? 'var(--text-primary)' : 'var(--bg-surface)', color: n === page ? 'var(--bg-surface)' : 'var(--text-secondary)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>{n + 1}</button></span>)}
      <button type="button" className="ni-ghost" style={{ height: 28, width: 28, padding: 0, justifyContent: 'center' }} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight style={{ width: 13, height: 13 }} /></button>
    </div>
  );
}
