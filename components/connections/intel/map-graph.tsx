'use client';

// The relationship map as a layered card graph. The focused node (CYC on the
// overview) sits at the top; every other node hangs under the neighbour it
// was reached through, so a warm path reads top to bottom: CYC → board member
// → the room they shared → the funder. Each layer is a named lane (Board and
// staff, Shared rooms, Funders). Cards, not dots: each carries the name, the
// role, the evidence grade, the lead score and, on funders, the pipeline
// status. Funders with no path yet fold into one card so the warm paths are
// the picture; wide branches fold behind "+N more". With nothing selected the
// strongest path is lit, so the first glance answers "where do we push".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize2, ChevronDown } from 'lucide-react';
import type { GraphPayload, GraphNode, GraphLink, PipelineState } from '@/lib/network/queries';
import { Avatar, OrgMark, typeLabel, STATUS_LABEL } from './shared';

interface Props {
  data: GraphPayload | null;
  height?: number | 'auto';
  maxHeight?: number;
  selectedId?: string | null;
  onSelect?: (node: GraphNode | null) => void;
  onActivate?: (node: GraphNode) => void;   // double-click / Shift+Enter: focus the neighbourhood
  onOpenLead?: (leadId: string) => void;    // the ◆ on a funder card
  compact?: boolean;
}

export interface Placed {
  id: string; node: GraphNode | null; x: number; y: number; depth: number;
  ver: GraphLink['verification'] | null;
  stub?: { parent: string; count: number };
  group?: { parent: string; members: GraphNode[] };   // funders with no path, folded into one card
}
interface TreeEdge { from: string; to: string; link: GraphLink | null }
export interface Layout { placed: Placed[]; byId: Map<string, Placed>; edges: TreeEdge[]; cross: GraphLink[]; w: number; h: number; cardW: number; lanes: Array<{ depth: number; label: string }>; parentOf: Map<string, string> }

const SIZES = {
  full: { W: 224, H: 84, GX: 16, GY: 56, MAX: 6, PAD: 24, GUTTER: 92 },
  compact: { W: 168, H: 52, GX: 12, GY: 36, MAX: 4, PAD: 12, GUTTER: 0 },
};
const VER_RANK: Record<string, number> = { verified: 0, probable: 1, inferred: 2 };
const DASH: Record<string, string | undefined> = { verified: undefined, probable: '6 4', inferred: '2 4' };
const GROUP_PREVIEW = 3;

const CSS = `
.mg-wrap{position:relative;width:100%;overflow:hidden;background:var(--bg-page);background-image:radial-gradient(var(--border-hairline) 1px,transparent 1px);background-size:22px 22px;user-select:none;touch-action:none;cursor:grab}
.mg-wrap[data-panning="true"]{cursor:grabbing}
.mg-stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.mg-lane{position:absolute;left:0;right:0;pointer-events:none;border-top:1px dashed color-mix(in srgb,var(--border-hairline) 70%,transparent)}
.mg-lane[data-odd="true"]{background:color-mix(in srgb,var(--bg-surface) 45%,transparent)}
.mg-gutter{position:absolute;left:0;top:0;bottom:0;pointer-events:none;border-right:1px solid var(--border-hairline);background:color-mix(in srgb,var(--bg-surface) 82%,transparent)}
.mg-lanelabel{position:absolute;left:10px;display:flex;flex-direction:column;gap:2px;max-width:80px}
.mg-lanelabel b{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--text-secondary);line-height:1.2}
.mg-lanelabel span{font-family:var(--font-mono);font-size:9.5px;color:var(--text-tertiary)}
.mg-card{position:absolute;box-sizing:border-box;background:var(--bg-surface);border:1px solid var(--border-hairline);border-radius:var(--radius);box-shadow:0 1px 0 rgba(11,18,32,.03);cursor:pointer;outline:none;transition:opacity .16s,border-color .12s,box-shadow .12s;display:flex;flex-direction:column;overflow:hidden}
.mg-card:hover{border-color:var(--border-strong)}
.mg-card[data-path="true"]{border-color:rgba(12,107,90,.45)}
.mg-card[data-on="true"],.mg-card:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
.mg-card[data-dim="hover"]{opacity:.55}
.mg-card[data-dim="true"]{opacity:.32}
.mg-card[data-root="true"]{border-color:var(--accent)}
.mg-head{display:flex;align-items:center;gap:9px;padding:9px 10px 8px;min-width:0;flex:1}
.mg-title{min-width:0;flex:1}
.mg-title b{display:block;font-size:12.5px;font-weight:500;letter-spacing:-.005em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)}
.mg-title span{display:block;margin-top:2px;font-size:10.5px;line-height:1.3;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg-marks{display:flex;gap:4px;flex:none}
.mg-mark{width:22px;height:22px;border-radius:var(--radius-xs);border:1px solid var(--border-hairline);background:var(--bg-page);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary);padding:0}
.mg-mark i{width:6px;height:6px;border-radius:50%;background:var(--border-strong)}
.mg-mark[data-tone="accent"] i{background:var(--accent)}
.mg-mark[data-tone="warning"] i{background:var(--warning)}
.mg-mark[data-tone="slate"] i{background:#5B7383}
.mg-mark[data-tone="lead"]{border-color:rgba(156,122,42,.4);color:var(--warning);cursor:pointer}
.mg-mark[data-tone="lead"]:hover{background:rgba(156,122,42,.10)}
.mg-foot{display:flex;align-items:center;gap:5px;padding:5px 8px;border-top:1px solid var(--border-hairline);background:var(--bg-page);min-width:0;overflow:hidden}
.mg-metric{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:var(--radius-xs);border:1px solid var(--border-hairline);background:var(--bg-surface);font-family:var(--font-mono);font-size:9.5px;color:var(--text-secondary);white-space:nowrap;flex:none}
.mg-metric[data-tone="accent"]{color:var(--accent);border-color:rgba(12,107,90,.3)}
.mg-metric[data-tone="warning"]{color:var(--warning);border-color:rgba(192,133,43,.34)}
.mg-metric[data-tone="slate"]{color:#5B7383;border-color:rgba(91,115,131,.3)}
.mg-stub{position:absolute;box-sizing:border-box;border:1px dashed var(--border-strong);border-radius:var(--radius);background:color-mix(in srgb,var(--bg-surface) 70%,transparent);color:var(--text-secondary);font:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;outline:none}
.mg-stub:hover,.mg-stub:focus-visible{border-color:var(--accent);color:var(--accent)}
.mg-stub i{font-style:normal;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)}
.mg-group{border-style:dashed;border-color:rgba(192,133,43,.45)}
.mg-group .mg-title b{color:var(--warning)}
.mg-group ul{margin:0;padding:0 10px 6px;list-style:none;display:flex;flex-direction:column;gap:2px}
.mg-group li{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden}
.mg-group li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.mg-group li b{font-family:var(--font-mono);font-size:9.5px;font-weight:600;color:var(--text-tertiary)}
.mg-tools{position:absolute;right:10px;bottom:10px;display:flex;gap:4px}
.mg-legend{position:absolute;bottom:10px;display:flex;gap:12px;flex-wrap:wrap;padding:5px 9px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--bg-surface) 90%,transparent);border:1px solid var(--border-hairline);font-size:10.5px;color:var(--text-secondary)}
.mg-legend span{display:inline-flex;align-items:center;gap:5px}
.mg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:12.5px}
@media (max-width:700px){.mg-legend{display:none}}
@media (prefers-reduced-motion:reduce){.mg-card{transition:none}}
`;

// ── Layout ───────────────────────────────────────────────────────────────────

const laneLabel = (nodes: GraphNode[], depth: number, root: GraphNode | undefined): string => {
  if (depth === 0) return root?.own || root?.label === 'CYC' ? 'CYC' : 'Centre';
  let own = 0, people = 0, funders = 0, orgs = 0;
  for (const n of nodes) { if (n.kind === 'person') { if (n.own) own++; else people++; } else if (n.lead_id) funders++; else orgs++; }
  const parts: Array<[number, string]> = [[own, 'Board & staff'], [people, 'Contacts'], [funders, 'Funders'], [orgs, 'Shared rooms']];
  parts.sort((a, b) => b[0] - a[0]);
  const top = parts.filter(p => p[0] > 0).slice(0, 2);
  if (!top.length) return `${depth} step${depth === 1 ? '' : 's'}`;
  if (top.length === 2 && top[1][0] >= top[0][0] * 0.4) return `${top[0][1]} · ${top[1][1]}`;
  return top[0][1];
};

export function buildLayout(data: GraphPayload, expanded: Set<string>, compact: boolean): Layout {
  const S = compact ? SIZES.compact : SIZES.full;
  const nodes = data.nodes; const byNode = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map<string, Array<{ id: string; link: GraphLink }>>();
  const push = (a: string, b: string, link: GraphLink) => { if (!byNode.has(a) || !byNode.has(b)) return; (adj.get(a) ?? adj.set(a, []).get(a)!).push({ id: b, link }); };
  for (const l of data.links) { push(l.source, l.target, l); push(l.target, l.source, l); }
  const degree = (id: string) => adj.get(id)?.length ?? 0;
  const linkRank = (l: GraphLink) => VER_RANK[l.verification] * 1000 - l.strength;
  for (const list of adj.values()) list.sort((a, b) => linkRank(a.link) - linkRank(b.link));

  // BFS forest: the focused node first, then whatever is left, biggest hub
  // first. Real relationships are walked before white-space links, so a funder
  // that is both "gives to CYC's peers" and reachable through a board member
  // hangs at the end of its warm path, not directly under CYC.
  const depth = new Map<string, number>(); const parent = new Map<string, { id: string; link: GraphLink } | null>();
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  const attach = (cur: string, id: string, link: GraphLink) => { depth.set(id, depth.get(cur)! + 1); parent.set(id, { id: cur, link }); (children.get(cur) ?? children.set(cur, []).get(cur)!).push(id); };
  const walk = (start: string, allowWhiteSpace: boolean) => {
    const q = [start];
    while (q.length) {
      const cur = q.shift()!;
      for (const { id, link } of adj.get(cur) ?? []) {
        if (depth.has(id) || (!allowWhiteSpace && link.type === 'white_space')) continue;
        attach(cur, id, link); q.push(id);
      }
    }
  };
  const order = [...nodes].sort((a, b) => (b.focus ? 1 : 0) - (a.focus ? 1 : 0) || degree(b.id) - degree(a.id));
  for (const start of order) {
    if (depth.has(start.id)) continue;
    roots.push(start.id); depth.set(start.id, 0); parent.set(start.id, null);
    walk(start.id, false);
    // anything still unreached from this tree hangs off its white-space links
    const reached = [...depth.keys()];
    for (const cur of reached) for (const { id, link } of adj.get(cur) ?? []) if (!depth.has(id) && link.type === 'white_space') { attach(cur, id, link); walk(id, false); }
  }
  const childRank = (id: string) => { const n = byNode.get(id)!; const p = parent.get(id)!; return -(n.score ?? -1) * 10 + VER_RANK[p.link.verification]; };
  for (const kids of children.values()) kids.sort((a, b) => childRank(a) - childRank(b) || byNode.get(a)!.label.localeCompare(byNode.get(b)!.label));

  // Visible children per parent: white-space funders (a lead but no path) fold
  // into one group card; the long tail of the rest folds behind a stub.
  type Vis = { kids: string[]; stub: number; group: string[] };
  const visible = (pid: string): Vis => {
    const all = children.get(pid) ?? [];
    let group: string[] = []; let kids = all;
    if (!compact && !expanded.has(`ws:${pid}`)) {
      const ws = all.filter(k => parent.get(k)!.link.type === 'white_space' && !(children.get(k)?.length));
      if (ws.length > 1) { group = ws; kids = all.filter(k => !ws.includes(k)); }
    }
    if (kids.length > S.MAX + 1 && !expanded.has(pid)) return { kids: kids.slice(0, S.MAX), stub: kids.length - S.MAX, group };
    return { kids, stub: 0, group };
  };

  const width = new Map<string, number>();
  const measure = (id: string): number => {
    const { kids, stub, group } = visible(id);
    const parts = kids.map(measure); if (stub) parts.push(S.W); if (group.length) parts.push(S.W);
    const w = parts.length ? parts.reduce((a, b) => a + b, 0) + S.GX * (parts.length - 1) : S.W;
    width.set(id, Math.max(S.W, w)); return width.get(id)!;
  };
  const placed: Placed[] = []; const edges: TreeEdge[] = []; const parentOf = new Map<string, string>();
  const place = (id: string, left: number, d: number) => {
    const w = width.get(id)!; const x = left + (w - S.W) / 2; const y = d * (S.H + S.GY);
    const p = parent.get(id) ?? null;
    placed.push({ id, node: byNode.get(id)!, x, y, depth: d, ver: p ? p.link.verification : null });
    if (p) { edges.push({ from: p.id, to: id, link: p.link }); parentOf.set(id, p.id); }
    const { kids, stub, group } = visible(id);
    const parts = [...kids.map(k => width.get(k)!), ...(stub ? [S.W] : []), ...(group.length ? [S.W] : [])];
    const total = parts.reduce((a, b) => a + b, 0) + S.GX * (parts.length - 1);
    let cx = left + (w - total) / 2;
    kids.forEach((k, i) => { place(k, cx, d + 1); cx += parts[i] + S.GX; });
    if (stub) { const sid = `stub:${id}`; placed.push({ id: sid, node: null, x: cx, y: (d + 1) * (S.H + S.GY), depth: d + 1, stub: { parent: id, count: stub }, ver: null }); edges.push({ from: id, to: sid, link: null }); cx += S.W + S.GX; }
    if (group.length) { const gid = `group:${id}`; placed.push({ id: gid, node: null, x: cx, y: (d + 1) * (S.H + S.GY), depth: d + 1, group: { parent: id, members: group.map(k => byNode.get(k)!) }, ver: null }); edges.push({ from: id, to: gid, link: parent.get(group[0])!.link }); }
  };
  let left = S.PAD;
  for (const r of roots) { measure(r); place(r, left, 0); left += width.get(r)! + S.GX * 2; }
  const byId = new Map(placed.map(p => [p.id, p]));
  const tree = new Set(edges.map(e => [e.from, e.to].sort().join('|')));
  const cross = data.links.filter(l => byId.has(l.source) && byId.has(l.target) && !tree.has([l.source, l.target].sort().join('|')));
  const w = Math.max(...placed.map(p => p.x + S.W), 0) + S.PAD;
  const h = Math.max(...placed.map(p => p.y + S.H + (p.group ? 14 * Math.min(GROUP_PREVIEW, p.group.members.length) : 0)), 0) + S.PAD;
  const maxDepth = Math.max(...placed.map(p => p.depth), 0);
  const rootNode = byNode.get(roots[0]);
  const lanes = Array.from({ length: maxDepth + 1 }, (_, d) => ({ depth: d, label: laneLabel(placed.filter(p => p.depth === d && p.node).map(p => p.node!), d, rootNode) }));
  return { placed, byId, edges, cross, w, h, cardW: S.W, lanes, parentOf };
}

/** The best-scoring lead reachable through a real path, and the chain of node ids from the root to it. */
const CLOSED = new Set(['NOT_A_FIT', 'LOST', 'WON', 'DEFERRED']);
export function strongestPath(lay: Layout): { ids: string[]; target: GraphNode } | null {
  // Live leads first (there is still something to push); closed ones only when nothing else has a path.
  const rank = (n: GraphNode) => (CLOSED.has(n.status ?? '') ? 0 : 1000) + (n.score ?? 0);
  let best: Placed | null = null;
  for (const p of lay.placed) {
    if (!p.node || p.node.score === null || !p.node.lead_id || p.depth < 2) continue;
    if (!best || rank(p.node) > rank(best.node!)) best = p;
  }
  if (!best) return null;
  const ids: string[] = []; let cur: string | undefined = best.id;
  while (cur) { ids.unshift(cur); cur = lay.parentOf.get(cur); }
  return { ids, target: best.node! };
}

// Fit keeps cards legible: never below 0.8×. A tree wider than the viewport is
// centred on its root instead of shrunk, and the user pans along the layer.
function fitView(lay: Layout, sz: { w: number; h: number }, gutter: number, minK = 0.8) {
  if (!lay.placed.length) return { x: 0, y: 0, k: 1 };
  const avail = sz.w - gutter - 24;
  const k = Math.max(minK, Math.min(1, avail / lay.w, (sz.h - 24) / lay.h));
  const root = lay.placed.find(p => p.depth === 0) ?? lay.placed[0];
  const rootCx = root.x + lay.cardW / 2;
  const x = lay.w * k <= avail ? gutter + (avail - lay.w * k) / 2 + 12 : gutter + avail / 2 + 12 - rootCx * k;
  const y = lay.h * k < sz.h - 24 ? (sz.h - lay.h * k) / 2 : 12;
  return { x, y, k };
}

// ── Component ────────────────────────────────────────────────────────────────

export function MapGraph({ data, height = 520, maxHeight = 720, selectedId, onSelect, onActivate, onOpenLead, compact }: Props) {
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
  const best = useMemo(() => (layout && !compact ? strongestPath(layout) : null), [layout, compact]);
  const bestIds = useMemo(() => new Set(best?.ids ?? []), [best]);
  const minK = compact ? 0.5 : 0.8;

  // Auto height: the tree at its minimum legible zoom, clamped, so a shallow
  // tree leaves no dead band and a deep one scrolls.
  const autoH = layout ? Math.max(420, Math.min(maxHeight, Math.round(layout.h * minK + 96))) : 420;
  const cssHeight = height === 'auto' ? autoH : height;

  const layoutRef = useRef<Layout | null>(null);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const sz = { w: el.clientWidth, h: el.clientHeight };
      setSize(sz);
      if (layoutRef.current) setView(fitView(layoutRef.current, sz, S.GUTTER, minK));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [S.GUTTER, minK]);

  const fit = useCallback((lay: Layout | null) => { if (lay) setView(fitView(lay, size, S.GUTTER, minK)); }, [size, S.GUTTER, minK]);

  // New payload: reset folds and fit (state adjusted during render, not in an effect). Fold changes keep the view.
  const dataKey = data ? `${data.mode}:${data.focus?.id ?? 'root'}:${data.nodes.length}` : '';
  const [seenKey, setSeenKey] = useState('');
  if (dataKey !== seenKey) {
    setSeenKey(dataKey);
    setExpanded(new Set());
    if (data) setView(fitView(buildLayout(data, new Set(), !!compact), size, S.GUTTER, minK));
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

  const activeId = hover ?? selectedId ?? null;
  const lit = useMemo(() => (activeId ? new Set([activeId, ...(adj.get(activeId) ?? [])]) : null), [activeId, adj]);
  const isLit = (a: string, b: string) => !!activeId && (a === activeId || b === activeId);
  const onBest = (a: string, b: string) => !activeId && bestIds.has(a) && bestIds.has(b);

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
  const laneTop = (d: number) => view.y + (d * (S.H + S.GY) - S.GY / 2) * view.k;
  const laneH = (S.H + S.GY) * view.k;

  return (
    <div ref={wrapRef} className="mg-wrap" data-panning={panning ? 'true' : undefined} style={{ height: cssHeight, borderRadius: 'inherit' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
      role="group" aria-label={data ? `Relationship map with ${nodeCount} nodes and ${data.links.length} links` : 'Relationship map'}>
      <style>{CSS}</style>
      {/* lanes: one band per layer, fixed to the viewport horizontally, moving with the tree vertically */}
      {layout && !compact && layout.lanes.map(l => <div key={l.depth} className="mg-lane" data-odd={l.depth % 2 ? 'true' : undefined} style={{ top: laneTop(l.depth), height: laneH }} />)}
      {layout && (
        <div className="mg-stage" style={{ width: layout.w, height: layout.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg width={layout.w} height={layout.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden>
            {layout.cross.map((l, i) => {
              const on = isLit(l.source, l.target);
              return <path key={`c${i}`} d={crossPath(l)} fill="none" stroke={on ? (l.type === 'white_space' ? 'var(--warning)' : 'var(--accent)') : 'var(--border-strong)'} strokeWidth={on ? 1.6 : 1} strokeDasharray={DASH[l.verification] ?? '2 4'} opacity={lit && !on ? 0.15 : on ? 1 : 0.45} />;
            })}
            {layout.edges.map(e => {
              const on = isLit(e.from, e.to) || onBest(e.from, e.to);
              const dim = lit && !on;
              const ws = e.link?.type === 'white_space';
              const stroke = !e.link ? 'var(--border-strong)' : on ? (ws ? 'var(--warning)' : 'var(--accent)') : ws ? 'rgba(192,133,43,.6)' : 'var(--border-strong)';
              return <path key={`${e.from}>${e.to}`} d={edgePath(e)} fill="none" stroke={stroke} strokeWidth={on ? 2 : 1.25} strokeDasharray={e.link ? DASH[e.link.verification] : '3 3'} opacity={dim ? 0.3 : 1} />;
            })}
          </svg>
          {layout.placed.map(p => p.stub ? (
            <button key={p.id} type="button" data-mg-card className="mg-stub" style={{ left: p.x, top: p.y, width: S.W, height: S.H }}
              onClick={() => setExpanded(s => new Set(s).add(p.stub!.parent))} title="Show the rest of this branch">
              <Plus style={{ width: 12, height: 12 }} />{p.stub.count} more<i>· show all</i>
            </button>
          ) : p.group ? (
            <GroupCard key={p.id} p={p} S={S} dim={lit ? (hover && !selectedId ? 'hover' : 'true') : undefined} onExpand={() => setExpanded(s => new Set(s).add(`ws:${p.group!.parent}`))} onOpenLead={onOpenLead} />
          ) : (
            <Card key={p.id} p={p} S={S} compact={!!compact} degree={adj.get(p.id)?.size ?? 0}
              on={selectedId === p.id} dim={lit && !lit.has(p.id) ? (hover && !selectedId ? 'hover' : 'true') : undefined} onPath={!activeId && bestIds.has(p.id)}
              onHover={h => setHover(h ? p.id : null)}
              onSelect={() => onSelect?.(p.node)} onActivate={() => p.node && onActivate?.(p.node)}
              onOpenLead={onOpenLead} />
          ))}
        </div>
      )}
      {layout && !compact && (
        <div className="mg-gutter" style={{ width: S.GUTTER }}>
          {layout.lanes.map(l => (
            <div key={l.depth} className="mg-lanelabel" style={{ top: laneTop(l.depth) + 10 }}>
              <b>{l.label}</b>
              <span>{layout.placed.filter(p => p.depth === l.depth && p.node).length}{l.depth > 0 ? ` · step ${l.depth}` : ''}</span>
            </div>
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
        <div className="mg-legend" style={{ left: S.GUTTER + 10 }}>
          <span><i style={{ width: 16, borderTop: '2px solid var(--accent)' }} />strongest path</span>
          <span><i style={{ width: 16, borderTop: '1.5px solid var(--border-strong)' }} />dated</span>
          <span><i style={{ width: 16, borderTop: '1.5px dashed var(--border-strong)' }} />undated</span>
          <span><i style={{ width: 16, borderTop: '1.5px dotted var(--border-strong)' }} />inferred</span>
          <span><i style={{ width: 16, borderTop: '1.5px solid var(--warning)' }} />white space</span>
          <span><i className="mg-mark" data-tone="lead" style={{ width: 16, height: 16, fontSize: 8 }}>◆</i>open the lead</span>
        </div>
      )}
    </div>
  );
}

const statusTone = (s: string | null): string | undefined => (!s ? undefined : s === 'WON' ? 'accent' : s === 'LOST' || s === 'NOT_A_FIT' || s === 'DEFERRED' ? undefined : s === 'NEW' ? 'slate' : 'warning');

function Card({ p, S, compact, degree, on, dim, onPath, onHover, onSelect, onActivate, onOpenLead }: {
  p: Placed; S: typeof SIZES.full; compact: boolean; degree: number; on: boolean; dim?: 'hover' | 'true'; onPath: boolean;
  onHover: (h: boolean) => void; onSelect: () => void; onActivate: () => void; onOpenLead?: (id: string) => void;
}) {
  const n = p.node!;
  const kindTag = n.own ? 'CYC' : n.kind === 'person' ? 'person' : typeLabel(n.orgType) || 'organization';
  const verTone = p.ver === 'verified' ? 'accent' : p.ver === 'probable' ? 'slate' : p.ver === 'inferred' ? 'warning' : 'accent';
  const verTitle = p.ver === 'verified' ? 'Documented with dates' : p.ver === 'probable' ? 'Documented, undated' : p.ver === 'inferred' ? 'Inferred' : 'Centre of this map';
  const sub = n.sub ?? (n.kind === 'person' ? 'person' : 'organization');
  const status = n.status ? (STATUS_LABEL[n.status as PipelineState] ?? n.status) : null;
  return (
    <div data-mg-card className="mg-card" role="button" tabIndex={0} aria-pressed={on} aria-label={`${n.label}, ${sub}`} title={`${n.label} · ${sub}${n.score !== null ? ` · score ${n.score}` : ''} · double-click to focus`}
      data-on={on ? 'true' : undefined} data-dim={dim} data-root={n.focus ? 'true' : undefined} data-path={onPath ? 'true' : undefined}
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
            {n.lead_id && (
              <button type="button" className="mg-mark" data-tone="lead" style={{ font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 9 }} title="Open the lead" aria-label={`Open the lead for ${n.label}`}
                onClick={e => { e.stopPropagation(); onOpenLead?.(n.lead_id!); }} onDoubleClick={e => e.stopPropagation()}>◆</button>
            )}
          </div>
        )}
      </div>
      {!compact && (
        <div className="mg-foot">
          <span className="fd-tag" data-tone={n.own ? 'accent' : undefined} style={{ flex: 'none' }}>{kindTag}</span>
          <span className="mg-metric" title={`${degree} link${degree === 1 ? '' : 's'}`}>⇅ {degree}</span>
          {n.score !== null && <span className="mg-metric" data-tone={n.score >= 70 ? 'accent' : n.score >= 45 ? undefined : 'warning'} title="Opportunity score">{n.score}</span>}
          {status && <span className="mg-metric" data-tone={statusTone(n.status)} style={{ marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 88 }} title={`Pipeline: ${status}`}>{status}</span>}
        </div>
      )}
    </div>
  );
}

function GroupCard({ p, S, dim, onExpand, onOpenLead }: { p: Placed; S: typeof SIZES.full; dim?: 'hover' | 'true'; onExpand: () => void; onOpenLead?: (id: string) => void }) {
  const members = [...p.group!.members].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const preview = members.slice(0, GROUP_PREVIEW);
  const h = S.H + 14 * preview.length;
  return (
    <div data-mg-card className="mg-card mg-group" role="button" tabIndex={0} aria-label={`${members.length} funders with no path yet`} title="Funders that give to CYC's peers but have no documented path yet · click to unfold"
      data-dim={dim} style={{ left: p.x, top: p.y, width: S.W, height: h }}
      onClick={e => { e.stopPropagation(); onExpand(); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(); } }}>
      <div className="mg-head" style={{ flex: 'none', paddingBottom: 4 }}>
        <span className="mg-mark" data-tone="warning" style={{ width: 30, height: 30 }}><i /></span>
        <div className="mg-title"><b>{members.length} funders, no path yet</b><span>white space · give to CYC&rsquo;s peers</span></div>
        <ChevronDown style={{ width: 14, height: 14, color: 'var(--text-tertiary)', flex: 'none' }} />
      </div>
      <ul>
        {preview.map(m => (
          <li key={m.id}>
            <span>{m.label}</span>
            <b>{m.score ?? ''}</b>
            {m.lead_id && <button type="button" className="mg-mark" data-tone="lead" style={{ width: 16, height: 16, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 7 }} title="Open the lead" aria-label={`Open the lead for ${m.label}`} onClick={e => { e.stopPropagation(); onOpenLead?.(m.lead_id!); }}>◆</button>}
          </li>
        ))}
      </ul>
      <div className="mg-foot" style={{ marginTop: 'auto' }}>
        <span className="mg-metric" data-tone="warning">{members.length - preview.length > 0 ? `+${members.length - preview.length} more` : 'all shown'}</span>
        <span className="mg-metric" style={{ marginLeft: 'auto', border: 'none', background: 'none' }}>unfold</span>
      </div>
    </div>
  );
}
