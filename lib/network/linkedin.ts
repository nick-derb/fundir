// RapidAPI LinkedIn provider adapter — Fresh LinkedIn Profile Data, the same
// provider (and the same traps) documented in RAPIDAPI_SCRAPER_GUIDE.md:
//   • Canonical profile URLs (https://www.linkedin.com/in/<slug>, no query, no
//     trailing slash) are the identity key everywhere.
//   • NEVER store media.licdn.com image URLs — they're signed and die in ~60
//     days. v1 renders initials avatars instead of building the photo pipeline.
//   • Log the response BODY on every non-2xx; provider 400s name exact enums.
//   • Every loop carries a hard call budget so a runaway job can't drain the
//     account. Credits are per-call (enrich ≈ 2), and refreshes are quarterly /
//     on-demand — there is no cron anywhere in this feature.
//   • Some responses double-encode UTF-8 (â€™) — repair via cp1252 round-trip.
//
// Field names below were written against the provider's documented shapes but
// MUST be verified once in the RapidAPI playground with a live key ("smoke"
// first — see §3.4 of the guide). The normalizers are deliberately tolerant of
// the common aliases so a minor shape drift degrades to nulls, not crashes.

const HOST = process.env.RAPIDAPI_LINKEDIN_HOST || 'fresh-linkedin-profile-data.p.rapidapi.com';
const BASE = `https://${HOST}`;

export function isLinkedInConfigured(): boolean {
  return !!process.env.RAPIDAPI_KEY;
}

function headers(): Record<string, string> {
  return {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
    'x-rapidapi-host': HOST,
  };
}

/** Canonical https://www.linkedin.com/in/<slug> — the upsert identity (guide §4). */
export function canonicalLinkedInUrl(raw: string): string | null {
  const m = String(raw || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).replace(/\/+$/, '');
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

/** Repair double-encoded UTF-8 (â€™ → ’); keep the fix only if it round-trips. */
function fixMojibake(s: string | null | undefined): string | null {
  if (!s) return s ?? null;
  if (!/[ÃÂâ][-¿€™“”˜]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xff));
    const fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return fixed.length > 0 ? fixed : s;
  } catch {
    return s;
  }
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? fixMojibake(s) : null;
};

export interface LinkedInExperience {
  org: string;
  title: string | null;
  started: string | null;
  ended: string | null;
  isCurrent: boolean;
}

export interface LinkedInProfile {
  url: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  summary: string | null;
  currentTitle: string | null;
  currentOrg: string | null;
  experiences: LinkedInExperience[];
}

/** Call budget shared across one refresh step. `spend()` throws past the cap. */
export class CallBudget {
  used = 0;
  constructor(readonly cap: number) {}
  spend(n = 1) {
    if (this.used + n > this.cap) throw new Error(`Call budget exhausted (${this.used}/${this.cap})`);
    this.used += n;
  }
}

async function api(path: string, budget: CallBudget, init?: RequestInit): Promise<Record<string, unknown>> {
  budget.spend();
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...(init?.headers as Record<string, string>) } });
  const text = await res.text();
  if (!res.ok) {
    // Guide §3.4: the body names the exact problem — surface it, always.
    throw new Error(`LinkedIn API ${res.status} on ${path.split('?')[0]}: ${text.slice(0, 400)}`);
  }
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`LinkedIn API returned non-JSON on ${path.split('?')[0]}`); }
}

// Tolerant getters over the common field aliases.
const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return null;
};

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sep 2014" from Fresh's start_year/start_month numeric pair. */
function ym(year: unknown, month: unknown): string | null {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900) return null;
  const m = Number(month);
  return m >= 1 && m <= 12 ? `${MONTH_ABBR[m]} ${y}` : String(y);
}

function normalizeExperiences(raw: unknown): LinkedInExperience[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkedInExperience[] = [];
  for (const e of raw as Array<Record<string, unknown>>) {
    const org = str(pick(e, 'company', 'company_name', 'companyName', 'org'));
    if (!org) continue;
    // Live shape (smoke-verified 2026-09-09): start_year/start_month,
    // end_year/end_month numerics + a boolean is_current + a date_range string.
    // String-date aliases kept as fallbacks for shape drift.
    const started = ym(e.start_year, e.start_month)
      ?? str(pick(e, 'start_date', 'starts_at', 'startDate', 'date_range'));
    const ended = ym(e.end_year, e.end_month)
      ?? str(pick(e, 'end_date', 'ends_at', 'endDate'));
    const isCurrent = typeof e.is_current === 'boolean'
      ? e.is_current
      : !ended || /present/i.test(ended);
    out.push({
      org,
      title: str(pick(e, 'title', 'position', 'job_title')),
      started,
      ended,
      isCurrent,
    });
  }
  return out.slice(0, 20);
}

/** One full profile via /enrich-lead (~2 credits). Only base fields — extra
 *  options (skills, certifications) cost extra credits and nothing stores them. */
export async function enrichProfile(linkedinUrl: string, budget: CallBudget): Promise<LinkedInProfile> {
  const url = canonicalLinkedInUrl(linkedinUrl);
  if (!url) throw new Error(`Not a LinkedIn profile URL: ${linkedinUrl}`);
  const body = await api(`/enrich-lead?linkedin_url=${encodeURIComponent(url)}`, budget);
  const d = (body.data ?? body) as Record<string, unknown>;

  const experiences = normalizeExperiences(pick(d, 'experiences', 'experience', 'positions'));
  const current = experiences.find(e => e.isCurrent) ?? null;
  return {
    url,
    name: str(pick(d, 'full_name', 'name', 'fullName')),
    headline: str(pick(d, 'headline', 'sub_title', 'occupation')),
    location: str(pick(d, 'location', 'city', 'geo_location', 'location_name')),
    summary: str(pick(d, 'about', 'summary')),
    currentTitle: str(pick(d, 'job_title', 'current_title')) ?? current?.title ?? null,
    currentOrg: str(pick(d, 'company', 'company_name', 'current_company')) ?? current?.org ?? null,
    experiences,
  };
}

export interface EmployeeHit {
  url: string;
  name: string | null;
  headline: string | null;
  title: string | null;
  location: string | null;
}

/**
 * Current employees at a company — the async search flow (guide §3.2):
 * POST /search-employees → poll /check-search-status → page /get-search-results.
 * `maxResults` caps how many people we keep; `budget` caps total calls, and the
 * poll loop has its own ceiling so a stuck search can't spin forever.
 */
export async function searchEmployees(
  company: string,
  opts: { geo?: string; maxResults?: number; budget: CallBudget },
): Promise<EmployeeHit[]> {
  const { budget, maxResults = 10 } = opts;
  const started = await api('/search-employees', budget, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: company,
      ...(opts.geo ? { geo_codes_include: undefined, location: opts.geo } : {}),
      limit: Math.min(50, maxResults * 3), // over-fetch a little; we filter by title locally
    }),
  });
  const requestId = String(pick(started, 'request_id', 'requestId') ?? '');
  if (!requestId) throw new Error(`search-employees returned no request_id: ${JSON.stringify(started).slice(0, 300)}`);

  // Poll — bounded. A quarterly on-demand run can afford patience but not forever.
  let status = '';
  for (let i = 0; i < 14; i++) {
    await new Promise(r => setTimeout(r, i < 4 ? 6000 : 12000));
    const s = await api(`/check-search-status?request_id=${encodeURIComponent(requestId)}`, budget);
    status = String(pick(s, 'status') ?? '');
    if (/done|complete/i.test(status)) break;
    if (/fail|error/i.test(status)) throw new Error(`search failed for "${company}": ${status}`);
  }
  if (!/done|complete/i.test(status)) throw new Error(`search for "${company}" timed out (last status: ${status || 'unknown'})`);

  const hits: EmployeeHit[] = [];
  for (let page = 1; page <= 3 && hits.length < maxResults * 3; page++) {
    const res = await api(`/get-search-results?request_id=${encodeURIComponent(requestId)}&page=${page}`, budget);
    const batch = (res.data ?? res.results ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const p of batch) {
      const url = canonicalLinkedInUrl(String(pick(p, 'linkedin_url', 'profile_url', 'url') ?? ''));
      if (!url) continue;
      hits.push({
        url,
        name: str(pick(p, 'full_name', 'name', 'fullName')),
        headline: str(pick(p, 'headline', 'sub_title')),
        title: str(pick(p, 'job_title', 'title', 'position')),
        location: str(pick(p, 'location', 'city', 'location_name')),
      });
    }
  }
  return hits;
}
