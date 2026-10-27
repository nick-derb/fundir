import { describe, it, expect } from 'vitest';
import { orgShortName, orgPossessive } from '@/lib/org-label';

describe('orgShortName', () => {
  it('takes the initials of the significant words', () => {
    expect(orgShortName('Chicago Youth Centers')).toBe('CYC');
    expect(orgShortName('Boys & Girls Clubs of Chicago')).toBe('BGCC');
    expect(orgShortName('Erie Neighborhood House')).toBe('ENH');
    expect(orgShortName('Northside Youth Collaborative')).toBe('NYC');
    expect(orgShortName('CHICAGO YOUTH CENTERS')).toBe('CYC');
  });
  it('prefers an acronym the name already carries', () => {
    expect(orgShortName('Metropolitan Family Services (MFS)')).toBe('MFS');
    expect(orgShortName('YMCA of Metropolitan Chicago')).toBe('YMCA');
    expect(orgShortName('YWCA Metropolitan Chicago')).toBe('YWCA');
    expect(orgShortName('JCC Chicago')).toBe('JCC');
    expect(orgShortName("SOS Children's Villages Illinois")).toBe('SOS');
    expect(orgShortName('US Soccer Foundation')).toBe('USF');
  });
  it('ignores corporate suffixes and punctuation', () => {
    expect(orgShortName('Chicago Youth Centers, Inc.')).toBe('CYC');
    expect(orgShortName('Heartland Alliance NFP')).toBe('HA');
  });
  it('keeps a one-word name and falls back to the full name when the initials would be a mouthful', () => {
    expect(orgShortName('Heartland')).toBe('Heartland');
    expect(orgShortName('Alternatives, Inc.')).toBe('Alternatives');
    expect(orgShortName('The ARK')).toBe('ARK');
    expect(orgShortName('Big Brothers Big Sisters of Metropolitan Chicago')).toBe('Big Brothers Big Sisters of Metropolitan Chicago');
    expect(orgShortName('')).toBe('your organization');
    expect(orgShortName(null)).toBe('your organization');
  });
});

describe('orgPossessive', () => {
  it('adds the apostrophe the way copy would', () => {
    expect(orgPossessive('CYC')).toBe("CYC's");
    expect(orgPossessive('Heartland')).toBe("Heartland's");
    expect(orgPossessive('Alternatives')).toBe("Alternatives'");
    expect(orgPossessive('BBBS')).toBe("BBBS's");
  });
});
