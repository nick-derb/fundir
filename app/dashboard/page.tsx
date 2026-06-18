export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { GrantTable } from '@/components/grant-table';
import { OrgLogo } from '@/components/org-logo';
import { MatchResult } from '@/types';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Flame, Sparkles } from 'lucide-react';
import { GrantCard } from '@/components/ui/grant-card';
import { RecommendationGroup } from '@/components/ui/recommendation-group';
import { ConcentrationPanel } from '@/components/concentration-panel';
import { loadLatestConcentration } from '@/lib/discovery/concentration';
import { CraIntelligencePanel } from '@/components/cra-intelligence-panel';
import { loadCraIntelligence } from '@/lib/cra/intelligence';
import { FunderIntelligencePanel } from '@/components/funder-intelligence-panel';
import { loadFunderIntelligence } from '@/lib/funder-intel/repo';
import { loadOrgCraSnapshot } from '@/lib/cra/repo';

// ── Logo auto-fetch via ProPublica EIN → website → Clearbit ──────────────────
async function getOrgLogoUrl(ein?: string | null): Promise<string | null> {
  if (!ein) return null;
  try {
    const einClean = ein.replace(/[-\s]/g, '');
    const res = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${einClean}.json`,
      { next: { revalidate: 604800 }, signal: AbortSignal.timeout(2500) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const website: string | undefined = json.organization?.website;
    if (!website) return null;
    const href = website.startsWith('http') ? website : `https://${website}`;
    const domain = new URL(href).hostname.replace(/^www\./, '');
    return `https://logo.clearbit.com/${domain}`;
  } catch {
    return null;
  }
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function getDashboardData(orgId: string, orgCode: string) {
  const supabase = createServerClient();
  const [matchesRes, opportunitiesRes, orgRes] = await Promise.all([
    // Fetch every match. The previous .limit(100) cap distorted the
    // triage counts: when CYC had 197 matches, the top-100-by-score slice
    // hid ~95% of the Skip bucket and reported it as "3" instead of the
    // real ~140. PostgREST's default ceiling is 1000 which comfortably
    // covers a single org's match set; if any tenant exceeds that we
    // switch to a paginated fetch.
    supabase
      .from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .eq('org_id', orgId)
      .order('composite_score', { ascending: false }),
    supabase
      .from('grant_opportunities')
      .select('id, close_date, status')
      .eq('status', 'posted'),
    supabase
      .from('organizations')
      .select('name, ein, financial_data, financial_year, financial_fetched_at')
      .eq('org_code', orgCode)
      .single(),
  ]);

  const matches       = (matchesRes.data || []) as MatchResult[];
  const opportunities = opportunitiesRes.data || [];
  const org           = orgRes.data;
  const now           = new Date();

  const upcoming = opportunities.filter(o => {
    if (!o.close_date) return false;
    const d = Math.ceil((new Date(o.close_date).getTime() - now.getTime()) / 86400000);
    return d >= 0 && d <= 30;
  });

  const urgent = matches.filter(m => {
    if (!m.grant?.close_date) return false;
    const d = Math.ceil((new Date(m.grant.close_date).getTime() - now.getTime()) / 86400000);
    return d >= 0 && d <= 14;
  });

  const totalAwardPotential = matches
    .filter(m => m.composite_score >= 60)
    .reduce((sum, m) => sum + (m.grant?.extracted_fields?.award_ceiling || m.grant?.extracted_fields?.award_floor || 0), 0);

  const pipelineActive = matches.filter(m =>
    ['reviewing', 'preparing', 'drafting'].includes(m.pipeline_stage)
  ).length;

  const logoUrl = await getOrgLogoUrl(org?.ein);
  // Phase 6: latest funding-concentration snapshot. Null until the user
  // runs /api/admin/compute-concentration once; ConcentrationPanel
  // renders the empty-state CTA in that case.
  const concentration = await loadLatestConcentration(orgId);

  // Phase 7 / Workstream A: CRA bank intelligence — the prospect list
  // ranked by relationship + peer-funding signal. craSnapshot carries
  // the tract's community label for the panel's empty-state copy.
  // Phase 7 / Workstream B8: funder-intelligence panel — ranked prospect
  // funders with cited briefs. Empty until B2 ingest + B5 scoring runs.
  const [craRows, craSnapshot, funderIntelRows] = await Promise.all([
    loadCraIntelligence(orgId),
    loadOrgCraSnapshot(orgId),
    loadFunderIntelligence(orgId, 30),
  ]);

  // Win-triage buckets — pursue/maybe/skip per DESIGN_SYSTEM.md §2.9.
  // Thresholds match the rest of the matcher (≥70 pursue, ≥50 maybe).
  const pursue = matches.filter(m => m.composite_score >= 70);
  const maybe  = matches.filter(m => m.composite_score >= 50 && m.composite_score < 70);
  const skip   = matches.filter(m => m.composite_score < 50);

  return {
    matches,
    totalTracked:      matches.length,
    highMatches:       pursue.length,
    upcomingDeadlines: upcoming.length,
    urgentGrants:      urgent.sort((a, b) => {
      const da = new Date(a.grant?.close_date || '9999').getTime();
      const db = new Date(b.grant?.close_date || '9999').getTime();
      return da - db;
    }),
    totalAwardPotential,
    pipelineActive,
    triagePursue: pursue.slice(0, 5),
    triageMaybe:  maybe.slice(0, 5),
    triageSkip:   skip.slice(0, 8),
    triageCounts: { pursue: pursue.length, maybe: maybe.length, skip: skip.length },
    org,
    logoUrl,
    concentration,
    craRows,
    craCommunity: craSnapshot?.community ?? null,
    funderIntelRows,
  };
}

function formatGrantCardEyebrow(match: MatchResult): string {
  const award = match.grant?.extracted_fields?.award_ceiling || match.grant?.extracted_fields?.award_floor;
  const parts: string[] = [];
  if (award) parts.push(`Up to ${formatCompactPublic(award)}`);
  if (match.grant?.agency_code) parts.push(match.grant.agency_code);
  if (match.grant?.aln_codes?.length) parts.push(`ALN ${match.grant.aln_codes[0]}`);
  return parts.join(' · ');
}

/**
 * Single-line rationale for the GrantCard inline slot. Strips the
 * "Best program fit: X." prefix (already surfaced as matchedProgram on
 * the score badge) and trims the trailing planning verb that's generic
 * ("Recommend immediate eligibility review and application planning.").
 * Caps at ~180 chars so the card stays compact.
 */
function buildRationale(match: MatchResult): string | undefined {
  const r = match.recommendation;
  if (!r) return undefined;
  // Strip leading "Best program fit: <name>. " prefix.
  const stripped = r.replace(/^Best program fit:[^.]+\.\s*/i, '');
  // Strip trailing generic planning advice; the body of the rationale is
  // the interesting part.
  const trimmed = stripped
    .replace(/\s*Recommend [^.]+\.\s*$/i, '')
    .replace(/\s*Verify full eligibility[^.]+\.\s*$/i, '');
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
}

function formatCompactPublic(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(close: string | null | undefined): number | null {
  if (!close) return null;
  const ms = new Date(close).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86400000);
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const data = await getDashboardData(ctx.orgId, ctx.orgCode);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const avgScore = data.matches.length
    ? Math.round(data.matches.reduce((s, m) => s + m.composite_score, 0) / data.matches.length)
    : 0;

  const STAGES = [
    { stage: 'discovered', label: 'Discovered', color: '#94a3b8' },
    { stage: 'reviewing',  label: 'Reviewing',  color: '#2563eb' },
    { stage: 'preparing',  label: 'Preparing',  color: '#7c3aed' },
    { stage: 'drafting',   label: 'Drafting',   color: '#d97706' },
    { stage: 'submitted',  label: 'Submitted',  color: '#16a34a' },
  ];

  return (
    <AppShell
      orgName={ctx.orgName}
      orgId={ctx.orgId}
      userEmail={ctx.email}
      isAdmin={ctx.isAdmin}
      availableOrgs={ctx.availableOrgs}
      currentOrgCode={ctx.orgCode}
    >
      <div className="px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto space-y-5">

        {/* ── Brand-new org: light hero empty-state ─────────────────── */}
        {data.totalTracked === 0 && (
          <div className="bg-canvas-1 rounded-lg shadow-flat px-6 md:px-10 py-10 md:py-12 max-w-3xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-action-soft text-action">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-eyebrow font-semibold text-action uppercase tracking-wider">Welcome to Fundir</span>
            </div>
            <h2 className="text-display font-semibold text-ink-0 leading-tight mb-3">
              Let&apos;s find your first matching grants
            </h2>
            <p className="text-body text-ink-1 leading-relaxed mb-6 max-w-xl">
              Run discovery once and Fundir will surface federal and foundation grants
              matched to {data.org?.name ?? ctx.orgName}&apos;s mission, programs, and
              financial profile — scored, ranked, and reverse-screened against your 990.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/discover"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-body font-semibold bg-action text-canvas-1 hover:bg-action-hover transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
                Run your first discovery
              </Link>
              <Link href="/settings"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-body font-semibold text-ink-0 ring-1 ring-canvas-3 hover:bg-canvas-2 transition-colors">
                Sync 990 financials
              </Link>
            </div>
          </div>
        )}

        {/* ── Page header + inline KPI strip ──────────────────────── */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-4">
              {data.logoUrl && <OrgLogo src={data.logoUrl} alt={ctx.orgName} />}
              <div>
                <p className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{today}</p>
                <h1 className="text-h1 font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {data.org?.name ?? ctx.orgName}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/discover"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-body font-semibold bg-action text-canvas-1 hover:bg-action-hover transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
                Run discovery
              </Link>
              <Link href="/pipeline"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-body font-semibold ring-1 ring-canvas-3 hover:bg-canvas-2 transition-colors"
                style={{ color: 'var(--text-primary)' }}>
                Open pipeline
              </Link>
            </div>
          </div>

          {/* Inline KPI strip — four numbers, label:value rhythm, no boxes */}
          {data.totalTracked > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 mt-4 text-caption" style={{ color: 'var(--text-secondary)' }}>
              <span>
                Tracked
                <strong className="text-h2 font-semibold tabular-nums ml-1" style={{ color: 'var(--text-primary)' }}>
                  {data.totalTracked}
                </strong>
                <span className="text-eyebrow ml-1">· {data.highMatches} high</span>
              </span>
              <span>
                Avg score
                <strong className={`text-h2 font-semibold tabular-nums ml-1 ${
                    avgScore >= 60 ? 'text-signal-pursue'
                  : avgScore >= 40 ? 'text-signal-maybe'
                                   : 'text-signal-skip'
                }`}>
                  {avgScore}
                </strong>
              </span>
              <span>
                Potential
                <strong className="text-h2 font-semibold tabular-nums ml-1" style={{ color: 'var(--text-primary)' }}>
                  {formatCompact(data.totalAwardPotential)}
                </strong>
              </span>
              <span>
                Urgent
                <strong className={`text-h2 font-semibold tabular-nums ml-1 ${data.urgentGrants.length > 0 ? 'text-signal-skip' : ''}`}
                  style={data.urgentGrants.length > 0 ? undefined : { color: 'var(--text-primary)' }}>
                  {data.urgentGrants.length}
                </strong>
                <span className="text-eyebrow ml-1">· ≤ 14d</span>
              </span>
            </div>
          )}
        </div>

        {/* ── Funding concentration (Phase 6) ───────────────────── */}
        {/* Surfaces only when there's actual financial data to compute against.
            Without a snapshot the panel renders the small CTA empty-state. */}
        {data.totalTracked > 0 && (
          <ConcentrationPanel snapshot={data.concentration} />
        )}

        {/* ── CRA bank intelligence (Phase 7 / Workstream A) ────── */}
        {/* The differentiator panel. Banks whose CRA assessment area covers
            the org's primary tract, ranked by relationship + peer-funding
            signal. Existing → Deepen; Prospect+peer → Open (warm); cold
            prospects → Monitor. Hidden when the org has no tract or no
            covering banks. */}
        {data.craRows.length > 0 && (
          <CraIntelligencePanel rows={data.craRows} community={data.craCommunity} />
        )}

        {/* ── Funder intelligence (Phase 7 / Workstream B8) ─────── */}
        {/* Ranked prospect funders backing peers like this org. Each row
            expands to a Claude-generated brief citing real grants_made
            rows. Empty until B2 (990 ingest) + B5 (scorer) + B6 (brief
            generator) run. */}
        {data.funderIntelRows.length > 0 && (
          <FunderIntelligencePanel
            rows={data.funderIntelRows}
            org_name={data.org?.name ?? ctx.orgName}
          />
        )}

        {/* ── Main content row ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Top opportunities (2/3 on desktop, full-width on mobile) */}
          <div className="lg:col-span-2 rounded-[10px] border overflow-hidden"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className="px-5 py-3.5 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--row-divider)' }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#0d9488]" />
                <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Top Opportunities</h2>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>by match score</span>
              </div>
              <Link href="/discover" className="text-[12px] text-[#0d9488] font-medium hover:underline flex items-center gap-1">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Win-triage primitive — Pursue/Maybe/Skip sections via the
                design-system <RecommendationGroup>. The Skip section is a
                feature: saying no is the value the directories can't deliver
                (DESIGN_SYSTEM.md §2.9). */}
            <div className="px-5 py-5">
              {data.totalTracked === 0 ? (
                <div className="text-center text-[12px] text-[var(--text-tertiary)] py-6">
                  No matches yet. Run discovery from <Link href="/discover" className="text-[#0d9488] hover:underline">/discover</Link>.
                </div>
              ) : (
                <RecommendationGroup
                  pursue={{
                    count: data.triageCounts.pursue,
                    children: data.triagePursue.map(m => (
                      <GrantCard
                        key={m.id}
                        href={`/grant/${m.grant_id}`}
                        title={m.grant?.title ?? '—'}
                        funder={m.grant?.agency_name ?? ''}
                        eyebrow={formatGrantCardEyebrow(m)}
                        score={m.composite_score}
                        recommendation="pursue"
                        rationale={buildRationale(m)}
                        deadlineDays={daysUntil(m.grant?.close_date)}
                        deadlineDate={m.grant?.close_date}
                      />
                    )),
                  }}
                  maybe={{
                    count: data.triageCounts.maybe,
                    children: data.triageMaybe.map(m => (
                      <GrantCard
                        key={m.id}
                        href={`/grant/${m.grant_id}`}
                        title={m.grant?.title ?? '—'}
                        funder={m.grant?.agency_name ?? ''}
                        eyebrow={formatGrantCardEyebrow(m)}
                        score={m.composite_score}
                        recommendation="maybe"
                        rationale={buildRationale(m)}
                        deadlineDays={daysUntil(m.grant?.close_date)}
                        deadlineDate={m.grant?.close_date}
                      />
                    )),
                  }}
                  skip={{
                    count: data.triageCounts.skip,
                    children: data.triageSkip.map(m => (
                      <GrantCard
                        key={m.id}
                        href={`/grant/${m.grant_id}`}
                        title={m.grant?.title ?? '—'}
                        funder={m.grant?.agency_name ?? ''}
                        eyebrow={formatGrantCardEyebrow(m)}
                        score={m.composite_score}
                        recommendation="skip"
                        rationale={buildRationale(m)}
                        reason={m.recommendation ?? undefined}
                        deadlineDays={daysUntil(m.grant?.close_date)}
                        deadlineDate={m.grant?.close_date}
                      />
                    )),
                  }}
                />
              )}
            </div>

            {/* Pipeline distribution */}
            {data.totalTracked > 0 && (
              <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--row-divider)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--text-tertiary)' }}>Pipeline</p>
                <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-2">
                  {STAGES.map(({ stage, color }) => {
                    const count = data.matches.filter(m => m.pipeline_stage === stage).length;
                    const pct = (count / data.totalTracked) * 100;
                    return pct > 0 ? (
                      <div key={stage} className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    ) : null;
                  })}
                </div>
                <div className="flex flex-wrap gap-3">
                  {STAGES.map(({ stage, label, color }) => {
                    const count = data.matches.filter(m => m.pipeline_stage === stage).length;
                    return count > 0 ? (
                      <div key={stage} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {label} <strong style={{ color: 'var(--text-primary)' }}>{count}</strong>
                        </span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Urgent deadlines (1/3) */}
          <div className="rounded-[10px] border overflow-hidden flex flex-col"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <div className="px-4 py-3.5 border-b flex items-center gap-2"
              style={{ borderColor: 'var(--row-divider)' }}>
              <Flame className={`w-3.5 h-3.5 ${data.urgentGrants.length > 0 ? 'text-red-500' : ''}`}
                style={{ color: data.urgentGrants.length === 0 ? 'var(--text-tertiary)' : undefined }} />
              <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Urgent Deadlines</h2>
              {data.urgentGrants.length > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100">
                  {data.urgentGrants.length}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto theme-divide">
              {data.urgentGrants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
                  <p className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>No urgent deadlines</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    All grants have &gt; 14 days remaining
                  </p>
                </div>
              ) : (
                data.urgentGrants.map(match => {
                  const days = Math.ceil(
                    (new Date(match.grant!.close_date!).getTime() - Date.now()) / 86400000
                  );
                  return (
                    <Link key={match.id} href={`/grant/${match.grant_id}`}>
                      <div className="row-urgent-hover px-4 py-3 group">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[12px] font-semibold line-clamp-2 group-hover:text-red-500 transition-colors leading-snug"
                            style={{ color: 'var(--text-primary)' }}>
                            {match.grant?.title}
                          </p>
                          <span
                            className="text-eyebrow font-semibold tabular-nums px-2 py-0.5 rounded-sm border shrink-0"
                            style={
                              days <= 7
                                ? { background: '#F4E3E5', color: '#7A1E2E', borderColor: '#E7C4C9' }
                              : days <= 14
                                ? { background: '#FBF1DC', color: '#9A6B00', borderColor: '#EBD9B0' }
                                : { background: '#F2F1EC', color: '#3A3D44', borderColor: '#E5E4DE' }
                            }>
                            {days}d
                          </span>
                        </div>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {match.grant?.agency_name}
                        </p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--row-divider)' }}>
              <Link href="/discover" className="flex items-center justify-center gap-1 text-[12px] font-semibold text-[#0d9488] hover:underline">
                View all deadlines <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Full match list — demoted behind a disclosure ─────────
            The triage groups above already surface the top picks per
            bucket. The full table is still here for users who want to
            scan everything, but it no longer competes for attention. */}
        {data.matches.length === 0 ? (
          <div className="rounded-lg ring-1 ring-dashed ring-canvas-3 p-12 text-center bg-canvas-1">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-ink-3" />
            <p className="text-body font-medium mb-4 text-ink-1">No grant matches yet.</p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-body font-semibold bg-action text-canvas-1 hover:bg-action-hover transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run your first discovery
            </Link>
          </div>
        ) : (
          <details className="group bg-canvas-1 rounded-lg shadow-flat">
            <summary className="flex items-center justify-between gap-2 px-5 py-3.5 cursor-pointer list-none">
              <div>
                <h2 className="text-h2 font-semibold" style={{ color: 'var(--text-primary)' }}>All matches</h2>
                <p className="text-caption mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {data.totalTracked} opportunities · click to expand the full table
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 transition-transform group-open:rotate-90 text-ink-2" />
            </summary>
            <div className="border-t border-canvas-3">
              <GrantTable matches={data.matches} />
            </div>
          </details>
        )}

      </div>
    </AppShell>
  );
}
