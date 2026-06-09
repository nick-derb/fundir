/**
 * Tier 3G — daily background discovery cron.
 *
 * Today every grant in the corpus arrives because a logged-in user
 * clicked "Run Discovery" on /discover. That makes the system look
 * empty on a fresh dashboard and forces the user to do the polling. This
 * route runs on a Vercel cron daily, runs the same runDiscovery pipeline
 * across the org's full keyword profile, and grows the stored grant
 * corpus so /discover and the natural-language search bar (Tier 2D)
 * always have a fresh, ranked feed against the latest grants.gov state.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron
 * invocations. If CRON_SECRET is set we require it. If unset the route
 * still refuses (no fail-open) — set the env var in Vercel before
 * enabling the schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runDiscovery } from '@/actions/discovery';

export const maxDuration = 300; // 5 minutes — bounded by Vercel Pro limit
export const dynamic     = 'force-dynamic';

// Keyword profiles the cron rotates through. Each runDiscovery call
// processes up to ~8 grants, so 6 profiles per invocation stays well
// within the maxDuration budget. Profiles 7-11 from TARGETED_SEARCHES
// will be added when we want broader coverage; for now this set covers
// the highest-signal CYC-aligned topics.
const CRON_PROFILES = [
  { name: 'Youth Afterschool',   keyword: 'youth afterschool out-of-school time',         rows: 25 },
  { name: 'Early Childhood',     keyword: 'early childhood education Head Start pre-K',   rows: 25 },
  { name: 'Youth Workforce Dev', keyword: 'youth workforce development job training 14-24', rows: 25 },
  { name: '21st CCLC',           keyword: '21st Century Community Learning Centers',      rows: 20 },
  { name: 'Violence Prevention', keyword: 'youth violence prevention community nonprofit Illinois', rows: 20 },
  { name: 'Mentoring',           keyword: 'youth mentoring at-risk young people nonprofit', rows: 20 },
] as const;

interface OrgRow { id: string; org_code: string; }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;                     // no fail-open
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function getCronOrgs(): Promise<OrgRow[]> {
  // Today the cron is wired to the CYC tenant only. To extend to all
  // tenants nightly, broaden this query to `select('id, org_code')`
  // with no `.eq` filter — runDiscovery is already org-scoped per call.
  const db = createServerClient();
  const { data } = await db
    .from('organizations')
    .select('id, org_code')
    .eq('org_code', 'CYC2025')
    .limit(5);
  return (data as OrgRow[]) ?? [];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgs = await getCronOrgs();
  if (orgs.length === 0) {
    return NextResponse.json({ ok: false, message: 'No orgs configured for cron' });
  }

  const startedAt = Date.now();
  const summary: Array<{
    org_code: string;
    profile:  string;
    discovered: number;
    newGrants:  number;
    highMatches: number;
    mediumMatches: number;
    errors: string[];
  }> = [];

  // Sequential per (org, profile) so concurrent rate-limits on Grants.gov
  // and OpenAI don't bite. Bounded by CRON_PROFILES.length * orgs.length
  // and the per-keyword 8-grant cap inside runDiscovery.
  for (const org of orgs) {
    for (const profile of CRON_PROFILES) {
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed > 270) break; // 30s safety margin under maxDuration

      try {
        const result = await runDiscovery(
          { keyword: profile.keyword, rows: profile.rows },
          org.id,
          org.org_code,
        );
        summary.push({
          org_code:      org.org_code,
          profile:       profile.name,
          discovered:    result.discovered,
          newGrants:     result.newGrants,
          highMatches:   result.highMatches,
          mediumMatches: result.mediumMatches,
          errors:        result.errors,
        });
      } catch (err) {
        summary.push({
          org_code:      org.org_code,
          profile:       profile.name,
          discovered: 0, newGrants: 0, highMatches: 0, mediumMatches: 0,
          errors: [err instanceof Error ? err.message : String(err)],
        });
      }
    }
  }

  return NextResponse.json({
    ok:              true,
    duration_sec:    Math.round((Date.now() - startedAt) / 1000),
    orgs_processed:  orgs.length,
    profiles_run:    summary.length,
    total_new:       summary.reduce((s, x) => s + x.newGrants, 0),
    total_discovered: summary.reduce((s, x) => s + x.discovered, 0),
    summary,
  });
}

// Allow GET too so Vercel cron can ping without changing default verb,
// and so a dashboard admin can manually trigger from the browser
// (still gated by the bearer check). Same behavior.
export const GET = POST;
