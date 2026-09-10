'use client';

// The relationship map, on a canvas. Rules borrowed from graph-UX practice:
// draw a focused neighbourhood, never everything; shape encodes node type
// (people are circles, organizations rounded squares), dash encodes evidence
// grade (documented / undated / inferred), and the accent is reserved for
// CYC's own side and the thing under the cursor. Labels only where they can be
// read. Pan, zoom, drag; click focuses; positions persist across focus changes
// so the graph moves, it does not reshuffle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSimulation, tick, reheat, bounds, type Simulation, type SimNode } from '@/lib/network/force';
import type { GraphPayload, GraphNode } from '@/lib/network/queries';

interface Props {
  data: GraphPayload | null;
  height?: number | string;
  selectedId?: string | null;
  onSelect?: (node: GraphNode | null) => void;
  onActivate?: (node: GraphNode) => void;   // double-click / Enter: focus the neighbourhood
  compact?: boolean;
}

interface Theme { accent: string; accentTint: string; ink: string; ink2: string; ink3: string; line: string; surface: string; amber: string; info: string }
function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return { accent: v('--accent', '#0C6B5A'), accentTint: v('--accent-tint', 'rgba(12,107,90,.1)'), ink: v('--text-primary', '#0B1220'), ink2: v('--text-secondary', '#5A6B86'), ink3: v('--text-tertiary', '#8696AE'), line: v('--border-strong', '#B6C2D4'), surface: v('--bg-surface', '#fff'), amber: '#9C7A2A', info: '#3E6CA8' };
}
const DASH: Record<string, number[]> = { verified: [], probable: [6, 4], inferred: [2, 4] };
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function GraphCanvas({ data, height = 520, selectedId, onSelect, onActivate, compact }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const posMemo = useRef<Map<string, { x: number; y: number }>>(new Map());
  const view = useRef({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ mode: 'pan' | 'node'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const raf = useRef<number | null>(null);
  const [size, setSize] = useState({ w: 800, h: typeof height === 'number' ? height : 520 });
  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map(n => [n.id, n])), [data]);
  const adj = useMemo(() => { const m = new Map<string, Set<string>>(); for (const l of data?.links ?? []) { (m.get(l.source) ?? m.set(l.source, new Set()).get(l.source)!).add(l.target); (m.get(l.target) ?? m.set(l.target, new Set()).get(l.target)!).add(l.source); } return m; }, [data]);

  // Size to the container.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    // ResizeObserver delivers an initial measurement on observe(), so no synchronous setState here.
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // (Re)build the simulation when data changes, keeping known positions.
  useEffect(() => {
    if (!data) { simRef.current = null; return; }
    const prev = simRef.current;
    if (prev) for (const n of prev.nodes) posMemo.current.set(n.id, { x: n.x, y: n.y });
    const focus = data.nodes.find(n => n.focus);
    const cx = size.w / 2, cy = size.h / 2;
    const anchor = focus ? posMemo.current.get(focus.id) : null;
    const dx = anchor ? cx - anchor.x : 0, dy = anchor ? cy - anchor.y : 0;
    const degree = (id: string) => adj.get(id)?.size ?? 0;
    const sim = createSimulation(
      data.nodes.map(n => {
        const p = posMemo.current.get(n.id);
        const r = n.focus ? 16 : n.own ? 9 : Math.min(14, 7 + degree(n.id) * 0.6);
        return p ? { id: n.id, r, x: p.x + dx, y: p.y + dy } : { id: n.id, r };
      }),
      data.links.map(l => ({ source: l.source, target: l.target, distance: l.type === 'membership' ? 70 : 96 + Math.min(40, 200 / Math.max(1, l.strength)), strength: l.verification === 'verified' ? 0.5 : 0.35 })),
      { width: size.w, height: size.h, seedRadius: Math.min(size.w, size.h) * 0.3 },
    );
    // A brief warm-up so the first frame is already shaped, then animate the rest.
    for (let i = 0; i < 60 && tick(sim); i++) { /* warm */ }
    reheat(sim, 0.35);
    simRef.current = sim;
    view.current = { x: 0, y: 0, k: 1 };
    fit(sim);
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, size.w, size.h]);

  const fit = useCallback((sim: Simulation) => {
    const b = bounds(sim);
    const pad = 56;
    const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxY - b.minY);
    const k = Math.min(1.6, Math.max(0.35, Math.min((size.w - pad * 2) / bw, (size.h - pad * 2) / bh)));
    view.current = { k, x: size.w / 2 - k * (b.minX + bw / 2), y: size.h / 2 - k * (b.minY + bh / 2) };
  }, [size.w, size.h]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current, sim = simRef.current; if (!canvas || !data) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) { canvas.width = Math.round(size.w * dpr); canvas.height = Math.round(size.h * dpr); }
    const t = readTheme(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (!sim) return;
    const { x: vx, y: vy, k } = view.current;
    ctx.save(); ctx.translate(vx, vy); ctx.scale(k, k);
    const hov = hoverRef.current ?? selectedId ?? null;
    const lit = hov ? new Set([hov, ...(adj.get(hov) ?? [])]) : null;
    // Links
    for (const l of data.links) {
      const a = sim.index.get(l.source), b = sim.index.get(l.target); if (!a || !b) continue;
      const on = !lit || (lit.has(l.source) && lit.has(l.target) && (l.source === hov || l.target === hov));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.setLineDash(DASH[l.verification] ?? []);
      ctx.lineWidth = on ? 1.2 + Math.min(2.4, l.strength / 40) : 0.8;
      ctx.strokeStyle = on ? (l.type === 'white_space' ? t.amber : t.ink2) : t.line;
      ctx.globalAlpha = lit && !on ? 0.28 : 1;
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // Nodes
    const labelAll = k >= 0.85 && data.nodes.length <= 48;
    for (const n of data.nodes) {
      const p = sim.index.get(n.id); if (!p) continue;
      const dim = lit ? !lit.has(n.id) : false;
      ctx.globalAlpha = dim ? 0.3 : 1;
      const fill = n.own || n.focus && n.label === 'CYC' ? t.accent : n.kind === 'org' ? (n.orgType && /foundation/.test(n.orgType) ? t.surface : t.surface) : t.surface;
      const stroke = n.own ? t.accent : n.kind === 'org' ? (n.orgType && /corporat|bank/.test(n.orgType) ? t.info : n.lead_id ? t.amber : t.ink2) : t.ink2;
      ctx.beginPath();
      if (n.kind === 'person') ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      else roundRect(ctx, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, Math.max(3, p.r * 0.3));
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = n.focus || n.id === hov || n.id === selectedId ? 2.4 : 1.4;
      ctx.strokeStyle = n.id === hov || n.id === selectedId ? t.accent : stroke; ctx.stroke();
      if (n.focus || n.id === selectedId) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2); ctx.strokeStyle = t.accent; ctx.lineWidth = 1; ctx.globalAlpha = dim ? 0.2 : 0.55; ctx.stroke(); ctx.globalAlpha = dim ? 0.3 : 1; }
      if (n.score !== null && n.kind === 'org' && !compact) {
        // Score tag on lead targets: a small mono number under the mark.
        ctx.font = `600 ${9 / k > 9 ? 9 : 9}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = n.score >= 70 ? t.accent : t.ink3; ctx.fillText(String(n.score), p.x, p.y + p.r + 3);
      }
      const showLabel = labelAll || n.focus || n.id === hov || n.id === selectedId || (lit?.has(n.id) ?? false) || n.own || p.r >= 11;
      if (showLabel) {
        const label = truncate(n.label, n.focus ? 34 : 22);
        ctx.font = `${n.focus ? 600 : 500} ${n.focus ? 12.5 : 11}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const tx = p.x + p.r + 6, ty = p.y + (n.score !== null && n.kind === 'org' && !compact ? -1 : 0);
        const w = ctx.measureText(label).width;
        ctx.fillStyle = t.surface; ctx.globalAlpha = dim ? 0.25 : 0.85; ctx.fillRect(tx - 2, ty - 8, w + 4, 16); ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.fillStyle = n.focus || n.id === hov ? t.ink : t.ink2; ctx.fillText(label, tx, ty);
      }
    }
    ctx.restore();
  }, [data, size.w, size.h, adj, selectedId, compact]);

  const start = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const loop = () => { const sim = simRef.current; const moving = sim ? tick(sim) : false; draw(); if (moving) raf.current = requestAnimationFrame(loop); else raf.current = null; };
    raf.current = requestAnimationFrame(loop);
  }, [draw]);
  useEffect(() => { draw(); }, [draw, hover]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  // Hit testing in graph space.
  const toGraph = (ev: { clientX: number; clientY: number }) => { const r = canvasRef.current!.getBoundingClientRect(); const { x, y, k } = view.current; return { x: (ev.clientX - r.left - x) / k, y: (ev.clientY - r.top - y) / k }; };
  const hit = (gx: number, gy: number): SimNode | null => { const sim = simRef.current; if (!sim) return null; let best: SimNode | null = null, bd = Infinity; for (const n of sim.nodes) { const d = Math.hypot(n.x - gx, n.y - gy); if (d < n.r + 6 && d < bd) { bd = d; best = n; } } return best; };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = toGraph(e); const n = hit(g.x, g.y);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (n) { n.fixed = true; drag.current = { mode: 'node', id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false }; }
    else drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.current.x, oy: view.current.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.mode === 'pan') { view.current.x = d.ox + dx; view.current.y = d.oy + dy; draw(); }
      else { const n = simRef.current?.index.get(d.id!); if (n) { n.x = d.ox + dx / view.current.k; n.y = d.oy + dy / view.current.k; if (simRef.current) reheat(simRef.current, 0.25); if (!raf.current) start(); } }
      return;
    }
    const g = toGraph(e); const n = hit(g.x, g.y);
    const id = n?.id ?? null;
    if (id !== hoverRef.current) { hoverRef.current = id; setHover(id); canvasRef.current!.style.cursor = id ? 'pointer' : 'grab'; }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.mode === 'node') { const n = simRef.current?.index.get(d.id!); if (n) n.fixed = false; if (!d.moved) onSelect?.(nodeById.get(d.id!) ?? null); }
    else if (!d.moved) onSelect?.(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => { const g = toGraph(e); const n = hit(g.x, g.y); if (n) onActivate?.(nodeById.get(n.id)!); };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const { x, y, k } = view.current;
    const nk = Math.max(0.25, Math.min(3, k * (e.deltaY < 0 ? 1.12 : 0.89)));
    view.current = { k: nk, x: mx - (mx - x) * (nk / k), y: my - (my - y) * (nk / k) };
    draw();
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height, borderRadius: 'inherit', overflow: 'hidden', background: 'var(--bg-page)', backgroundImage: 'radial-gradient(var(--border-hairline) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h, display: 'block', cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { hoverRef.current = null; setHover(null); }} onDoubleClick={onDoubleClick} onWheel={onWheel}
        role="img" aria-label={data ? `Relationship map with ${data.nodes.length} nodes and ${data.links.length} links` : 'Relationship map'} />
      {hover && nodeById.get(hover) && <HoverCard node={nodeById.get(hover)!} degree={adj.get(hover)?.size ?? 0} />}
      <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 6 }}>
        <button type="button" className="ni-ghost" style={{ height: 26, padding: '0 9px', fontSize: 11 }} onClick={() => { if (simRef.current) { fit(simRef.current); draw(); } }}>Fit</button>
      </div>
      {!compact && <Legend />}
    </div>
  );
}

function HoverCard({ node, degree }: { node: GraphNode; degree: number }) {
  return (
    <div style={{ position: 'absolute', left: 12, top: 12, maxWidth: 280, background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 10, padding: '9px 12px', boxShadow: 'var(--shadow-overlay)', pointerEvents: 'none', animation: 'ni-rise .18s cubic-bezier(.2,.8,.2,1) both' }}>
      <b style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{node.label}</b>
      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{node.sub ?? (node.kind === 'person' ? 'person' : 'organization')}</span>
      <span className="fd-mono" style={{ display: 'block', fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 6, letterSpacing: '.05em', textTransform: 'uppercase' }}>{degree} link{degree === 1 ? '' : 's'}{node.score !== null ? ` · score ${node.score}` : ''} · double-click to focus</span>
    </div>
  );
}

function Legend() {
  const row = (glyph: React.ReactNode, text: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-secondary)' }}>{glyph}{text}</span>;
  return (
    <div style={{ position: 'absolute', left: 12, bottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap', padding: '6px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)', border: '1px solid var(--border-hairline)' }}>
      {row(<span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--accent)' }} />, 'CYC people')}
      {row(<span style={{ width: 10, height: 10, borderRadius: 5, border: '1.5px solid var(--text-secondary)' }} />, 'Others')}
      {row(<span style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px solid #9C7A2A' }} />, 'Funder with a lead')}
      {row(<span style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px solid #3E6CA8' }} />, 'Corporation')}
      {row(<span style={{ width: 18, borderTop: '1.5px solid var(--text-secondary)' }} />, 'documented')}
      {row(<span style={{ width: 18, borderTop: '1.5px dashed var(--text-secondary)' }} />, 'undated')}
      {row(<span style={{ width: 18, borderTop: '1.5px dotted var(--text-secondary)' }} />, 'inferred')}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
