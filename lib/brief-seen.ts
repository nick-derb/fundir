// "Since you last looked", kept in one browser cookie the dashboard sets for
// itself as "<baseline>|<lastSeen>". A working session is any run of visits
// less than six hours apart; the baseline is the end of the previous session,
// so every load inside a session shows the same "new" markers. Pure, with no
// imports, so the server page (which reads) and the client section (which
// writes) apply one rule.

export const SEEN_COOKIE = 'fundir_brief_seen';
export const SESSION_GAP_MS = 6 * 3600 * 1000;

export interface BriefSeen { baseline: Date | null; lastSeen: Date | null }

const parse = (s: string | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Resolve the baseline the brief should use from the cookie value (already percent-decoded). */
export function readBriefSeen(raw: string | null | undefined, now: Date): BriefSeen {
  const v = raw ?? '';
  const [a, b] = v.split('|');
  const legacy = !v.includes('|'); // a single timestamp, written by the first release: the last visit
  const stored = legacy ? null : parse(a);
  const lastSeen = legacy ? parse(a) : parse(b);
  if (lastSeen && now.getTime() - lastSeen.getTime() > SESSION_GAP_MS) return { baseline: lastSeen, lastSeen };
  return { baseline: stored, lastSeen };
}

/** The value to write back after a load: the resolved baseline, and now as the last visit. */
export const writeBriefSeen = (seen: BriefSeen, now: Date) => `${seen.baseline?.toISOString() ?? ''}|${now.toISOString()}`;
