import { describe, it, expect } from 'vitest';
import { parentCorporationName, describePath, pathStrength, pathConfidence, type PathEdge } from '@/lib/network/crossref';

const edge = (over: Partial<PathEdge>): PathEdge => ({
  id: 'e1', relationship_type: 'shared_employer', relationship_strength: 18, confidence: 0.6, verification: 'probable',
  evidence: { summary: 'A and B both worked at Chicago Tribune' }, source_id: 's1', ...over,
});
const base = {
  cycPerson: { id: 'p1', name: 'Phil Doherty', kind: 'board', board_role: 'Chair' },
  trustee: { id: 't1', name: 'Scott C. Smith', title: 'Chairman' },
  foundation: { id: 'f1', name: 'Robert R. McCormick Foundation' },
  sharedOrg: 'Chicago Tribune',
};

describe('parentCorporationName', () => {
  it('derives the corporation behind a corporate foundation', () => {
    expect(parentCorporationName('Northern Trust Foundation')).toBe('Northern Trust');
    expect(parentCorporationName('BMO Harris Bank Charitable Foundation')).toBe('BMO');
    expect(parentCorporationName('Exelon Foundation')).toBe('Exelon');
    expect(parentCorporationName('Wintrust Financial Foundation')).toBe('Wintrust');
  });
  it('returns null when nothing corporate is left', () => {
    expect(parentCorporationName('Foundation')).toBeNull();
    expect(parentCorporationName('Family Fund')).toBeNull();
  });
});

describe('describePath', () => {
  it('hedges and cites — never asserts a personal relationship', () => {
    const w = describePath({ ...base, edge: edge({}) }, 'public_bio');
    expect(w).toContain('both worked at Chicago Tribune');
    expect(w).toContain('overlap is unverified');
    expect(w).toContain('per public bio');
    expect(w).toContain('Potential warm introduction through Phil Doherty');
    expect(w).toContain('no personal relationship is asserted');
    expect(w).not.toMatch(/knows|friends|close to/i);
  });
  it('states dated overlap for former colleagues and flags inferred links', () => {
    const w = describePath({ ...base, edge: edge({ relationship_type: 'former_colleague', verification: 'verified', evidence: { tenures: [{ start: 1997, end: 2008 }, { start: 2004, end: 2016 }] } }) }, 'irs_990_xml');
    expect(w).toContain('overlapped at Chicago Tribune (1997–2008 / 2004–2016)');
    expect(w).toContain('per IRS filing');
    const inf = describePath({ ...base, edge: edge({ verification: 'inferred' }) }, null);
    expect(inf).toContain('This link is inferred, not documented.');
  });
});

describe('scoring', () => {
  const fit = { peerEvents: 0, onQueue: false, onCultivation: false, fundedCyc: false };
  it('ranks a verified dated colleague above an undated shared employer', () => {
    const a = pathStrength(edge({ relationship_type: 'former_colleague', relationship_strength: 25, confidence: 0.8, verification: 'verified' }), fit);
    const b = pathStrength(edge({}), fit);
    expect(a).toBeGreaterThan(b);
    expect(a).toBeLessThanOrEqual(100);
  });
  it('adds funder fit and grades confidence from verification', () => {
    const plain = pathStrength(edge({}), fit);
    const fitted = pathStrength(edge({}), { peerEvents: 4, onQueue: true, onCultivation: true, fundedCyc: false });
    expect(fitted - plain).toBe(28);
    expect(pathConfidence(edge({ verification: 'verified', confidence: 0.8 }))).toBe('High');
    expect(pathConfidence(edge({}))).toBe('Medium');
    expect(pathConfidence(edge({ verification: 'inferred' }))).toBe('Low');
  });
});
