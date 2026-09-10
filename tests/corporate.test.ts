import { describe, it, expect } from 'vitest';
import { scoreCorporate, describeCorporate, type CorpSignals, type GivingProgram } from '@/lib/network/corporate';

const program: GivingProgram = {
  company: 'Grainger', vehicles: ['corporate foundation', 'employee matching'], focus_areas: ['education', 'workforce development', 'disaster relief'],
  geographic_scope: 'communities where we operate', chicago_named: true, youth_named: true,
  application_path: 'invitation only', contact: 'community@grainger.com', leadership: [{ name: 'A Person', title: 'Director, Community Affairs' }],
  named_recipients: ['After School Matters'], gaps: [],
};
const base: CorpSignals = {
  people: [{ id: 'p1', name: 'Sean Ramsey', board_role: 'Member', current: true }],
  foundation: { id: 'f1', name: 'Grainger Foundation Inc' }, peerEvents: 3, fundedCyc: false, craOverlap: false, program,
};

describe('scoreCorporate', () => {
  it('rewards people + funding fit + public access, capped at 100', () => {
    const r = scoreCorporate(base);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.reasons.some(x => x.includes('peer grant'))).toBe(true);
    expect(r.reasons.some(x => x.includes('Chicago'))).toBe(true);
    expect(r.reasons.some(x => x.includes('currently at the company'))).toBe(true);
  });
  it('is low with no people, no funding evidence, no program', () => {
    const r = scoreCorporate({ people: [], foundation: null, peerEvents: 0, fundedCyc: false, craOverlap: false, program: null });
    expect(r.score).toBe(0);
  });
  it('credits former employment less than current', () => {
    const cur = scoreCorporate({ ...base, program: null, peerEvents: 0 }).score;
    const past = scoreCorporate({ ...base, program: null, peerEvents: 0, people: [{ ...base.people[0], current: false }] }).score;
    expect(cur - past).toBe(10);
  });
});

describe('describeCorporate', () => {
  it('hedges, names the path, and states the funding-relationship caveat honestly', () => {
    const r = scoreCorporate(base);
    const w = describeCorporate('Grainger', base, r);
    expect(w).toContain('Grainger appears relevant because');
    expect(w).toContain('Sean Ramsey currently works at Grainger');
    expect(w).toContain('No CYC funding relationship from the company is identified in available data.');
    expect(w).toContain('no personal relationship with its philanthropy staff is asserted');
    expect(w).not.toMatch(/will fund|has agreed|knows/i);
  });
  it('drops the caveat when a CYC relationship exists', () => {
    const s = { ...base, fundedCyc: true };
    expect(describeCorporate('Grainger', s, scoreCorporate(s))).not.toContain('No CYC funding relationship');
  });
});
