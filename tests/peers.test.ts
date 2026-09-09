import { describe, it, expect } from 'vitest';
import { scorePeer, CYC_PEER_PROFILE, type PeerCandidate } from '@/lib/network/peers';

const base: PeerCandidate = {
  organization_id: 'x', name: 'After School Matters', ntee_code: 'O50', city: 'Chicago', state: 'IL',
  zip: '60654', revenue: 40_000_000, total_assets: null, peer_category: 'Youth Development',
};

describe('scorePeer', () => {
  it('scores a Chicago youth-development org as a strong peer with reasons', () => {
    const s = scorePeer(base, CYC_PEER_PROFILE);
    expect(s.similarity).toBeGreaterThan(0.85);
    expect(s.components.geography).toBe(1);
    expect(s.components.population).toBe(1);
    expect(s.reasons).toContain('Based in Chicago');
    expect(s.reasons.some(r => r.startsWith('Same NTEE group O'))).toBe(true);
  });

  it('gives an identical NTEE code full program credit', () => {
    const s = scorePeer({ ...base, ntee_code: 'O20' });
    expect(s.components.program).toBe(1);
  });

  it('discounts geography and unrelated programs, neutral on unknown size', () => {
    const s = scorePeer({ ...base, name: 'Springfield Symphony', ntee_code: 'A69', city: 'Springfield', zip: '62701', revenue: null, peer_category: null });
    expect(s.components.geography).toBe(0.5);
    expect(s.components.program).toBeLessThan(0.3);
    expect(s.components.size).toBe(0.5);
    expect(s.components.population).toBe(0.3);
    expect(s.similarity).toBeLessThan(0.4);
  });

  it('treats a Cook County zip as near-Chicago and a tiny budget as a weak size match', () => {
    const s = scorePeer({ ...base, city: 'Evanston', zip: '60201', revenue: 150_000 });
    expect(s.components.geography).toBe(0.9);
    expect(s.components.size).toBe(0.2);
  });

  it('infers population from the name when no category is given', () => {
    const s = scorePeer({ ...base, peer_category: null, name: 'Westside Teen Center' });
    expect(s.components.population).toBe(0.8);
  });

  it('is bounded 0..1 and deterministic', () => {
    const a = scorePeer(base), b = scorePeer(base);
    expect(a.similarity).toBe(b.similarity);
    expect(a.similarity).toBeLessThanOrEqual(1);
    expect(a.similarity).toBeGreaterThanOrEqual(0);
  });
});
