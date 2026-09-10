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

// Shared text/identity helpers — one implementation for the whole graph.
import { fixMojibake, canonicalLinkedInUrl } from '@/lib/network/normalize';
export { canonicalLinkedInUrl } from '@/lib/network/normalize';

export function isLinkedInConfigured(): boolean {
  return !!process.env.RAPIDAPI_KEY;
}

function headers(): Record<string, string> {
  return {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
    'x-rapidapi-host': HOST,
  };
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

export interface LinkedInEducation {
  school: string;
  degree: string | null;
  field: string | null;
  startYear: number | null;
  endYear: number | null;
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
  /** Schools — the shared_university signal. Present in the base enrich response (no extra credits). */
  educations: LinkedInEducation[];
}

const yr = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null; };

function normalizeEducations(raw: unknown): LinkedInEducation[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkedInEducation[] = [];
  for (const e of raw as Array<Record<string, unknown>>) {
    const school = str(pick(e, 'school', 'school_name', 'name', 'institution'));
    if (!school) continue;
    out.push({
      school,
      degree: str(pick(e, 'degree', 'degree_name')),
      field: str(pick(e, 'field_of_study', 'field', 'major')),
      startYear: yr(pick(e, 'start_year', 'starts_at_year')),
      endYear: yr(pick(e, 'end_year', 'ends_at_year')),
    });
  }
  return out.slice(0, 10);
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
    educations: normalizeEducations(pick(d, 'educations', 'education', 'schools')),
  };
}

/** Numeric years from a normalized experience ("Sep 2014" → 2014). */
export function experienceYears(e: LinkedInExperience): { startYear: number | null; endYear: number | null } {
  const y = (s: string | null) => { const m = (s ?? '').match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };
  return { startYear: y(e.started), endYear: e.isCurrent ? null : y(e.ended) };
}

export interface EmployeeHit {
  url: string;
  name: string | null;
  headline: string | null;
  title: string | null;
  location: string | null;
}

export interface CompanyMatch {
  companyId: string;
  name: string;
  linkedinUrl: string | null;
  domain: string | null;
  hqCity: string | null;
  employeeCount: number | null;
}

/** Poll an async search until done (bounded). Returns the final status string. */
async function pollSearch(statusPath: string, budget: CallBudget, maxPolls = 14): Promise<string> {
  let status = '';
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, i < 4 ? 6000 : 12000));
    const s = await api(statusPath, budget);
    status = String(pick(s, 'status') ?? '');
    if (/done|complete/i.test(status)) return status;
    if (/fail|error/i.test(status)) throw new Error(`search failed: ${status}`);
  }
  throw new Error(`search timed out (last status: ${status || 'unknown'})`);
}

/**
 * Resolve an employer name to its LinkedIn company id via the async
 * /search-companies flow (verified live 2026-09-09: results carry company_id,
 * company_name, linkedin_url, domain, hq_city, employee_count). Picks the
 * result whose normalized name matches the query; returns null rather than
 * guessing when nothing matches. ~3 calls. Callers memoize the answer.
 */
export async function resolveCompany(name: string, budget: CallBudget): Promise<CompanyMatch | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[.,'’"()]/g, '').replace(/\b(inc|llc|llp|lp|ltd|corp|corporation|company|co)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const want = norm(name);
  const started = await api('/search-companies', budget, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: name, limit: 5 }),
  });
  const requestId = String(pick(started, 'request_id') ?? '');
  if (!requestId) throw new Error(`search-companies returned no request_id: ${JSON.stringify(started).slice(0, 200)}`);
  await pollSearch(`/check-search-companies-status?request_id=${encodeURIComponent(requestId)}`, budget, 8);
  const res = await api(`/get-search-companies-results?request_id=${encodeURIComponent(requestId)}&page=1`, budget);
  const rows = (res.data ?? []) as Array<Record<string, unknown>>;
  const scored = rows.map(r => {
    const cname = str(pick(r, 'company_name', 'name')) ?? '';
    const n = norm(cname);
    const exact = n === want, starts = n.startsWith(want) || want.startsWith(n), contains = n.includes(want) || want.includes(n);
    return { r, cname, score: exact ? 3 : starts ? 2 : contains ? 1 : 0 };
  }).filter(x => x.score > 0).sort((a, b) => {
    // Same name quality → prefer the Illinois/Chicago-headquartered entity
    // (a Chicago board's employers are local; "Rivers Casino" is not Pittsburgh's),
    // then the larger company.
    const il = (r: Record<string, unknown>) => /chicago|illinois|\bil\b/i.test(`${r.hq_city ?? ''} ${r.hq_region ?? ''} ${r.hq_full_address ?? ''}`) ? 1 : 0;
    return b.score - a.score || il(b.r) - il(a.r) || (Number(b.r.employee_count) || 0) - (Number(a.r.employee_count) || 0);
  });
  const best = scored[0];
  if (!best) return null;
  const id = str(pick(best.r, 'company_id', 'id'));
  if (!id) return null;
  return {
    companyId: id, name: best.cname,
    linkedinUrl: str(pick(best.r, 'linkedin_url')),
    domain: str(pick(best.r, 'domain', 'website')),
    hqCity: str(pick(best.r, 'hq_city')),
    employeeCount: Number(best.r.employee_count) || null,
  };
}

/**
 * Current employees of ONE resolved company — the async search flow, verified
 * live 2026-09-09: POST /search-employees {current_company_ids:[id], limit}
 * → request_id → poll /check-search-status → page /get-search-results.
 * Title/geo filtering is done locally (scoring), not in the API, so a wrong
 * filter code can never silently empty a scan. maxResults caps what we keep;
 * budget caps calls; the poll loop has its own ceiling.
 */
export async function searchEmployees(
  company: CompanyMatch,
  opts: { maxResults?: number; budget: CallBudget; keywords?: string; pastCompany?: boolean },
): Promise<EmployeeHit[]> {
  const { budget, maxResults = 10 } = opts;
  const ids = [Number(company.companyId)];
  const started = await api('/search-employees', budget, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      geo_codes: [], geo_codes_exclude: [],
      title_keywords: [], title_keywords_exclude: [],
      // `pastCompany` finds people who USED to work there (retired board members).
      current_company_ids: opts.pastCompany ? [] : ids, past_company_ids: opts.pastCompany ? ids : [],
      functions: [], keywords: opts.keywords ?? '', sort_by: 'Recommended',
      limit: Math.min(50, Math.max(10, maxResults * 2)),
    }),
  });
  const requestId = String(pick(started, 'request_id', 'requestId') ?? '');
  if (!requestId) throw new Error(`search-employees returned no request_id: ${JSON.stringify(started).slice(0, 300)}`);
  await pollSearch(`/check-search-status?request_id=${encodeURIComponent(requestId)}`, budget);

  const hits: EmployeeHit[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 3 && hits.length < maxResults * 2; page++) {
    const res = await api(`/get-search-results?request_id=${encodeURIComponent(requestId)}&page=${page}`, budget);
    const batch = (res.data ?? res.results ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    let fresh = 0;
    for (const p of batch) {
      const url = canonicalLinkedInUrl(String(pick(p, 'linkedin_url', 'profile_url', 'url') ?? ''));
      if (!url || seen.has(url)) continue;   // pages can repeat profiles — never double-count
      seen.add(url); fresh++;
      hits.push({
        url,
        name: str(pick(p, 'full_name', 'name', 'fullName')),
        headline: str(pick(p, 'headline', 'sub_title')),
        title: str(pick(p, 'job_title', 'title', 'position')),
        location: str(pick(p, 'location', 'city', 'location_name')),
      });
    }
    if (fresh === 0) break;   // the provider is repeating pages
  }
  return hits;
}
