export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  BarChart3, TrendingUp, DollarSign, Target, Award,
  Clock, CheckCircle, Activity, Zap,
  ChevronRight, ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getReportsData() {
  const supabase = createServerClient();

  const [matchesRes, runsRes] = await Promise.all([
    supabase
      .from('match_results')
      .select(`
        id, composite_score, pipeline_stage, financial_score, matched_at,
        grant:grant_opportunities(title, agency_name, agency_code, close_date, extracted_fields)
      `)
      .order('matched_at', { ascending: false }),
    supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(12),
  ]);

  const matches = (matchesRes.data || []) as unknown as Array<{
    id: string;
    composite_score: number;
    pipeline_stage: string;
    financial_score: number;
    matched_at: string;
    grant: { title: string; agency_name: string; agency_code: string; close_date: string | null; extracted_fields: Record<string, unknown> } | null;
  }>;

  const runs = runsRes.data || [];

  const total     = matches.length;
  const active    = matches.filter(m => ['reviewing', 'preparing', 'drafting', 'submitted'].includes(m.pipeline_stage)).length;
  const awarded   = matches.filter(m => m.pipeline_stage === 'awarded').length;
  const submitted = matches.filter(m => ['submitted', 'awarded', 'rejected'].includes(m.pipeline_stage)).length;
  const winRate   = submitted > 0 ? Math.round((awarded / submitted) * 100) : 0;
  const avgScore  = total > 0 ? Math.round(matches.reduce((s, m) => s + m.composite_score, 0) / total) : 0;
  const highMatch = matches.filter(m => m.composite_score >= 70).length;

  const pipelineValue = matches
    .filter(m => ['reviewing', 'preparing', 'drafting', 'submitted'].includes(m.pipeline_stage))
    .reduce((sum, m) => sum + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);

  const awardedValue = matches
    .filter(m => m.pipeline_stage === 'awarded')
    .reduce((sum, m) => sum + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);

  const totalPotential = matches
    .filter(m => m.composite_score >= 60)
    .reduce((sum, m) => sum + (Number(m.grant?.extracted_fields?.award_ceiling) || 0), 0);

  const stageOrder = ['discovered', 'reviewing', 'preparing', 'drafting', 'submitted', 'awarded'];
  const stageCounts = stageOrder.map(s => ({
    stage: s,
    count: matches.filter(m => m.pipeline_stage === s).length,
  }));
  const rejectedCount = matches.filter(m => m.pipeline_stage === 'rejected').length;

  const scoreBuckets = [
    { label: '90+',    labelFull: 'Excellent',  min: 90, max: 100, color: '#16a34a' },
    { label: '75–89',  labelFull: 'Strong',      min: 75, max: 89,  color: '#0d9488' },
    { label: '60–74',  labelFull: 'Good',         min: 60, max: 74,  color: '#2563eb' },
    { label: '40–59',  labelFull: 'Moderate',    min: 40, max: 59,  color: '#d97706' },
    { label: '<40',    labelFull: 'Low',          min: 0,  max: 39,  color: '#dc2626' },
  ].map(b => ({
    ...b,
    count: matches.filter(m => m.composite_score >= b.min && m.composite_score <= b.max).length,
  }));
  const maxBucketCount = Math.max(...scoreBuckets.map(b => b.count), 1);

  const agencyMap: Record<string, { count: number; totalScore: number; awardedCount: number; totalAward: number }> = {};
  for (const m of matches) {
    const agency = m.grant?.agency_name || 'Unknown';
    if (!agencyMap[agency]) agencyMap[agency] = { count: 0, totalScore: 0, awardedCount: 0, totalAward: 0 };
    agencyMap[agency].count++;
    agencyMap[agency].totalScore += m.composite_score;
    if (m.pipeline_stage === 'awarded') agencyMap[agency].awardedCount++;
    agencyMap[agency].totalAward += Number(m.grant?.extracted_fields?.award_ceiling) || 0;
  }
  const topAgencies = Object.entries(agencyMap)
    .map(([name, d]) => ({
      name,
      count: d.count,
      avgScore: Math.round(d.totalScore / d.count),
      awardedCount: d.awardedCount,
      totalAward: d.totalAward,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const maxAgencyCount = Math.max(...topAgencies.map(a => a.count), 1);

  const now = new Date();
  const upcoming = matches
    .filter(m => m.grant?.close_date && new Date(m.grant.close_date) >= now && !['rejected', 'awarded'].includes(m.pipeline_stage))
    .sort((a, b) => new Date(a.grant!.close_date!).getTime() - new Date(b.grant!.close_date!).getTime())
    .slice(0, 8);

  const discoveryHistory = runs.slice(0, 8).reverse().map(r => ({
    date: r.started_at,
    discovered: r.grants_discovered,
    high: r.high_matches,
    medium: r.medium_matches,
  }));
  const maxDiscovered = Math.max(...discoveryHistory.map(r => r.discovered), 1);

  return {
    total, active, awarded, submitted, winRate, avgScore, highMatch,
    pipelineValue, awardedValue, totalPotential,
    stageCounts, rejectedCount, scoreBuckets, maxBucketCount,
    topAgencies, maxAgencyCount,
    upcoming, discoveryHistory, maxDiscovered, runs,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const STAGE_META: Record<string, { label: string; color: string }> = {
  discovered: { label: 'Discovered', color: '#94a3b8' },
  reviewing:  { label: 'Reviewing',  color: '#2563eb' },
  preparing:  { label: 'Preparing',  color: '#7c3aed' },
  drafting:   { label: 'Drafting',   color: '#c2410c' },
  submitted:  { label: 'Submitted',  color: '#0d9488' },
  awarded:    { label: 'Awarded',    color: '#16a34a' },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportsPage() {
  const d = await getReportsData();

  return (
    <AppShell>

      {/* ── Dark Hero ── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 left-1/3 w-96 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6 mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-[#6366f1]" />
                <span className="text-[11px] font-bold text-[#6366f1] uppercase tracking-widest">Analytics & Reports</span>
              </div>
              <h1 className="text-[26px] font-bold text-white leading-tight">Grant Pipeline Analytics</h1>
              <p className="text-[#94a3b8] text-[13px] mt-1">
                Chicago Youth Centers · {d.total} grants tracked · Live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/20 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full animate-pulse" />
                Live data
              </span>
              <Link href="/pipeline"
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg transition-all">
                Pipeline view
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* KPI strip — dark */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Tracked',
                value: String(d.total),
                sub: `${d.highMatch} high-match (≥70)`,
                accent: '#6366f1',
                bar: d.total > 0 ? (d.highMatch / d.total) * 100 : 0,
              },
              {
                label: 'Active Pipeline',
                value: String(d.active),
                sub: 'reviewing → submitted',
                accent: '#0d9488',
                bar: d.total > 0 ? (d.active / d.total) * 100 : 0,
              },
              {
                label: 'Total Potential',
                value: d.totalPotential > 0 ? fmt(d.totalPotential) : '—',
                sub: 'score ≥60 award ceilings',
                accent: '#f59e0b',
                bar: Math.min((d.totalPotential / 10_000_000) * 100, 100),
              },
              {
                label: 'Win Rate',
                value: d.submitted > 0 ? `${d.winRate}%` : '—',
                sub: `${d.awarded} awarded / ${d.submitted} submitted`,
                accent: '#16a34a',
                bar: d.winRate,
              },
            ].map(({ label, value, sub, accent, bar }) => (
              <div key={label} className="rounded-[10px] border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide block mb-3">{label}</span>
                <div className="text-[26px] font-bold text-white leading-none mb-1">{value}</div>
                <p className="text-[11px] text-[#64748b] mb-3">{sub}</p>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${bar}%`, background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-8 py-6 max-w-7xl mx-auto space-y-4">

        {/* ── Pipeline Funnel + Score Distribution ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Pipeline Funnel */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">Pipeline Funnel</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">Grant progression across all stages</p>
              </div>
              <Activity className="w-4 h-4 text-[#94a3b8]" />
            </div>
            <div className="p-5 space-y-3">
              {d.stageCounts.map(({ stage, count }) => {
                const meta = STAGE_META[stage] || { label: stage, color: '#64748b' };
                const pct  = d.total > 0 ? (count / d.total) * 100 : 0;
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                        <span className="text-[13px] font-medium text-[#0f172a]">{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] font-bold tabular-nums" style={{ color: meta.color }}>{count}</span>
                        <span className="text-[11px] text-[#94a3b8] w-8 text-right tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
              {d.rejectedCount > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#dc2626]" />
                      <span className="text-[13px] font-medium text-[#dc2626]">Rejected</span>
                    </div>
                    <span className="text-[12px] font-bold tabular-nums text-[#dc2626]">{d.rejectedCount}</span>
                  </div>
                  <div className="h-2 bg-[#fef2f2] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#dc2626]"
                      style={{ width: `${(d.rejectedCount / d.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
            {d.awardedValue > 0 && (
              <div className="mx-5 mb-5 p-3 bg-[#f0fdf4] rounded-lg border border-[#bbf7d0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-3.5 h-3.5 text-[#16a34a]" />
                  <span className="text-[12px] font-semibold text-[#16a34a]">Total Awards Secured</span>
                </div>
                <span className="text-[15px] font-bold text-[#16a34a] tabular-nums">{formatCurrency(d.awardedValue)}</span>
              </div>
            )}
          </div>

          {/* Score Distribution */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">Match Score Distribution</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">Composite score · {d.total} grants</p>
              </div>
              <Target className="w-4 h-4 text-[#94a3b8]" />
            </div>
            <div className="p-5">
              {/* Bar chart */}
              <div className="flex items-end gap-2 h-32 mb-3">
                {d.scoreBuckets.map(b => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: b.count > 0 ? b.color : '#e2e8f0' }}>
                      {b.count}
                    </span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className="w-full rounded-t transition-all duration-700"
                        style={{
                          height: `${b.count > 0 ? Math.max(4, (b.count / d.maxBucketCount) * 80) : 3}px`,
                          background: b.count > 0 ? b.color : '#f1f5f9',
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-[#94a3b8] font-medium">{b.label}</span>
                    <span className="text-[9px] text-[#94a3b8]">{b.labelFull}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#f1f5f9]">
                <div className="p-3 bg-[#f8fafc] rounded-lg text-center">
                  <p className="text-[11px] text-[#94a3b8] mb-1">Avg Score</p>
                  <p className="text-[22px] font-bold text-[#0f172a] tabular-nums">{d.avgScore}</p>
                  <p className="text-[10px] text-[#94a3b8]">/100</p>
                </div>
                <div className="p-3 bg-[#f0fdf4] rounded-lg text-center">
                  <p className="text-[11px] text-[#94a3b8] mb-1">High Match</p>
                  <p className="text-[22px] font-bold text-[#16a34a] tabular-nums">{d.highMatch}</p>
                  <p className="text-[10px] text-[#94a3b8]">score ≥70</p>
                </div>
                <div className="p-3 bg-[#eff6ff] rounded-lg text-center">
                  <p className="text-[11px] text-[#94a3b8] mb-1">Pipeline $</p>
                  <p className="text-[16px] font-bold text-[#2563eb] tabular-nums">{d.pipelineValue > 0 ? fmt(d.pipelineValue) : '—'}</p>
                  <p className="text-[10px] text-[#94a3b8]">active value</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Agency Breakdown + Upcoming Deadlines ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">Grants by Agency</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">Top funders by volume · avg match score</p>
              </div>
              <Zap className="w-4 h-4 text-[#94a3b8]" />
            </div>
            <div className="divide-y divide-[#f8fafc]">
              {d.topAgencies.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <BarChart3 className="w-8 h-8 text-[#e2e8f0] mx-auto mb-3" />
                  <p className="text-[13px] text-[#94a3b8]">Run discovery to populate agency data.</p>
                  <Link href="/discover"
                    className="inline-flex items-center gap-1 mt-3 text-[12px] font-semibold text-[#0d9488] hover:underline">
                    Run discovery <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              ) : d.topAgencies.map((agency, i) => (
                <div key={agency.name} className="flex items-center gap-4 px-5 py-3 hover:bg-[#f8fafc] transition-colors">
                  <span className="text-[12px] font-bold text-[#94a3b8] w-5 tabular-nums text-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#0f172a] truncate">{agency.name}</p>
                    <div className="mt-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div className="h-full bg-[#0d9488] rounded-full"
                        style={{ width: `${(agency.count / d.maxAgencyCount) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <p className="text-[13px] font-bold text-[#0f172a] tabular-nums">{agency.count}</p>
                      <p className="text-[10px] text-[#94a3b8]">grants</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold tabular-nums"
                        style={{ color: agency.avgScore >= 70 ? '#16a34a' : agency.avgScore >= 40 ? '#d97706' : '#dc2626' }}>
                        {agency.avgScore}
                      </p>
                      <p className="text-[10px] text-[#94a3b8]">avg score</p>
                    </div>
                    {agency.awardedCount > 0 && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-[#f0fdf4] rounded-full border border-[#bbf7d0]">
                        <CheckCircle className="w-3 h-3 text-[#16a34a]" />
                        <span className="text-[11px] font-semibold text-[#16a34a]">{agency.awardedCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden flex flex-col">
            <div className="px-4 py-3.5 border-b border-[#f1f5f9] flex items-center gap-2"
              style={{ background: d.upcoming.length > 0 ? 'linear-gradient(to right, #fef2f2, #fff)' : '#f8fafc' }}>
              <Clock className="w-4 h-4 text-[#dc2626]" />
              <h2 className="text-[13px] font-bold text-[#0f172a]">Upcoming Deadlines</h2>
              {d.upcoming.length > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full border border-red-200">
                  {d.upcoming.length}
                </span>
              )}
            </div>
            <div className="flex-1 divide-y divide-[#f8fafc]">
              {d.upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
                  <CheckCircle className="w-8 h-8 text-[#bbf7d0] mx-auto mb-3" />
                  <p className="text-[13px] font-medium text-[#0f172a]">No upcoming deadlines</p>
                  <p className="text-[11px] text-[#94a3b8] mt-1">All clear for now</p>
                </div>
              ) : d.upcoming.map(m => {
                const days = Math.ceil((new Date(m.grant!.close_date!).getTime() - Date.now()) / 86400000);
                const urgency = days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-[#64748b]';
                return (
                  <div key={m.id} className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
                    <p className="text-[12px] font-semibold text-[#0f172a] line-clamp-1 mb-0.5">{m.grant?.title}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-[#64748b]">{formatDate(m.grant?.close_date)}</p>
                      <span className={`text-[11px] font-bold tabular-nums ${urgency}`}>
                        {days === 0 ? 'Today' : `${days}d`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-[#f1f5f9]">
              <Link href="/calendar" className="flex items-center justify-center gap-1 text-[12px] font-semibold text-[#0d9488] hover:text-[#0f766e] transition-colors">
                Open calendar view <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Discovery History ── */}
        {d.discoveryHistory.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">Discovery Run History</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">Grants discovered per pipeline run · last {d.discoveryHistory.length} runs</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#16a34a]" /><span className="text-[#64748b]">High</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#d97706]" /><span className="text-[#64748b]">Medium</span></div>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-end gap-3 h-28 mb-2">
                {d.discoveryHistory.map((run, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[#94a3b8] tabular-nums">{run.discovered}</span>
                    <div className="w-full flex flex-col items-center justify-end gap-px" style={{ height: '72px' }}>
                      {run.medium > 0 && (
                        <div className="w-full rounded-sm bg-[#d97706]"
                          style={{ height: `${Math.max(2, (run.medium / d.maxDiscovered) * 72)}px` }} />
                      )}
                      {run.high > 0 && (
                        <div className="w-full rounded-sm bg-[#16a34a]"
                          style={{ height: `${Math.max(2, (run.high / d.maxDiscovered) * 72)}px` }} />
                      )}
                      {run.discovered === 0 && (
                        <div className="w-full rounded-sm bg-[#f1f5f9]" style={{ height: '3px' }} />
                      )}
                    </div>
                    <span className="text-[9px] text-[#94a3b8]">
                      {new Date(run.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Run Log ── */}
        {d.runs.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-[#0f172a]">Discovery Run Log</h2>
                <p className="text-[11px] text-[#64748b] mt-0.5">Last {Math.min(d.runs.length, 8)} runs</p>
              </div>
              <Activity className="w-4 h-4 text-[#94a3b8]" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f1f5f9]">
                    {['Run Date', 'Discovered', 'New', 'High Match', 'Med Match', 'Duration'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.runs.slice(0, 8).map(run => (
                    <tr key={run.id} className="border-t border-[#f8fafc] hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3 text-[12px] text-[#475569] tabular-nums">
                        {new Date(run.started_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-bold text-[#0f172a] tabular-nums">{run.grants_discovered}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-[#0d9488] tabular-nums">{run.grants_new}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-[#16a34a] tabular-nums">{run.high_matches}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-[#d97706] tabular-nums">{run.medium_matches}</td>
                      <td className="px-4 py-3 text-[12px] text-[#64748b] tabular-nums">
                        {run.duration_seconds != null ? `${run.duration_seconds}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {d.total === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-14 text-center">
            <BarChart3 className="w-10 h-10 text-[#e2e8f0] mx-auto mb-4" />
            <h3 className="text-[16px] font-semibold text-[#0f172a] mb-2">No analytics yet</h3>
            <p className="text-[13px] text-[#64748b] mb-6 max-w-sm mx-auto">
              Run your first grant discovery to start building pipeline analytics and reports.
            </p>
            <Link href="/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[13px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
              <TrendingUp className="w-3.5 h-3.5" />
              Run Discovery →
            </Link>
          </div>
        )}

      </div>
    </AppShell>
  );
}
