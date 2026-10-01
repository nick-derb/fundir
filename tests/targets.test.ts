import { describe, it, expect } from 'vitest';
import { scoreTargetHit, CHICAGO_STARTER } from '@/lib/network/targets';
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
