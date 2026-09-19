import { describe, it, expect } from 'vitest';
import { scorePeerHit, titleTier } from '@/lib/network/peer-staff';

const hit = (title: string, location = 'Chicago, Illinois, United States') => ({ url: 'https://www.linkedin.com/in/x', name: 'X', headline: null, title, location });

describe('titleTier / scorePeerHit', () => {
  it('reads fundraising titles as development', () => {
    expect(titleTier('Chief Development Officer', null)).toBe('development');
    expect(titleTier('Institutional Giving Manager', null)).toBe('development');
    expect(titleTier('Manager of Events and Donor Relations', null)).toBe('development');
    expect(scorePeerHit(hit('Director of Development'))?.score).toBeGreaterThan(50);
  });
  it('does not mistake training or program work for fundraising', () => {
    expect(titleTier('Professional Development Coordinator', null)).toBeNull();
    expect(titleTier('Youth Development Specialist', null)).toBeNull();
    expect(scorePeerHit(hit('Professional Development Specialist'))).toBeNull();
    expect(titleTier('Director of Program Development', null)).toBe('executive');
  });
  it('keeps executives and drops noise', () => {
    expect(titleTier('Executive Director', null)).toBe('executive');
    expect(scorePeerHit(hit('Software Engineer'))).toBeNull();
    expect(scorePeerHit(hit('Summer Intern'))).toBeNull();
  });
});
