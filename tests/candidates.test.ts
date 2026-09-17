import { describe, it, expect } from 'vitest';
import { namesAgree, corroborate } from '@/lib/network/candidates';
import type { LinkedInProfile } from '@/lib/network/linkedin';

const prof = (o: Partial<LinkedInProfile>): LinkedInProfile => ({
  url: 'https://www.linkedin.com/in/x', name: null, headline: null, location: null, summary: null,
  currentTitle: null, currentOrg: null, experiences: [], educations: [], ...o,
});
const exp = (org: string) => ({ org, title: null, started: null, ended: null, isCurrent: false });

describe('namesAgree', () => {
  it('accepts nicknames, initials, honorifics and suffixes', () => {
    expect(namesAgree('Catherine (Cathy) Main', 'Cathy Main')).toBe(true);
    expect(namesAgree('Dennis J. FitzSimons', 'Dennis FitzSimons')).toBe(true);
    expect(namesAgree('Edward A. Wiertel, Jr.', 'Edward Wiertel')).toBe(true);
    expect(namesAgree('Mr Charles B McKenna', 'Charles McKenna')).toBe(true);
    expect(namesAgree('William J. Kelley, Jr.', 'William J K.')).toBe(false); // surname withheld
    expect(namesAgree('KJ McConnell', 'KJ McConnell')).toBe(true);
  });
  it('accepts a maiden / middle surname and hyphenated surnames', () => {
    expect(namesAgree('Dixie Adams Erwin', 'Dixie Adams')).toBe(true);
    expect(namesAgree('Michelle Speller-Thurman', 'Michelle Speller')).toBe(true);
    expect(namesAgree('Celena Sarillo, M.S.W., M.Ed.', 'Celena Sarillo')).toBe(true);
  });
  it('rejects a different person', () => {
    expect(namesAgree('Amy Waldron', 'Amy Walton')).toBe(false);
    expect(namesAgree('Sean Ramsey', 'Shawn Ramsey')).toBe(true);   // initial agrees — org must decide
    expect(namesAgree('Sean Ramsey', 'Tom Ramsey')).toBe(false);
  });
});

describe('corroborate', () => {
  const person = { name: 'Sean Ramsey', knownOrgs: ['Grainger'], hasEmployer: true };
  it('verifies on name + a known organization anywhere in the profile', () => {
    const v = corroborate(person, prof({ name: 'Sean Ramsey', currentOrg: 'W.W. Grainger, Inc.' }));
    expect(v.ok && v.verification).toBe('verified');
    const past = corroborate({ name: 'Jack Silverman', knownOrgs: ['Kirkland & Ellis, LLP'], hasEmployer: true }, prof({ name: 'Jack Silverman', currentOrg: 'Cooley LLP', experiences: [exp('Kirkland & Ellis')] }));
    expect(past.ok).toBe(true);
    const dotcom = corroborate({ name: 'Erik Hansen', knownOrgs: ['Cars.com'], hasEmployer: true }, prof({ name: 'Erik Hansen', currentOrg: 'Cars Commerce' }));
    expect(dotcom.ok).toBe(true);
  });
  it('keeps a same-name local profile of a foundation trustee as probable', () => {
    const trustee = { name: 'Connie Lindsey', knownOrgs: ['The Chicago Community Trust'], hasEmployer: true, kind: 'trustee' };
    const v = corroborate(trustee, prof({ name: 'Connie Lindsey', currentOrg: 'Northern Trust', location: 'Greater Chicago Area' }));
    expect(v.ok && v.verification).toBe('probable');
    expect(corroborate(trustee, prof({ name: 'Connie Lindsey', currentOrg: 'Northern Trust', location: 'New York' })).ok).toBe(false);
    expect(corroborate({ ...trustee, kind: 'board' }, prof({ name: 'Connie Lindsey', currentOrg: 'Northern Trust', location: 'Greater Chicago Area' })).ok).toBe(false);
  });
  it('rejects when the name agrees but no known organization appears', () => {
    const v = corroborate(person, prof({ name: 'Sean Ramsey', currentOrg: 'Tyler Technologies' }));
    expect(v.ok).toBe(false);
  });
  it('rejects a name mismatch outright', () => {
    expect(corroborate(person, prof({ name: 'Alex Boryszewski', currentOrg: 'Grainger' })).ok).toBe(false);
  });
  it('only reaches "probable" when nothing is on file and the profile is local', () => {
    const council = { name: 'Patti Van Cleave', knownOrgs: [], hasEmployer: false };
    const v = corroborate(council, prof({ name: 'Patti Van Cleave', location: 'Greater Chicago Area' }));
    expect(v.ok && v.verification).toBe('probable');
    expect(corroborate(council, prof({ name: 'Patti Van Cleave', location: 'Denver' })).ok).toBe(false);
  });
  it('does not let generic words corroborate', () => {
    const v = corroborate({ name: 'Emily Cooper', knownOrgs: ['Chicagoland Chamber of Commerce'], hasEmployer: true }, prof({ name: 'Emily Cooper', currentOrg: 'Chicago Community Trust' }));
    expect(v.ok).toBe(false);
  });
});
