'use client';

// The relationship map as a layered card graph. The focused node (CYC on the
// overview) sits at the top; every other node hangs under the neighbour it
// was reached through, so a warm path reads top to bottom: CYC → board member
// → the room they shared → the funder. Cards, not dots: each carries the
// name, the role, the evidence grade and the lead score. Connectors are
// orthogonal; extra links between branches are drawn faint and light up when
// you hover or select either end. Wide layers fold behind "+N more" so the
// map stays readable as the LinkedIn import grows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import type { GraphPayload, GraphNode, GraphLink } from '@/lib/network/queries';
import { Avatar, OrgMark, relLabel, typeLabel } from './shared';

interface Props {
  data: GraphPayload | null;
  height?: number | string;
  selectedId?: string | null;
  onSelect?: (node: GraphNode | null) => void;
  onActivate?: (node: GraphNode) => void;   // double-click / Shift+Enter: focus the neighbourhood
  compact?: boolean;
}

interface Placed { id: string; node: GraphNode | null; x: number; y: number; depth: number; stub?: { parent: string; count: number }; ver: GraphLink['verification'] | null }
interface TreeEdge { from: string; to: string; link: GraphLink | null }
interface Layout { placed: Placed[]; byId: Map<string, Placed>; edges: TreeEdge[]; cross: GraphLink[]; w: number; h: number; cardW: number }

const SIZES = {
  full: { W: 224, H: 84, GX: 16, GY: 56, MAX: 6, PAD: 24 },
  compact: { W: 168, H: 52, GX: 12, GY: 36, MAX: 4, PAD: 12 },
};
const VER_RANK: Record<string, number> = { verified: 0, probable: 1, inferred: 2 };
const DASH: Record<string, string | undefined> = { verified: undefined, probable: '6 4', inferred: '2 4' };

const CSS = `
.mg-wrap{position:relative;width:100%;overflow:hidden;background:var(--bg-page);background-image:radial-gradient(var(--border-hairline) 1px,transparent 1px);background-size:22px 22px;user-select:none;touch-action:none;cursor:grab}
.mg-wrap[data-panning="true"]{cursor:grabbing}
.mg-stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.mg-card{position:absolute;box-sizing:border-box;background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius);box-shadow:0 1px 0 rgba(11,18,32,.03);cursor:pointer;outline:none;transition:opacity .16s,border-color .12s,box-shadow .12s;display:flex;flex-direction:column;overflow:hidden}
.mg-card:hover{border-color:var(--border-strong)}
.mg-card[data-on="true"]{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.mg-card:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.mg-card[data-dim="true"]{opacity:.32}
.mg-card[data-root="true"]{border-color:rgba(12,107,90,.45)}
.mg-head{display:flex;align-items:center;gap:9px;padding:9px 10px 8px;min-width:0;flex:1}
.mg-title{min-width:0;flex:1}
.mg-title b{display:block;font-size:12.5px;font-weight:500;letter-spacing:-.005em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)}
.mg-title span{display:block;margin-top:2px;font-size:10.5px;line-height:1.3;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg-marks{display:flex;gap:4px;flex:none}
.mg-mark{width:22px;height:22px;border-radius:var(--radius-xs);border:1px solid var(--border-hairline);background:var(--bg-page);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary)}
.mg-mark i{width:6px;height:6px;border-radius:50%;background:var(--border-strong)}
.mg-mark[data-tone="accent"] i{background:var(--accent)}
.mg-mark[data-tone="warning"] i{background:var(--warning)}
.mg-mark[data-tone="slate"] i{background:#5B7383}
.mg-mark[data-tone="lead"]{border-color:rgba(156,122,42,.4);color:var(--warning)}
.mg-foot{display:flex;align-items:center;gap:6px;padding:5px 8px;border-top:1px solid var(--border-hairline);background:var(--bg-page);min-width:0;overflow:hidden}
.mg-metric{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:var(--radius-xs);border:1px solid var(--border-hairline);background:var(--bg-surface);font-family:var(--font-mono);font-size:9.5px;color:var(--text-secondary);white-space:nowrap}
.mg-metric[data-tone="accent"]{color:var(--accent);border-color:rgba(12,107,90,.3)}
.mg-metric[data-tone="warning"]{color:var(--warning);border-color:rgba(192,133,43,.34)}
.mg-stub{position:absolute;box-sizing:border-box;border:1px dashed var(--border-strong);border-radius:var(--radius);background:color-mix(in srgb,var(--bg-surface) 70%,transparent);color:var(--text-secondary);font:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;outline:none}
.mg-stub:hover,.mg-stub:focus-visible{border-color:var(--accent);color:var(--accent)}
.mg-stub i{font-style:normal;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)}
.mg-tools{position:absolute;right:10px;bottom:10px;display:flex;gap:4px}
.mg-legend{position:absolute;left:10px;bottom:10px;display:flex;gap:12px;flex-wrap:wrap;padding:5px 9px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--bg-surface) 90%,transparent);border:1px solid var(--border-hairline);font-size:10.5px;color:var(--text-secondary)}
.mg-legend span{display:inline-flex;align-items:center;gap:5px}
.mg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:12.5px}
@media (prefers-reduced-motion:reduce){.mg-card{transition:none}}
`;

// ── Layout ───────────────────────────────────────────────────────────────────

export function buildLayout(data: GraphPayload, expanded: Set<string>, compact: boolean): Layout {
  const S = compact ? SIZES.compact : SIZES.full;
  const nodes = data.nodes; const byNode = new Map(nodes.map(n => [n.id, n]));
  // adjacency with the strongest link per pair
  const adj = new Map<string, Array<{ id: string; link: GraphLink }>>();
  const push = (a: string, b: string, link: GraphLink) => { if (!byNode.has(a) || !byNode.has(b)) return; (adj.get(a) ?? adj.set(a, []).get(a)!).push({ id: b, link }); };
  for (const l of data.links) { push(l.source, l.target, l); push(l.target, l.source, l); }
  const degree = (id: string) => adj.get(id)?.length ?? 0;
  const linkRank = (l: GraphLink) => VER_RANK[l.verification] * 1000 - l.strength;
  for (const list of adj.values()) list.sort((a, b) => linkRank(a.link) - linkRank(b.link));

  // BFS forest: the focused node first, then whatever is left, biggest hub first.
  const depth = new Map<string, number>(); const parent = new Map<string, { id: string; link: GraphLink } | null>();
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  const order = [...nodes].sort((a, b) => (b.focus ? 1 : 0) - (a.focus ? 1 : 0) || degree(b.id) - degree(a.id));
  for (const start of order) {
    if (depth.has(start.id)) continue;
    roots.push(start.id); depth.set(start.id, 0); parent.set(start.id, null);
    const q = [start.id];
    while (q.length) {
      const cur = q.shift()!; const d = depth.get(cur)!;
      for (const { id, link } of adj.get(cur) ?? []) {
        if (depth.has(id)) continue;
        depth.set(id, d + 1); parent.set(id, { id: cur, link });
        (children.get(cur) ?? children.set(cur, []).get(cur)!).push(id); q.push(id);
      }
    }
  }
  // children ordered by lead score, then verification, then name
  const childRank = (id: string) => { const n = byNode.get(id)!; const p = parent.get(id)!; return -(n.score ?? -1) * 10 + VER_RANK[p.link.verification]; };
  for (const kids of children.values()) kids.sort((a, b) => childRank(a) - childRank(b) || byNode.get(a)!.label.localeCompare(byNode.get(b)!.label));

  // visible children per parent, folding the long tail behind a stub
  const visible = (pid: string): { kids: string[]; stub: number } => {
    const kids = children.get(pid) ?? [];
    if (kids.length <= S.MAX + 1 || expanded.has(pid)) return { kids, stub: 0 };
    return { kids: kids.slice(0, S.MAX), stub: kids.length - S.MAX };
  };

  // subtree widths, then absolute positions (children centred under the parent)
  const width = new Map<string, number>();
  const measure = (id: string): number => {
    const { kids, stub } = visible(id);
    const parts = kids.map(measure); if (stub) parts.push(S.W);
    const w = parts.length ? parts.reduce((a, b) => a + b, 0) + S.GX * (parts.length - 1) : S.W;
    width.set(id, Math.max(S.W, w)); return width.get(id)!;
  };
  const placed: Placed[] = []; const edges: TreeEdge[] = [];
  const place = (id: string, left: number, d: number) => {
    const w = width.get(id)!; const x = left + (w - S.W) / 2; const y = d * (S.H + S.GY);
    const p = parent.get(id) ?? null;
    placed.push({ id, node: byNode.get(id)!, x, y, depth: d, ver: p ? p.link.verification : null });
    if (p) edges.push({ from: p.id, to: id, link: p.link });
    const { kids, stub } = visible(id);
    const parts = [...kids.map(k => width.get(k)!), ...(stub ? [S.W] : [])];
    const total = parts.reduce((a, b) => a + b, 0) + S.GX * (parts.length - 1);
    let cx = left + (w - total) / 2;
    kids.forEach((k, i) => { place(k, cx, d + 1); cx += parts[i] + S.GX; });
    if (stub) { const sid = `stub:${id}`; placed.push({ id: sid, node: null, x: cx, y: (d + 1) * (S.H + S.GY), depth: d + 1, stub: { parent: id, count: stub }, ver: null }); edges.push({ from: id, to: sid, link: null }); }
  };
  let left = S.PAD;
  for (const r of roots) { measure(r); place(r, left, 0); left += width.get(r)! + S.GX * 2; }
  const byId = new Map(placed.map(p => [p.id, p]));
  // links that are not tree edges, between two visible cards
  const tree = new Set(edges.map(e => [e.from, e.to].sort().join('|')));
  const cross = data.links.filter(l => byId.has(l.source) && byId.has(l.target) && !tree.has([l.source, l.target].sort().join('|')));
  const w = Math.max(...placed.map(p => p.x + S.W), 0) + S.PAD;
  const h = Math.max(...placed.map(p => p.y + S.H), 0) + S.PAD;
  return { placed, byId, edges, cross, w, h, cardW: S.W };
}

// Fit keeps cards legible: never below 0.8×. A tree wider than the viewport is
// centred on its root instead of shrunk, and the user pans along the layer.
function fitView(lay: Layout, sz: { w: number; h: number }, minK = 0.8) {
  if (!lay.placed.length) return { x: 0, y: 0, k: 1 };
  const k = Math.max(minK, Math.min(1, (sz.w - 24) / lay.w, (sz.h - 24) / lay.h));
  const root = lay.placed.find(p => p.depth === 0) ?? lay.placed[0];
  const rootCx = root.x + lay.cardW / 2;
  const x = lay.w * k <= sz.w - 24 ? (sz.w - lay.w * k) / 2 : sz.w / 2 - rootCx * k;
  const y = lay.h * k < sz.h - 24 ? (sz.h - lay.h * k) / 2 : 12;
  return { x, y, k };
}

// ── Component ────────────────────────────────────────────────────────────────

export function MapGraph({ data, height = 520, selectedId, onSelect, onActivate, compact }: Props) {
  const S = compact ? SIZES.compact : SIZES.full;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: typeof height === 'number' ? height : 520 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);
  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);

  const layout = useMemo(() => (data ? buildLayout(data, expanded, !!compact) : null), [data, expanded, compact]);
  const adj = useMemo(() => { const m = new Map<string, Set<string>>(); for (const l of data?.links ?? []) { (m.get(l.source) ?? m.set(l.source, new Set()).get(l.source)!).add(l.target); (m.get(l.target) ?? m.set(l.target, new Set()).get(l.target)!).add(l.source); } return m; }, [data]);

  const layoutRef = useRef<Layout | null>(null);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  // Size to the container; refit on every resize (the Wide toggle, a window change).
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const sz = { w: el.clientWidth, h: el.clientHeight };
      setSize(sz);
      if (layoutRef.current) setView(fitView(layoutRef.current, sz, compact ? 0.5 : 0.8));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);

  const fit = useCallback((lay: Layout | null) => { if (lay) setView(fitView(lay, size, compact ? 0.5 : 0.8)); }, [size, compact]);

  // New payload: reset folds and fit (state adjusted during render, not in an effect). Fold changes keep the view.
  const dataKey = data ? `${data.mode}:${data.focus?.id ?? 'root'}:${data.nodes.length}` : '';
  const [seenKey, setSeenKey] = useState('');
  if (dataKey !== seenKey) {
    setSeenKey(dataKey);
    setExpanded(new Set());
    if (data) setView(fitView(buildLayout(data, new Set(), !!compact), size, compact ? 0.5 : 0.8));
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-mg-card]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pan.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }; setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pan.current; if (!p) return;
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
    setView(v => ({ ...v, x: p.ox + dx, y: p.oy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pan.current; pan.current = null; setPanning(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (p && !p.moved && !(e.target as HTMLElement).closest('[data-mg-card]')) onSelect?.(null);
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    setView(v => {
      const nk = Math.max(0.3, Math.min(2, v.k * factor));
      const mx = cx ?? size.w / 2, my = cy ?? size.h / 2;
      return { k: nk, x: mx - (mx - v.x) * (nk / v.k), y: my - (my - v.y) * (nk / v.k) };
    });
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const r = wrapRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top);
    else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  };

  const lit = useMemo(() => { const id = hover ?? selectedId ?? null; return id ? new Set([id, ...(adj.get(id) ?? [])]) : null; }, [hover, selectedId, adj]);
  const isLit = (a: string, b: string) => { const id = hover ?? selectedId; return !!id && (a === id || b === id); };

  const nodeCount = data?.nodes.length ?? 0;
  const edgePath = (e: TreeEdge) => {
    const a = layout!.byId.get(e.from)!, b = layout!.byId.get(e.to)!;
    const x1 = a.x + S.W / 2, y1 = a.y + S.H, x2 = b.x + S.W / 2, y2 = b.y, my = y1 + S.GY / 2;
    return x1 === x2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} L${x1} ${my} L${x2} ${my} L${x2} ${y2}`;
  };
  const crossPath = (l: GraphLink) => {
    const a = layout!.byId.get(l.source)!, b = layout!.byId.get(l.target)!;
    const x1 = a.x + S.W / 2, y1 = a.y + S.H / 2, x2 = b.x + S.W / 2, y2 = b.y + S.H / 2;
    const bend = Math.max(40, Math.abs(x2 - x1) * 0.25);
    return `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
  };

  return (
    <div ref={wrapRef} className="mg-wrap" data-panning={panning ? 'true' : undefined} style={{ height, borderRadius: 'inherit' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
      role="group" aria-label={data ? `Relationship map with ${nodeCount} nodes and ${data.links.length} links` : 'Relationship map'}>
      <style>{CSS}</style>
      {layout && (
        <div className="mg-stage" style={{ width: layout.w, height: layout.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg width={layout.w} height={layout.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden>
            {layout.cross.map((l, i) => {
              const on = isLit(l.source, l.target);
              return <path key={`c${i}`} d={crossPath(l)} fill="none" stroke={on ? (l.type === 'white_space' ? 'var(--warning)' : 'var(--accent)') : 'var(--border-strong)'} strokeWidth={on ? 1.6 : 1} strokeDasharray={DASH[l.verification] ?? '2 4'} opacity={lit && !on ? 0.15 : on ? 1 : 0.45} />;
            })}
            {layout.edges.map(e => {
              const on = isLit(e.from, e.to);
              const dim = lit && !on;
              const stroke = !e.link ? 'var(--border-strong)' : on ? (e.link.type === 'white_space' ? 'var(--warning)' : 'var(--accent)') : e.link.type === 'white_space' ? 'rgba(192,133,43,.6)' : 'var(--border-strong)';
              return <path key={`${e.from}>${e.to}`} d={edgePath(e)} fill="none" stroke={stroke} strokeWidth={on ? 1.8 : 1.25} strokeDasharray={e.link ? DASH[e.link.verification] : '3 3'} opacity={dim ? 0.3 : 1} />;
            })}
          </svg>
          {layout.placed.map(p => p.stub ? (
            <button key={p.id} type="button" data-mg-card className="mg-stub" style={{ left: p.x, top: p.y, width: S.W, height: S.H }}
              onClick={() => setExpanded(s => new Set(s).add(p.stub!.parent))} title="Show the rest of this branch">
              <Plus style={{ width: 12, height: 12 }} />{p.stub.count} more<i>· show all</i>
            </button>
          ) : (
            <Card key={p.id} p={p} S={S} compact={!!compact} degree={adj.get(p.id)?.size ?? 0}
              on={selectedId === p.id} dim={!!lit && !lit.has(p.id)}
              onHover={h => setHover(h ? p.id : null)}
              onSelect={() => onSelect?.(p.node)} onActivate={() => p.node && onActivate?.(p.node)} />
          ))}
        </div>
      )}
      {data && nodeCount === 0 && <div className="mg-empty">Nothing to map yet.</div>}
      <div className="mg-tools">
        <button type="button" className="fd-btn" style={{ height: 26, width: 26, padding: 0, justifyContent: 'center' }} aria-label="Zoom out" onClick={() => zoomAt(0.8)}><Minus style={{ width: 12, height: 12 }} /></button>
        <button type="button" className="fd-btn" style={{ height: 26, width: 26, padding: 0, justifyContent: 'center' }} aria-label="Zoom in" onClick={() => zoomAt(1.25)}><Plus style={{ width: 12, height: 12 }} /></button>
        <button type="button" className="fd-btn" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => fit(layout)}><Maximize2 style={{ width: 11, height: 11 }} />Fit</button>
      </div>
      {!compact && (
        <div className="mg-legend">
          <span><i style={{ width: 16, borderTop: '1.5px solid var(--border-strong)' }} />documented</span>
          <span><i style={{ width: 16, borderTop: '1.5px dashed var(--border-strong)' }} />undated</span>
          <span><i style={{ width: 16, borderTop: '1.5px dotted var(--border-strong)' }} />inferred</span>
          <span><i style={{ width: 16, borderTop: '1.5px solid var(--warning)' }} />white space</span>
          <span><i className="mg-mark" data-tone="lead" style={{ width: 16, height: 16, fontSize: 8 }}>◆</i>carries a lead</span>
        </div>
      )}
    </div>
  );
}

function Card({ p, S, compact, degree, on, dim, onHover, onSelect, onActivate }: {
  p: Placed; S: typeof SIZES.full; compact: boolean; degree: number; on: boolean; dim: boolean;
  onHover: (h: boolean) => void; onSelect: () => void; onActivate: () => void;
}) {
  const n = p.node!;
  const kindTag = n.own ? 'CYC' : n.kind === 'person' ? 'person' : typeLabel(n.orgType) || 'organization';
  const verTone = p.ver === 'verified' ? 'accent' : p.ver === 'probable' ? 'slate' : p.ver === 'inferred' ? 'warning' : 'accent';
  const verTitle = p.ver === 'verified' ? 'Documented with dates' : p.ver === 'probable' ? 'Documented, undated' : p.ver === 'inferred' ? 'Inferred' : 'Centre of this map';
  const sub = n.sub ?? (n.kind === 'person' ? 'person' : 'organization');
  return (
    <div data-mg-card className="mg-card" role="button" tabIndex={0} aria-pressed={on} aria-label={`${n.label}, ${sub}`} title={`${n.label} · ${sub}${n.score !== null ? ` · score ${n.score}` : ''} · double-click to focus`}
      data-on={on ? 'true' : undefined} data-dim={dim ? 'true' : undefined} data-root={n.focus ? 'true' : undefined}
      style={{ left: p.x, top: p.y, width: S.W, height: S.H }}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      onClick={e => { e.stopPropagation(); onSelect(); }} onDoubleClick={e => { e.stopPropagation(); onActivate(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.shiftKey) onActivate(); else onSelect(); } }}>
      <div className="mg-head">
        {n.kind === 'person' ? <Avatar name={n.label} size={compact ? 24 : 30} own={n.own} /> : <OrgMark name={n.label} size={compact ? 24 : 30} accent={n.own || n.focus} />}
        <div className="mg-title"><b>{n.label}</b><span>{sub}</span></div>
        {!compact && (
          <div className="mg-marks">
            <span className="mg-mark" data-tone={verTone} title={verTitle}><i /></span>
            {n.lead_id && <span className="mg-mark" data-tone="lead" title="Carries a lead">◆</span>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="mg-foot">
          <span className="fd-tag" data-tone={n.own ? 'accent' : undefined} style={{ flex: 'none' }}>{kindTag}</span>
          <span className="mg-metric" title={`${degree} link${degree === 1 ? '' : 's'}`}>⇅ {degree}</span>
          {n.score !== null && <span className="mg-metric" data-tone={n.score >= 70 ? 'accent' : n.score >= 45 ? undefined : 'warning'} title="Opportunity score">{n.score}</span>}
          {p.ver && <span className="mg-metric" style={{ marginLeft: 'auto', border: 'none', background: 'none', paddingRight: 0 }} title={relLabel(p.ver)}>{p.ver === 'verified' ? 'dated' : p.ver === 'probable' ? 'undated' : 'inferred'}</span>}
        </div>
      )}
    </div>
  );
}
