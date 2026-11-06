import { describe, it, expect } from 'vitest';
import { readBriefSeen, writeBriefSeen } from '@/lib/brief-seen';

const T = (iso: string) => new Date(iso);

describe('readBriefSeen', () => {
  it('has no baseline on a first visit, and keeps none inside that first session', () => {
    const now = T('2026-10-27T09:00:00Z');
    expect(readBriefSeen(undefined, now)).toEqual({ baseline: null, lastSeen: null });
    const written = writeBriefSeen(readBriefSeen(undefined, now), now);
    expect(written).toBe('|2026-10-27T09:00:00.000Z');
    expect(readBriefSeen(written, T('2026-10-27T09:05:00Z')).baseline).toBeNull();
  });
  it('starts a new session after six quiet hours, with the previous visit as the baseline', () => {
    const cookie = '|2026-10-26T17:00:00.000Z';
    const now = T('2026-10-27T09:00:00Z');
    const seen = readBriefSeen(cookie, now);
    expect(seen.baseline?.toISOString()).toBe('2026-10-26T17:00:00.000Z');
    const written = writeBriefSeen(seen, now);
    expect(written).toBe('2026-10-26T17:00:00.000Z|2026-10-27T09:00:00.000Z');
    // Every later load inside the session sees the same baseline.
    expect(readBriefSeen(written, T('2026-10-27T09:05:00Z')).baseline?.toISOString()).toBe('2026-10-26T17:00:00.000Z');
    expect(readBriefSeen(written, T('2026-10-27T14:00:00Z')).baseline?.toISOString()).toBe('2026-10-26T17:00:00.000Z');
  });
  it('treats the first release\'s single timestamp as the last visit', () => {
    expect(readBriefSeen('2026-10-26T17:00:00.000Z', T('2026-10-27T09:00:00Z')).baseline?.toISOString()).toBe('2026-10-26T17:00:00.000Z');
    expect(readBriefSeen('2026-10-27T08:30:00.000Z', T('2026-10-27T09:00:00Z')).baseline).toBeNull();
  });
  it('ignores garbage', () => {
    expect(readBriefSeen('not a date|%E0%41', T('2026-10-27T09:00:00Z'))).toEqual({ baseline: null, lastSeen: null });
  });
});
