export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { FederalExposure } from '@/components/federal-exposure';
import { GrantTable } from '@/components/grant-table';
import { FinancialSnapshot } from '@/components/financial-snapshot';
import { MatchResult } from '@/types';
import { ComputedFinancials, Filing990 } from '@/lib/propublica';
import Link from 'next/link';
import {
  Target, AlertTriangle,
  ArrowUpRight, DollarSign, ChevronRight, Activity,
  Flame, Shield, BarChart2, Sparkles,
} from 'lucide-react';

async function getDashboardData() {
  const supabase = createServerClient();
  const [matchesRes, opportunitiesRes, orgRes] = await Promise.all([
    supabase
      .from('match_results')
      .select('*, grant:grant_opportunities(*)')
      .order('composite_score', { ascending: false })
      .limit(100),
    supabase
      .from('grant_opportunities')
      .select('id, close_date, status')
      .eq('status', 'posted'),
    supabase
      .from('organizations')
      .select('name, ein, financial_data, financial_year, financial_fetched_at')
      .eq('org_code', 'CYC2025')
      .single(),
  ]);

  const matches    = (matchesRes.data || []) as MatchResult[];
  const opportunities = opportunitiesRes.data || [];
  const org        = orgRes.data;
  const now        = new Date();

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

  return {
    matches,
    totalTracked: matches.length,
    highMatches:  matches.filter(m => m.composite_score >= 70).length,
    mediumMatches: matches.filter(m => m.composite_score >= 40 && m.composite_score < 70).length,
    upcomingDeadlines: upcoming.length,
    urgentGrants: urgent.sort((a, b) => {
      const da = new Date(a.grant?.close_date || '9999').getTime();
      const db = new Date(b.grant?.close_date || '9999').getTime();
      return da - db;
    }),
    totalAwardPotential,
    pipelineActive,
    topGrants: matches.slice(0, 5),
    org,
  };
}

function getDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function ScoreArc({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const r = 18, cx = 22, cy = 22, circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative flex-shrink-0 w-11 h-11">
      <svg width="44" height="44" viewBox="0 0 44 44" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold" style={{ color }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function DaysChip({ days }: { days: number }) {
  const color = days <= 7 ? { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
              : days <= 14 ? { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }
              : { bg: '#fffbeb', text: '#d97706', border: '#fde68a' };
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
      style={{ background: color.bg, color: color.text, borderColor: color.border }}>
      {days}d
    </span>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const financialData = data.org?.financial_data as {
    computed: ComputedFinancials;
    latest: Filing990;
    history: Filing990[];
  } | null;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const avgScore = data.matches.length
    ? Math.round(data.matches.reduce((s, m) => s + m.composite_score, 0) / data.matches.length)
    : 0;

  return (
    <AppShell>
      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* Teal accent glow */}
        <div className="absolute top-0 right-1/4 w-96 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />

        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[#0d9488] text-[12px] font-semibold tracking-widest uppercase mb-1">{today}</p>
              <h1 className="text-[28px] font-bold text-white leading-tight">
                {getDayGreeting()}, {data.org?.name ?? 'Organization'}
              </h1>
              <p className="text-[#94a3b8] text-[14px] mt-1">
                {data.totalTracked} grants tracked · {data.pipelineActive} active in pipeline · {data.urgentGrants.length} urgent
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/discover"
                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[13px] font-semibold transition-all shadow-sm"
                style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)', color: '#fff' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Run Discovery
              </Link>
              <Link
                href="/pipeline"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-[8px] text-[13px] font-semibold text-white transition-all"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Pipeline
              </Link>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-4 gap-4 mt-7">
            {[
              {
                label: 'Grant Opportunities',
                value: data.totalTracked,
                sub: `${data.highMatches} high-match`,
                icon: Activity,
                accent: '#0d9488',
                bar: (data.highMatches / Math.max(data.totalTracked, 1)) * 100,
              },
              {
                label: 'Match Quality',
                value: `${avgScore}`,
                sub: 'avg composite score',
                icon: Target,
                accent: avgScore >= 60 ? '#16a34a' : avgScore >= 40 ? '#d97706' : '#dc2626',
                bar: avgScore,
              },
              {
                label: 'Award Potential',
                value: formatCompact(data.totalAwardPotential),
                sub: 'score ≥ 60 grants',
                icon: DollarSign,
                accent: '#6366f1',
                bar: Math.min((data.totalAwardPotential / 5_000_000) * 100, 100),
              },
              {
                label: 'Urgent Deadlines',
                value: data.urgentGrants.length,
                sub: 'closing in ≤ 14 days',
                icon: Flame,
                accent: data.urgentGrants.length > 0 ? '#dc2626' : '#16a34a',
                bar: Math.min(data.urgentGrants.length * 20, 100),
              },
            ].map(({ label, value, sub, icon: Icon, accent, bar }) => (
              <div key={label}
                className="rounded-[10px] border border-white/10 p-4 backdrop-blur-sm"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
                  <div className="w-6 h-6 rounded-[5px] flex items-center justify-center"
                    style={{ background: accent + '25' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                  </div>
                </div>
                <div className="text-[26px] font-bold text-white leading-none mb-1">{value}</div>
                <p className="text-[11px] text-[#64748b] mb-3">{sub}</p>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${bar}%`, background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-7xl mx-auto space-y-6">

        {/* ── Intelligence Row ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5">

          {/* Grant Intelligence Briefing (2/3 width) */}
          <div className="col-span-2 bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between"
              style={{ background: 'linear-gradient(to right, #f8fafc, #fff)' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-[6px] flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}>
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-[#0f172a]">Funding Intelligence Briefing</h2>
                  <p className="text-[11px] text-[#64748b]">Synthesized from {data.totalTracked} tracked opportunities</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full font-semibold text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4]">
                LIVE
              </span>
            </div>

            <div className="p-5">
              {/* Top opportunities */}
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Top Opportunities by Match Score</p>
              <div className="space-y-2.5 mb-5">
                {data.topGrants.map((match, i) => {
                  const award = match.grant?.extracted_fields?.award_ceiling || match.grant?.extracted_fields?.award_floor;
                  const days = match.grant?.close_date
                    ? Math.ceil((new Date(match.grant.close_date).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <Link key={match.id} href={`/grant/${match.grant_id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-[8px] hover:bg-[#f8fafc] transition-colors border border-transparent hover:border-[#e2e8f0] group">
                        <span className="text-[12px] font-bold text-[#94a3b8] w-5 flex-shrink-0">#{i + 1}</span>
                        <ScoreArc score={match.composite_score} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#0f172a] truncate group-hover:text-[#0d9488] transition-colors">
                            {match.grant?.title}
                          </p>
                          <p className="text-[11px] text-[#94a3b8] truncate">{match.grant?.agency_name}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {award && (
                            <span className="text-[11px] font-semibold text-[#475569] bg-[#f8fafc] px-2 py-0.5 rounded border border-[#e2e8f0]">
                              {formatCompact(award)}
                            </span>
                          )}
                          {days !== null && days >= 0 && days <= 30 && (
                            <DaysChip days={days} />
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-[#cbd5e1] group-hover:text-[#0d9488] transition-colors" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Pipeline health */}
              {data.totalTracked > 0 && (
                <div className="pt-4 border-t border-[#f1f5f9]">
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Pipeline Stage Distribution</p>
                  <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-2">
                    {[
                      { stage: 'discovered', color: '#94a3b8' },
                      { stage: 'reviewing',  color: '#2563eb' },
                      { stage: 'preparing',  color: '#7c3aed' },
                      { stage: 'drafting',   color: '#d97706' },
                      { stage: 'submitted',  color: '#16a34a' },
                    ].map(({ stage, color }) => {
                      const count = data.matches.filter(m => m.pipeline_stage === stage).length;
                      const pct = (count / data.totalTracked) * 100;
                      return pct > 0 ? (
                        <div key={stage} className="h-full rounded-sm transition-all" style={{ width: `${pct}%`, background: color }} />
                      ) : null;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { stage: 'discovered', label: 'Discovered', color: '#94a3b8' },
                      { stage: 'reviewing',  label: 'Reviewing',  color: '#2563eb' },
                      { stage: 'preparing',  label: 'Preparing',  color: '#7c3aed' },
                      { stage: 'drafting',   label: 'Drafting',   color: '#d97706' },
                      { stage: 'submitted',  label: 'Submitted',  color: '#16a34a' },
                    ].map(({ stage, label, color }) => {
                      const count = data.matches.filter(m => m.pipeline_stage === stage).length;
                      return count > 0 ? (
                        <div key={stage} className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-[11px] text-[#64748b]">{label} <strong className="text-[#0f172a]">{count}</strong></span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Urgent Deadlines (1/3 width) */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden flex flex-col">
            <div className="px-4 py-3.5 border-b border-[#e2e8f0] flex items-center gap-2"
              style={{ background: data.urgentGrants.length > 0 ? 'linear-gradient(to right, #fef2f2, #fff)' : 'linear-gradient(to right, #f8fafc, #fff)' }}>
              <Flame className={`w-4 h-4 ${data.urgentGrants.length > 0 ? 'text-red-500' : 'text-[#94a3b8]'}`} />
              <h2 className="text-[13px] font-bold text-[#0f172a]">Urgent Deadlines</h2>
              {data.urgentGrants.length > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full border border-red-200">
                  {data.urgentGrants.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#f8fafc]">
              {data.urgentGrants.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-[#f0fdf4] flex items-center justify-center mb-3">
                    <Shield className="w-5 h-5 text-[#16a34a]" />
                  </div>
                  <p className="text-[13px] font-medium text-[#0f172a]">No urgent deadlines</p>
                  <p className="text-[11px] text-[#94a3b8] mt-1">All grants have &gt; 14 days remaining</p>
                </div>
              ) : (
                data.urgentGrants.map(match => {
                  const days = Math.ceil(
                    (new Date(match.grant!.close_date!).getTime() - Date.now()) / 86400000
                  );
                  return (
                    <Link key={match.id} href={`/grant/${match.grant_id}`}>
                      <div className="px-4 py-3 hover:bg-[#fef2f2] transition-colors group">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[12px] font-semibold text-[#0f172a] line-clamp-2 group-hover:text-red-600 transition-colors leading-snug">
                            {match.grant?.title}
                          </p>
                          <DaysChip days={days} />
                        </div>
                        <p className="text-[11px] text-[#94a3b8] truncate">{match.grant?.agency_name}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="h-1 flex-1 bg-[#f1f5f9] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600"
                              style={{ width: `${match.composite_score}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-red-600">{match.composite_score.toFixed(0)}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
            <div className="px-4 py-3 border-t border-[#f1f5f9]">
              <Link href="/discover" className="flex items-center justify-center gap-1 text-[12px] font-semibold text-[#0d9488] hover:text-[#0f766e] transition-colors">
                View all deadlines <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Financial Snapshot ─────────────────────────────────── */}
        {financialData ? (
          <FinancialSnapshot
            orgName={data.org?.name ?? 'Organization'}
            ein={data.org?.ein ?? ''}
            computed={financialData.computed}
            latest={financialData.latest}
            history={financialData.history ?? []}
            fetchedAt={data.org?.financial_fetched_at ?? ''}
            filingYear={data.org?.financial_year ?? 0}
          />
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-6 flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-[#0f172a]">990 Financial Analysis not yet synced</p>
              <p className="text-[12px] text-[#64748b] mt-0.5">
                Go to Settings → Sync from 990 to load your IRS financial data
              </p>
            </div>
            <Link
              href="/settings"
              className="px-4 py-2 text-[13px] font-semibold text-[#0d9488] border border-[#0d9488]/30 rounded-[8px] hover:bg-[#f0fdfa] transition-colors whitespace-nowrap"
            >
              Sync 990 data →
            </Link>
          </div>
        )}

        {/* ── Federal Exposure Alert ──────────────────────────────── */}
        <FederalExposure />

        {/* ── Grant Table ────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[16px] font-bold text-[#0f172a]">All Grant Matches</h2>
              <p className="text-[12px] text-[#64748b] mt-0.5">{data.totalTracked} opportunities matched to your profile</p>
            </div>
            <Link href="/pipeline" className="flex items-center gap-1.5 text-[13px] text-[#0d9488] hover:text-[#0f766e] font-semibold transition-colors">
              Open pipeline view <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {data.matches.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-14 text-center">
              <AlertTriangle className="w-8 h-8 text-[#cbd5e1] mx-auto mb-3" />
              <p className="text-[14px] font-medium text-[#64748b] mb-4">No grant matches yet.</p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[13px] font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)' }}
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
