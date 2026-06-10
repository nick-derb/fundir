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
import { getSegment } from '@/lib/config/loader';

export const maxDuration = 300; // 5 minutes — bounded by Vercel Pro limit
export const dynamic     = 'force-dynamic';

// Phase 1C: profiles and the per-org dispatch list both come from the DB.
// No hardcoded org code, no hardcoded keyword list. The selection rule is:
//   - all orgs whose region_id + segment_id are set
//   - for each, iterate the first N keyword_profiles in their segment
// Adding a new tenant in a new region = one org row insert.
interface OrgRow { id: string; org_code: string; segment_id: string | null; }

// Per-cron-invocation cap on keyword profiles per org (the per-profile
// limit and rows-per-profile come from the segment config). Sized so that
// orgs * profiles * ~8 grants fits within maxDuration.
const PROFILES_PER_ORG_PER_RUN = 6;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;                     // no fail-open
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function getCronOrgs(): Promise<OrgRow[]> {
  // All orgs pinned to a region + segment are eligible for the nightly
  // refresh. runDiscovery is already org-scoped per call, so adding a new
  // tenant is purely a data operation — no code edit.
  const db = createServerClient();
  const { data } = await db
    .from('organizations')
    .select('id, org_code, segment_id')
    .not('region_id', 'is', null)
    .not('segment_id', 'is', null);
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
  // and OpenAI don't bite. The keyword profiles per org come from the
  // segment row's peer_rules.keyword_profiles — no code constant.
  for (const org of orgs) {
    const segment = org.segment_id ? await getSegment(org.segment_id) : null;
    const profiles = (segment?.peer_rules?.keyword_profiles ?? [])
      .slice(0, PROFILES_PER_ORG_PER_RUN);

    if (profiles.length === 0) {
      summary.push({
        org_code:      org.org_code,
        profile:       '(no keyword profiles in segment)',
        discovered: 0, newGrants: 0, highMatches: 0, mediumMatches: 0,
        errors: ['segment has no peer_rules.keyword_profiles configured'],
      });
      continue;
    }

    for (const profile of profiles) {
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
