import { describe, it, expect } from 'vitest';
import { createSimulation, settle, tick, bounds } from '@/lib/network/force';

describe('force layout', () => {
  it('settles a small graph without NaN and keeps linked nodes closer than unlinked ones', () => {
    const nodes = ['cyc', 'a', 'b', 'c', 'd', 'e'].map(id => ({ id, r: 8 }));
    const links = [{ source: 'cyc', target: 'a' }, { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'cyc', target: 'd' }];
    const sim = createSimulation(nodes, links, { width: 800, height: 600 });
    const steps = settle(sim);
    expect(steps).toBeGreaterThan(10);
    for (const n of sim.nodes) { expect(Number.isFinite(n.x)).toBe(true); expect(Number.isFinite(n.y)).toBe(true); }
    const d = (p: string, q: string) => { const a = sim.index.get(p)!, b = sim.index.get(q)!; return Math.hypot(a.x - b.x, a.y - b.y); };
    expect(d('cyc', 'a')).toBeLessThan(d('cyc', 'c'));
    expect(d('a', 'b')).toBeLessThan(d('a', 'e'));
  });
  it('never lets two nodes sit on top of each other', () => {
    const sim = createSimulation(Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, r: 8 })), [], { width: 600, height: 400 });
    settle(sim);
    for (let i = 0; i < sim.nodes.length; i++) for (let j = i + 1; j < sim.nodes.length; j++) {
      expect(Math.hypot(sim.nodes[i].x - sim.nodes[j].x, sim.nodes[i].y - sim.nodes[j].y)).toBeGreaterThan(10);
    }
  });
  it('is deterministic and reports bounds', () => {
    const mk = () => { const s = createSimulation([{ id: 'x' }, { id: 'y' }, { id: 'z' }], [{ source: 'x', target: 'y' }], { width: 400, height: 300 }); settle(s); return s; };
    const a = mk(), b = mk();
    expect(a.nodes.map(n => [Math.round(n.x), Math.round(n.y)])).toEqual(b.nodes.map(n => [Math.round(n.x), Math.round(n.y)]));
    const bb = bounds(a);
    expect(bb.maxX).toBeGreaterThan(bb.minX);
    expect(tick(a)).toBe(false);
  });
});
