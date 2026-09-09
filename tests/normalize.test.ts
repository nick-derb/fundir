import { describe, it, expect } from 'vitest';
import {
  normalizeEin, formatEin, canonicalLinkedInUrl, normalizeOrgName, canonicalEmployer,
  tokenizeName, jaccard, orgTypeOf, personNameKey, canMergePeople, yearsOverlap, fixMojibake,
} from '@/lib/network/normalize';

describe('EIN', () => {
  it('normalizes to 9 zero-padded digits', () => {
    expect(normalizeEin('36-2344429')).toBe('362344429');
    expect(normalizeEin(362344429)).toBe('362344429');
    expect(normalizeEin('6-2344429')).toBe('062344429');
    expect(normalizeEin('')).toBeNull();
    expect(normalizeEin('000000000')).toBeNull();
    expect(normalizeEin('1234567890')).toBeNull();
  });
  it('formats with a hyphen', () => {
    expect(formatEin('362344429')).toBe('36-2344429');
  });
});

describe('LinkedIn URL', () => {
  it('canonicalizes to https://www.linkedin.com/in/<slug>', () => {
    expect(canonicalLinkedInUrl('linkedin.com/in/Satya-Nadella/?trk=x')).toBe('https://www.linkedin.com/in/satya-nadella');
    expect(canonicalLinkedInUrl('https://www.linkedin.com/company/microsoft')).toBeNull();
    expect(canonicalLinkedInUrl('')).toBeNull();
  });
});

describe('organization names', () => {
  it('strips legal suffixes and leading "the"', () => {
    expect(normalizeOrgName('The Joyce Foundation')).toBe('joyce foundation');
    expect(normalizeOrgName('Kirkland & Ellis, LLP')).toBe('kirkland and ellis');
  });
  it('collapses employer aliases to one key', () => {
    const k = normalizeOrgName('JPMorgan Chase & Co.');
    expect(normalizeOrgName('JP Morgan')).toBe(k);
    expect(normalizeOrgName('Chase Bank')).toBe(k);
    expect(normalizeOrgName('BMO Harris Bank')).toBe(normalizeOrgName('BMO Financial Group'));
    expect(normalizeOrgName('Tribune Publishing')).toBe(normalizeOrgName('Chicago Tribune'));
  });
  it('canonicalEmployer strips "Retired," and returns a display name', () => {
    expect(canonicalEmployer('Retired, Chicago Tribune')).toEqual({ display: 'Chicago Tribune', key: 'chicago tribune' });
    expect(canonicalEmployer('Northern Trust Corporation')?.display).toBe('Northern Trust');
    expect(canonicalEmployer('')).toBeNull();
  });
  it('tokenizes without stopwords and computes jaccard', () => {
    expect(tokenizeName('The Robert R. McCormick Foundation')).toEqual(['robert', 'r', 'mccormick']);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], ['x'])).toBe(0);
  });
});

describe('organization type', () => {
  it('classifies by name and hints', () => {
    expect(orgTypeOf('The Chicago Community Trust')).toBe('community_foundation');
    expect(orgTypeOf('Robert R. McCormick Foundation')).toBe('foundation');
    expect(orgTypeOf('BNSF Railway Foundation')).toBe('corporate_foundation');
    expect(orgTypeOf('Huntington National Bank')).toBe('bank');
    expect(orgTypeOf('University of Illinois at Chicago')).toBe('university');
    expect(orgTypeOf("Cook County State's Attorney Office")).toBe('government');
    expect(orgTypeOf('Kirkland & Ellis LLP')).toBe('corporation');
    expect(orgTypeOf('After School Matters', { ntee: 'O50' })).toBe('nonprofit');
    expect(orgTypeOf('Some Trust', { funderType: 'bank' })).toBe('bank');
    expect(orgTypeOf('Acme', { foundationCode: '04' })).toBe('foundation');
    expect(orgTypeOf('Mystery')).toBe('unknown');
  });
});

describe('people identity', () => {
  it('builds a candidate key without titles and suffixes', () => {
    expect(personNameKey('Richard G. Baer, Jr.')).toBe('richard g baer');
    expect(personNameKey('Mary K. ("Katie") Lawler')).toBe('mary k lawler');
    expect(personNameKey('William McLean, CFA')).toBe('william mclean');
  });
  it('never merges on a name alone', () => {
    expect(canMergePeople({ nameExact: true })).toBe(false);
    expect(canMergePeople({ nameExact: true, sameLocation: true })).toBe(false);
  });
  it('merges on a canonical URL or two corroborating signals', () => {
    expect(canMergePeople({ sameCanonicalUrl: true })).toBe(true);
    expect(canMergePeople({ sameEmployerWithDates: true, citedBioMatch: true })).toBe(true);
    expect(canMergePeople({ sameEmployerWithDates: true })).toBe(false);
    expect(canMergePeople({ sameBoardSeat: true, sameEmployerWithDates: true })).toBe(true);
  });
});

describe('dates and text', () => {
  it('detects overlapping tenure', () => {
    expect(yearsOverlap(2016, 2019, 2018, null)).toBe(true);
    expect(yearsOverlap(2010, 2012, 2013, 2015)).toBe(false);
    expect(yearsOverlap(null, null, 2013, 2015)).toBe(false);
  });
  it('repairs mojibake', () => {
    expect(fixMojibake('Kirkland â€™s')).toBe('Kirkland ’s');
    expect(fixMojibake('plain')).toBe('plain');
  });
});
