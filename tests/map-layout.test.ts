import { describe, it, expect } from 'vitest';
import { buildLayout } from '@/components/connections/intel/map-graph';
import type { GraphPayload, GraphNode, GraphLink } from '@/lib/network/queries';

const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, kind: 'org', label: id, sub: null, own: false, orgType: null, focus: false, lead_id: null, score: null, rowId: id, ...over });
const link = (a: string, b: string, over: Partial<GraphLink> = {}): GraphLink => ({ source: a, target: b, type: 'seat', verification: 'verified', strength: 50, label: null, ...over });

describe('map layout', () => {
  it('puts the focused node at the top and hangs neighbours beneath it', () => {
    const data: GraphPayload = { mode: 'overview', focus: null, nodes: [node('cyc', { focus: true, own: true }), node('a'), node('b'), node('c')], links: [link('cyc', 'a'), link('a', 'b'), link('cyc', 'c')] };
    const lay = buildLayout(data, new Set(), false);
    expect(lay.byId.get('cyc')!.depth).toBe(0);
    expect(lay.byId.get('a')!.depth).toBe(1);
    expect(lay.byId.get('c')!.depth).toBe(1);
    expect(lay.byId.get('b')!.depth).toBe(2);
    // the root is centred over its children
    const root = lay.byId.get('cyc')!, a = lay.byId.get('a')!, c = lay.byId.get('c')!;
    expect(root.x).toBeGreaterThanOrEqual(Math.min(a.x, c.x));
    expect(root.x).toBeLessThanOrEqual(Math.max(a.x, c.x));
    expect(lay.edges).toHaveLength(3);
    expect(lay.cross).toHaveLength(0);
  });

  it('keeps extra links between branches as cross links, not tree edges', () => {
    const data: GraphPayload = { mode: 'overview', focus: null, nodes: [node('cyc', { focus: true }), node('a'), node('b')], links: [link('cyc', 'a'), link('cyc', 'b'), link('a', 'b', { verification: 'inferred' })] };
    const lay = buildLayout(data, new Set(), false);
    expect(lay.edges).toHaveLength(2);
    expect(lay.cross).toHaveLength(1);
    expect(lay.cross[0].verification).toBe('inferred');
  });

  it('folds a wide branch behind a stub and unfolds it when expanded', () => {
    const kids = Array.from({ length: 10 }, (_, i) => `k${i}`);
    const data: GraphPayload = { mode: 'overview', focus: null, nodes: [node('cyc', { focus: true }), ...kids.map(k => node(k))], links: kids.map(k => link('cyc', k)) };
    const folded = buildLayout(data, new Set(), false);
    const stub = folded.placed.find(p => p.stub);
    expect(stub).toBeTruthy();
    expect(stub!.stub!.count).toBe(4);
    expect(folded.placed.filter(p => p.node).length).toBe(7);
    const open = buildLayout(data, new Set(['cyc']), false);
    expect(open.placed.find(p => p.stub)).toBeUndefined();
    expect(open.placed.filter(p => p.node).length).toBe(11);
    expect(open.w).toBeGreaterThan(folded.w);
  });

  it('places unreachable nodes as their own trees instead of dropping them', () => {
    const data: GraphPayload = { mode: 'overview', focus: null, nodes: [node('cyc', { focus: true }), node('a'), node('island')], links: [link('cyc', 'a')] };
    const lay = buildLayout(data, new Set(), false);
    expect(lay.byId.get('island')!.depth).toBe(0);
    expect(lay.byId.get('island')!.x).toBeGreaterThan(lay.byId.get('cyc')!.x);
  });
});
