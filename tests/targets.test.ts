import { describe, it, expect } from 'vitest';
import { scoreTargetHit, pickContacts, CHICAGO_STARTER } from '@/lib/network/targets';
import { scoreCorporate, describeCorporate, type CorpSignals } from '@/lib/network/corporate';

const hit = (title: string, location = 'Chicago, Illinois') => ({ url: 'https://www.linkedin.com/in/x', name: 'X', headline: null, title, location });

describe('target company hit scoring', () => {
  it('keeps community-affairs and giving staff, ranks Chicago-area people higher', () => {
    const a = scoreTargetHit(hit('Director of Community Affairs'))!;
    const b = scoreTargetHit(hit('Director of Community Affairs', 'Boise, Idaho'))!;
    expect(a.tier).toBe('giving');
    expect(a.score).toBeGreaterThan(b.score);
  });
  it('keeps local operators and executives in lower tiers', () => {
    expect(scoreTargetHit(hit('District Manager'))!.tier).toBe('local');
    expect(scoreTargetHit(hit('Vice President, Marketing'))!.tier).toBe('executive');
    expect(scoreTargetHit(hit('VP Corporate Social Responsibility'))!.tier).toBe('giving');
  });
  it('drops back-office, assistant and floor titles that cannot move giving', () => {
    expect(scoreTargetHit(hit('Director of Safety & Food Safety'))).toBeNull();
    expect(scoreTargetHit(hit('Assistant Store Director'))).toBeNull();
    expect(scoreTargetHit(hit('Vice President of Marketing & Merchandising'))).toBeNull();
    expect(scoreTargetHit(hit('Director Communications, Public Affairs & Government Relations'))!.tier).toBe('giving');
  });
  it('keeps at most two local-operations people per company', () => {
    const hits = [hit('Store Director'), hit('Store Director'), hit('Store Manager'), hit('District Manager'), hit('Community Relations Manager')].map(h => scoreTargetHit(h)!);
    const picked = pickContacts(hits, 4);
    expect(picked.filter(p => p.tier === 'local')).toHaveLength(2);
    expect(picked[0].tier).toBe('giving');
  });
  it('drops store-floor and technical titles', () => {
    expect(scoreTargetHit(hit('Cashier'))).toBeNull();
    expect(scoreTargetHit(hit('Software Engineer II'))).toBeNull();
    expect(scoreTargetHit(hit('Pharmacy Technician'))).toBeNull();
    expect(scoreTargetHit(hit('Night stocker'))).toBeNull();
  });
  it('ships a starter list with grocers first and no duplicate names', () => {
    expect(CHICAGO_STARTER[0].category).toBe('grocery');
    expect(new Set(CHICAGO_STARTER.map(s => s.name.toLowerCase())).size).toBe(CHICAGO_STARTER.length);
    expect(CHICAGO_STARTER.length).toBeGreaterThanOrEqual(15);
  });
});

describe('corporate scoring with target contacts', () => {
  const base: CorpSignals = { people: [], foundation: null, peerEvents: 0, fundedCyc: false, craOverlap: false, program: null };
  it('counts contacts as access, and a bridged contact as a relationship', () => {
    const none = scoreCorporate(base);
    const found = scoreCorporate({ ...base, contacts: [{ id: '1', name: 'Ana Ruiz', title: 'Community Affairs Manager', pathTo: null }] });
    const bridged = scoreCorporate({ ...base, contacts: [{ id: '1', name: 'Ana Ruiz', title: 'Community Affairs Manager', pathTo: 'Phil Doherty' }] });
    expect(found.score).toBeGreaterThan(none.score);
    expect(bridged.score).toBeGreaterThan(found.score);
    expect(bridged.reasons.some(r => r.includes('Phil Doherty'))).toBe(true);
  });
  it('writes the introduction ask around the bridged contact when no CYC person works there', () => {
    const s: CorpSignals = { ...base, contacts: [{ id: '1', name: 'Ana Ruiz', title: 'Community Affairs Manager', pathTo: 'Phil Doherty' }] };
    const text = describeCorporate('Jewel-Osco', s, scoreCorporate(s));
    expect(text).toContain('ask Phil Doherty for an introduction to Ana Ruiz');
    expect(text).toContain('no personal relationship');
  });
});

describe('contacts-only corporate leads', () => {
  const base: CorpSignals = { people: [], foundation: null, peerEvents: 0, fundedCyc: false, craOverlap: false, program: null };
  it('a company with named giving contacts and no other signal still scores as actionable', () => {
    const one = scoreCorporate({ ...base, contacts: [{ id: '1', name: 'Ana Ruiz', title: 'Community Affairs Manager', pathTo: null }] });
    const four = scoreCorporate({ ...base, contacts: [1, 2, 3, 4].map(i => ({ id: String(i), name: `Contact ${i}`, title: 'Community Giving', pathTo: null })) });
    expect(one.score).toBeGreaterThanOrEqual(10);
    expect(four.score).toBeGreaterThan(one.score);
    expect(four.score).toBeLessThanOrEqual(20);
  });
});
