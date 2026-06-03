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
  ChevronRight, Activity, Flame, Sparkles,
} from 'lucide-react';

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

  return {
    matches,
    totalTracked:      matches.length,
    highMatches:       matches.filter(m => m.composite_score >= 70).length,
    upcomingDeadlines: upcoming.length,
    urgentGrants:      urgent.sort((a, b) => {
      const da = new Date(a.grant?.close_date || '9999').getTime();
      const db = new Date(b.grant?.close_date || '9999').getTime();
      return da - db;
    }),
    totalAwardPotential,
    pipelineActive,
    topGrants: matches.slice(0, 5),
    org,
    logoUrl,
  };
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function ScoreArc({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const r = 14, cx = 16, cy = 16, circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative flex-shrink-0 w-8 h-8">
      <svg width="32" height="32" viewBox="0 0 32 32" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--score-track)" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function DaysChip({ days }: { days: number }) {
  const color = days <= 7
    ? { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
    : days <= 14
    ? { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }
    : { bg: '#fffbeb', text: '#d97706', border: '#fde68a' };
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
      style={{ background: color.bg, color: color.text, borderColor: color.border }}>
      {days}d
    </span>
  );
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

            <div className="theme-divide">
              {data.topGrants.map((match, i) => {
                const award = match.grant?.extracted_fields?.award_ceiling || match.grant?.extracted_fields?.award_floor;
                const days  = match.grant?.close_date
                  ? Math.ceil((new Date(match.grant.close_date).getTime() - Date.now()) / 86400000)
                  : null;
                return (
                  <Link key={match.id} href={`/grant/${match.grant_id}`}>
                    <div className="row-hover flex items-center gap-3 px-5 py-3 group">
                      <span className="text-[11px] font-bold w-4 flex-shrink-0"
                        style={{ color: 'var(--rank-color)' }}>#{i + 1}</span>
                      <ScoreArc score={match.composite_score} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate group-hover:text-[#0d9488] transition-colors"
                          style={{ color: 'var(--text-primary)' }}>
                          {match.grant?.title}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {match.grant?.agency_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {award && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded border"
                            style={{
                              background: 'var(--badge-bg)',
                              color: 'var(--badge-text)',
                              borderColor: 'var(--badge-border)',
                            }}>
                            {formatCompact(award)}
                          </span>
                        )}
                        {days !== null && days >= 0 && days <= 30 && <DaysChip days={days} />}
                        <ChevronRight className="w-3.5 h-3.5 text-[#0d9488] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </Link>
                );
              })}
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
                          <DaysChip days={days} />
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
