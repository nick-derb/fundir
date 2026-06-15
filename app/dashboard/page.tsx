export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { GrantTable } from '@/components/grant-table';
import { OrgLogo } from '@/components/org-logo';
import { MatchResult } from '@/types';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Target, AlertTriangle, ArrowUpRight, DollarSign,
  Activity, Flame, Sparkles,
} from 'lucide-react';
import { GrantCard } from '@/components/ui/grant-card';
import { RecommendationGroup } from '@/components/ui/recommendation-group';
import { ConcentrationPanel } from '@/components/concentration-panel';
import { loadLatestConcentration } from '@/lib/discovery/concentration';

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
    supabase
      .from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .eq('org_id', orgId)
      .order('composite_score', { ascending: false })
      .limit(100),
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

        {/* ── Brand-new org: hero empty state instead of a deflating page of zeros ── */}
        {data.totalTracked === 0 && (
          <div className="rounded-2xl border overflow-hidden relative"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1a2236 60%, #0f172a 100%)',
              borderColor: 'var(--card-border)',
            }}>
            <div className="absolute inset-0 opacity-[0.05]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
            <div className="absolute top-0 right-1/4 w-96 h-48 rounded-full opacity-20 blur-3xl"
              style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />
            <div className="relative px-6 md:px-10 py-10 md:py-14 max-w-3xl">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-[#0d9488]" />
                <span className="text-[11px] font-bold text-[#0d9488] uppercase tracking-widest">Welcome to Fundir</span>
              </div>
              <h2 className="text-[24px] md:text-[32px] font-bold text-white leading-tight mb-3">
                Let&apos;s find your first matching grants
              </h2>
              <p className="text-[14px] text-[#94a3b8] leading-relaxed mb-6 max-w-xl">
                Run discovery once and Fundir will surface federal and foundation grants
                matched to {data.org?.name ?? ctx.orgName}&apos;s mission, programs, and
                financial profile — scored, ranked, and reverse-screened against your 990.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link href="/discover"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[13px] font-bold text-white transition-all hover:opacity-95"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Run your first discovery
                </Link>
                <Link href="/settings"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-[8px] text-[13px] font-semibold text-white/80 border border-white/15 hover:bg-white/5 transition-colors">
                  Sync 990 financials
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-4">
            {/* Org logo — auto-fetched from ProPublica EIN → Clearbit */}
            {data.logoUrl && <OrgLogo src={data.logoUrl} alt={ctx.orgName} />}
            <div>
              <p className="text-[12px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{today}</p>
              <h1 className="text-[22px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                {data.org?.name ?? ctx.orgName}
              </h1>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {data.totalTracked} grants tracked · {data.pipelineActive} in pipeline · {data.urgentGrants.length} urgent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/discover"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] text-[13px] font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
              <Sparkles className="w-3.5 h-3.5" />
              Run Discovery
            </Link>
            <Link href="/pipeline"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] text-[13px] font-semibold border transition-all hover:opacity-80"
              style={{
                background:   'var(--sec-btn-bg)',
                borderColor:  'var(--sec-btn-border)',
                color:        'var(--sec-btn-text)',
              }}>
              Open Tracker
            </Link>
          </div>
        </div>

        {/* ── KPI row ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            {
              label: 'Grant Opportunities',
              value: data.totalTracked,
              sub: `${data.highMatches} high-match`,
              icon: Activity,
              color: '#0d9488',
            },
            {
              label: 'Avg Match Score',
              value: `${avgScore}`,
              sub: 'composite score',
              icon: Target,
              color: avgScore >= 60 ? '#16a34a' : avgScore >= 40 ? '#d97706' : '#dc2626',
            },
            {
              label: 'Award Potential',
              value: formatCompact(data.totalAwardPotential),
              sub: 'score ≥ 60 grants',
              icon: DollarSign,
              color: '#6366f1',
            },
            {
              label: 'Urgent Deadlines',
              value: data.urgentGrants.length,
              sub: 'closing in ≤ 14 days',
              icon: Flame,
              color: data.urgentGrants.length > 0 ? '#dc2626' : '#16a34a',
            },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label}
              className="rounded-[10px] border p-4"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <div className="w-7 h-7 rounded-[6px] flex items-center justify-center"
                  style={{ background: color + '20' }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
              </div>
              <div className="text-[24px] font-bold leading-none mb-1"
                style={{ color: 'var(--text-primary)' }}>{value}</div>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Funding concentration (Phase 6) ───────────────────── */}
        {/* Surfaces only when there's actual financial data to compute against.
            Without a snapshot the panel renders the small CTA empty-state. */}
        {data.totalTracked > 0 && (
          <ConcentrationPanel snapshot={data.concentration} />
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

        {/* ── Grant table ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>All Grant Matches</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {data.totalTracked} opportunities matched to your profile
              </p>
            </div>
            <Link href="/pipeline" className="flex items-center gap-1.5 text-[13px] text-[#0d9488] hover:underline font-semibold">
              Open pipeline <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data.matches.length === 0 ? (
            <div className="rounded-[10px] border border-dashed p-14 text-center"
              style={{ borderColor: 'var(--empty-border)', background: 'var(--card-bg)' }}>
              <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--rank-color)' }} />
              <p className="text-[14px] font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                No grant matches yet.
              </p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Run your first discovery →
              </Link>
            </div>
          ) : (
            <GrantTable matches={data.matches} />
          )}
        </div>

      </div>
    </AppShell>
  );
}
