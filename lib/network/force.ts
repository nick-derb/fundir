// A small, dependency-free force layout for the relationship map.
//
// Deterministic (seeded by node order), O(n²) repulsion — fine for the ≤ ~120
// nodes a focused neighbourhood ever shows (the whole point of the map is to
// never draw a hairball). Pure: the canvas component owns rendering and
// interaction; this file only moves points.

export interface SimNode { id: string; x: number; y: number; vx: number; vy: number; r: number; fixed?: boolean }
export interface SimLink { source: string; target: string; distance: number; strength: number }
export interface Simulation {
  nodes: SimNode[]; links: SimLink[];
  alpha: number; alphaMin: number; alphaDecay: number;
  width: number; height: number;
  index: Map<string, SimNode>;
}

export function createSimulation(nodes: Array<{ id: string; r?: number; x?: number; y?: number; fixed?: boolean }>, links: Array<{ source: string; target: string; distance?: number; strength?: number }>, opts: { width: number; height: number; seedRadius?: number }): Simulation {
  const cx = opts.width / 2, cy = opts.height / 2;
  const seed = opts.seedRadius ?? Math.min(opts.width, opts.height) * 0.32;
  const sim: Simulation = { nodes: [], links: [], alpha: 1, alphaMin: 0.02, alphaDecay: 0.035, width: opts.width, height: opts.height, index: new Map() };
  nodes.forEach((n, i) => {
    // Golden-angle spiral: evenly spread, stable across re-runs, no randomness.
    const a = i * 2.399963, d = seed * Math.sqrt((i + 1) / Math.max(1, nodes.length));
    const node: SimNode = { id: n.id, x: n.x ?? cx + Math.cos(a) * d, y: n.y ?? cy + Math.sin(a) * d, vx: 0, vy: 0, r: n.r ?? 8, fixed: n.fixed };
    sim.nodes.push(node); sim.index.set(n.id, node);
  });
  for (const l of links) if (sim.index.has(l.source) && sim.index.has(l.target) && l.source !== l.target) sim.links.push({ source: l.source, target: l.target, distance: l.distance ?? 90, strength: l.strength ?? 0.4 });
  return sim;
}

/** Advance one step. Returns false once the layout has settled. */
export function tick(sim: Simulation): boolean {
  if (sim.alpha < sim.alphaMin) return false;
  const a = sim.alpha;
  const { nodes, links } = sim;
  // Links: springs toward their rest length.
  for (const l of links) {
    const s = sim.index.get(l.source)!, t = sim.index.get(l.target)!;
    let dx = t.x - s.x, dy = t.y - s.y;
    let d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
    const k = ((d - l.distance) / d) * l.strength * a;
    dx *= k; dy *= k;
    if (!t.fixed) { t.vx -= dx * 0.5; t.vy -= dy * 0.5; }
    if (!s.fixed) { s.vx += dx * 0.5; s.vy += dy * 0.5; }
    d = 0;
  }
  // Many-body: everyone repels everyone, inverse-square with a floor so overlaps still separate.
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const m = nodes[j];
      let dx = m.x - n.x, dy = m.y - n.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = 0.5; dy = 0.5; d2 = 0.5; }
      const minD = n.r + m.r + 6;
      const f = (-1800 * a) / d2 + (d2 < minD * minD ? -(minD * minD - d2) * 0.02 : 0);
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (!n.fixed) { n.vx += fx; n.vy += fy; }
      if (!m.fixed) { m.vx -= fx; m.vy -= fy; }
    }
  }
  // Gentle centering + velocity integration with damping.
  const cx = sim.width / 2, cy = sim.height / 2;
  for (const n of nodes) {
    if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
    n.vx += (cx - n.x) * 0.012 * a; n.vy += (cy - n.y) * 0.012 * a;
    n.vx *= 0.6; n.vy *= 0.6;
    n.x += n.vx; n.y += n.vy;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) { n.x = cx; n.y = cy; n.vx = 0; n.vy = 0; }
  }
  sim.alpha -= sim.alpha * sim.alphaDecay;
  return true;
}

/** Run to rest (used by tests and for an instant first paint). */
export function settle(sim: Simulation, maxSteps = 400): number {
  let steps = 0;
  while (steps < maxSteps && tick(sim)) steps++;
  return steps;
}

/** Warm the simulation after a change (new focus) without restarting from scratch. */
export function reheat(sim: Simulation, alpha = 0.6) { sim.alpha = Math.max(sim.alpha, alpha); }

export function bounds(sim: Simulation): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of sim.nodes) { minX = Math.min(minX, n.x - n.r); minY = Math.min(minY, n.y - n.r); maxX = Math.max(maxX, n.x + n.r); maxY = Math.max(maxY, n.y + n.r); }
  if (!sim.nodes.length) return { minX: 0, minY: 0, maxX: sim.width, maxY: sim.height };
  return { minX, minY, maxX, maxY };
}
