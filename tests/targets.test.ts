import { describe, it, expect } from 'vitest';
import { scoreTargetHit, pickContacts, CHICAGO_STARTER, contactVerdict, sameCompany } from '@/lib/network/targets';
import { scoreCorporate, describeCorporate, type CorpSignals } from '@/lib/network/corporate';
import type { EmployeeHit } from '@/lib/network/linkedin';

let n = 0;
const hit = (title: string, location = 'Chicago, Illinois'): EmployeeHit => { n++; return { url: `https://www.linkedin.com/in/x${n}`, name: `Person ${n}`, headline: null, title, location }; };

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

describe('contact verification after the profile is read', () => {
  it('matches company names across legal suffixes, articles and accents', () => {
    expect(sameCompany('The Kraft Heinz Company', 'Kraft Heinz')).toBe(true);
    expect(sameCompany('Target Corporation', 'Target')).toBe(true);
    expect(sameCompany('ALDI USA', 'ALDI')).toBe(true);
    expect(sameCompany('Mondelēz International', 'Mondelez International')).toBe(true);
    expect(sameCompany('The Home Depot Foundation', 'The Home Depot')).toBe(true);
    expect(sameCompany('CBS Radio 780 Chicago', 'Jewel-Osco')).toBe(false);
    expect(sameCompany('Chick-fil-A Corporate Support Center', 'Mariano\'s')).toBe(false);
  });
  it('keeps a giving contact who is still at the company, including when only the headline names it', () => {
    expect(contactVerdict({ title: 'Senior Director, Philanthropy & Community Giving', headline: null, currentOrg: 'Walgreens', currentOrgs: ['Walgreens'] }, 'Walgreens').keep).toBe(true);
    expect(contactVerdict({ title: 'Community Giving Manager', headline: 'Community Giving Manager at ALDI USA', currentOrg: null, currentOrgs: [] }, 'ALDI USA').keep).toBe(true);
    expect(contactVerdict({ title: 'Director, Community Partnerships & Giving', headline: null, currentOrg: 'Meijer', currentOrgs: ['Meijer Inc.'] }, 'Meijer').keep).toBe(true);
  });
  it('drops a contact whose profile shows they moved to another company', () => {
    const v = contactVerdict({ title: 'Broadcast Journalist', headline: 'Broadcast Journalist at CBS Radio', currentOrg: 'CBS Radio 780 Chicago', currentOrgs: ['CBS Radio 780 Chicago'] }, 'Jewel-Osco');
    expect(v.keep).toBe(false);
    const moved = contactVerdict({ title: 'Director of Community Affairs', headline: null, currentOrg: 'Chick-fil-A', currentOrgs: ['Chick-fil-A'] }, 'Mariano\'s');
    expect(moved.keep).toBe(false);
    if (!moved.keep) expect(moved.reason).toMatch(/now at Chick-fil-A/);
  });
  it('drops support, finance, technology and sales roles the search title hid', () => {
    expect(contactVerdict({ title: 'Executive Assistant - Diversity & Inclusion, Employee Development & Community Relations', headline: null, currentOrg: 'Costco Wholesale' }, 'Costco Wholesale').keep).toBe(false);
    expect(contactVerdict({ title: 'Chief Technology Officer', headline: null, currentOrg: 'Costco Wholesale' }, 'Costco Wholesale').keep).toBe(false);
    expect(contactVerdict({ title: 'Financial Controller', headline: null, currentOrg: 'Kraft Heinz' }, 'The Kraft Heinz Company').keep).toBe(false);
    expect(contactVerdict({ title: 'EIT Food & Beverage Sales', headline: null, currentOrg: 'Target' }, 'Target').keep).toBe(false);
    expect(contactVerdict({ title: 'Vice President of Merchandising - Beauty', headline: null, currentOrg: 'Walgreens' }, 'Walgreens').keep).toBe(false);
  });
  it('keeps a thin profile with no employer rather than treating missing data as evidence', () => {
    expect(contactVerdict({ title: 'Community Relations Manager', headline: null, currentOrg: null, currentOrgs: [] }, 'Portillo\'s').keep).toBe(true);
  });
});

describe('scan hygiene', () => {
  const hit = (name: string, title: string): EmployeeHit => ({ url: `https://www.linkedin.com/in/${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`, name, headline: null, title, location: 'Chicago, Illinois' });
  it('keeps one row per person when the same name comes back under two profile URLs', () => {
    const scored = [hit('Yvette Pittman', 'Government and Community Relations'), hit('Yvette Pittman', 'Government & Community Relations'), hit('Vanessa Hall', 'Manager, Community Partnerships')].map(h => scoreTargetHit(h)!);
    expect(pickContacts(scored).map(s => s.hit.name)).toEqual(['Yvette Pittman', 'Vanessa Hall']);
  });
  it('does not keep technology or security executives on the strength of their rank', () => {
    expect(scoreTargetHit(hit('A', 'Vice President, Cybersecurity Risk & Response'))).toBeNull();
    expect(scoreTargetHit(hit('B', 'Senior Director, Retail Product Delivery Lead'))).toBeNull();
    expect(contactVerdict({ title: 'Vice President, Cybersecurity Risk & Response', headline: null, currentOrg: 'US Foods' }, 'US Foods').keep).toBe(false);
    expect(scoreTargetHit(hit('C', 'Vice President of Operations'))!.tier).toBe('executive');
  });
});
