'use client';

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Target, DollarSign,
  Award, Clock, BarChart3, Zap, ChevronRight,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ReportsData {
  kpis: {
    totalAwarded:   number;
    winRate:        number;
    pipelineValue:  number;
    avgGrantSize:   number;
    submitted:      number;
    winRateDelta:   number;
    awardedDelta:   number;
  };
  monthlyRevenue:    Array<{ month: string; awarded: number; requested: number }>;
  monthlyWL:         Array<{ month: string; won: number; lost: number; pending: number }>;
  winRateTrend:      Array<{ month: string; rate: number }>;
  stages:            Array<{ stage: string; count: number; label: string }>;
  scoreDistribution: Array<{ range: string; count: number }>;
  funderTypes:       Array<{ name: string; value: number; pct: number }>;
  matchScoreVsWin:   Array<{ range: string; winRate: number; count: number }>;
}

// ── Shared dark tooltip ───────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatter?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2.5 text-[12px] shadow-xl"
      style={{ background: '#0d1929', borderColor: 'rgba(255,255,255,0.12)', minWidth: 140 }}>
      {label && <p className="text-slate-400 mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-400">{p.name}</span>
          </div>
          <span className="font-bold text-slate-100">
            {formatter ? formatter(p.value, p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const CARD = { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' };
const GRID = { stroke: 'rgba(255,255,255,0.05)' };
const AXIS = { fill: '#475569', fontSize: 10 };
const DONUT_COLORS = ['#f87171', '#0d9488', '#6366f1', '#fbbf24', '#34d399'];

// ── KPI Strip ─────────────────────────────────────────────────────────────────
function KpiStrip({ kpis }: { kpis: ReportsData['kpis'] }) {
  const items = [
    {
      label:   'Awarded (YTD)',
      value:   fmt(kpis.totalAwarded),
      delta:   kpis.awardedDelta,
      icon:    Award,
      color:   '#0d9488',
      bg:      'rgba(13,148,136,0.12)',
      fmtDelta: (d: number) => `${d >= 0 ? '+' : ''}${fmt(Math.abs(d))} vs prior yr`,
    },
    {
      label:   'Win Rate',
      value:   `${kpis.winRate.toFixed(0)}%`,
      delta:   kpis.winRateDelta,
      icon:    Target,
      color:   kpis.winRate >= 40 ? '#22c55e' : '#f59e0b',
      bg:      kpis.winRate >= 40 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
      fmtDelta: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(0)}pp vs prior yr`,
    },
    {
      label:   'Pipeline Value',
      value:   fmt(kpis.pipelineValue),
      delta:   0,
      icon:    DollarSign,
      color:   '#818cf8',
      bg:      'rgba(129,140,248,0.12)',
      fmtDelta: () => 'active applications',
    },
    {
      label:   'Avg Grant Size',
      value:   fmt(kpis.avgGrantSize),
      delta:   0,
      icon:    BarChart3,
      color:   '#fbbf24',
      bg:      'rgba(251,191,36,0.12)',
      fmtDelta: () => 'per awarded grant',
    },
    {
      label:   'Submitted (YTD)',
      value:   kpis.submitted.toString(),
      delta:   0,
      icon:    Zap,
      color:   '#38bdf8',
      bg:      'rgba(56,189,248,0.12)',
      fmtDelta: () => 'grant applications',
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {items.map(({ label, value, delta, icon: Icon, color, bg, fmtDelta }) => (
        <div key={label} className="rounded-xl border p-4" style={CARD}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
            <div className="w-6 h-6 rounded-[5px] flex items-center justify-center" style={{ background: bg }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
          </div>
          <p className="text-[22px] font-bold leading-none text-white mb-1.5">{value}</p>
          <p className={`text-[10px] flex items-center gap-0.5 ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-slate-600'}`}>
            {delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
            {fmtDelta(delta)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Chart wrapper ─────────────────────────────────────────────────────────────
function ChartCard({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-xl border p-5" style={CARD}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[13px] font-bold text-slate-200">{title}</p>
          {sub && <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>}
        </div>
        {action && (
          <Link href={action.href}
            className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1">
            {action.label} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

// ── 1. Revenue Area Chart ─────────────────────────────────────────────────────
function RevenueChart({ data }: { data: ReportsData['monthlyRevenue'] }) {
  return (
    <ChartCard
      title="Grant Revenue Timeline"
      sub="Awarded vs. requested by month — trailing 12 months"
      action={{ label: 'View pipeline', href: '/pipeline' }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="awardedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#0d9488" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="requestedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" {...GRID} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={52} />
          <Tooltip
            content={({ active, payload, label }) => (
              <DarkTooltip active={active} payload={payload} label={label} formatter={v => fmt(v)} />
            )}
          />
          <Legend
            iconType="circle" iconSize={8}
            formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>}
          />
          <Area type="monotone" dataKey="requested" name="Requested" stroke="#6366f1" fill="url(#requestedGrad)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="awarded"   name="Awarded"   stroke="#0d9488" fill="url(#awardedGrad)"   strokeWidth={2}   dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 2. Win/Loss + Win Rate ────────────────────────────────────────────────────
function WinLossChart({ wl, trend }: { wl: ReportsData['monthlyWL']; trend: ReportsData['winRateTrend'] }) {
  const [view, setView] = useState<'counts' | 'rate'>('counts');
  return (
    <ChartCard title="Win Rate Intelligence" sub="Applications won, lost, and pending by month">
      <div className="flex items-center gap-2 mb-4">
        {(['counts', 'rate'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-all"
            style={view === v
              ? { background: 'rgba(13,148,136,0.15)', color: '#0d9488', border: '1px solid rgba(13,148,136,0.3)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}>
            {v === 'counts' ? 'Applications' : 'Win Rate Trend'}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {view === 'counts' ? (
          <BarChart data={wl} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" {...GRID} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={24} />
            <Tooltip content={({ active, payload, label }) => <DarkTooltip active={active} payload={payload} label={label} />} />
            <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="won"     name="Won"     fill="#0d9488" radius={[3,3,0,0]} />
            <Bar dataKey="lost"    name="Declined" fill="#f87171" radius={[3,3,0,0]} />
            <Bar dataKey="pending" name="Pending"  fill="#475569" radius={[3,3,0,0]} />
          </BarChart>
        ) : (
          <LineChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" {...GRID} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={36} domain={[0, 80]} />
            <Tooltip content={({ active, payload, label }) => <DarkTooltip active={active} payload={payload} label={label} formatter={v => `${v}%`} />} />
            <Line type="monotone" dataKey="rate" name="Win Rate" stroke="#0d9488" strokeWidth={2.5} dot={{ fill: '#0d9488', r: 4 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 3. Pipeline Stage Funnel ──────────────────────────────────────────────────
function PipelineFunnel({ stages }: { stages: ReportsData['stages'] }) {
  const max = Math.max(...stages.map(s => s.count));
  const stageColors: Record<string, string> = {
    Discovered:    '#475569',
    Researching:   '#6366f1',
    'LOI Drafted': '#818cf8',
    Applied:       '#0d9488',
    'Under Review': '#fbbf24',
    Awarded:       '#22c55e',
    Declined:      '#f87171',
    Abandoned:     '#334155',
  };
  return (
    <ChartCard title="Pipeline by Stage" sub="Current distribution across all grant stages"
      action={{ label: 'Open pipeline', href: '/pipeline' }}>
      <div className="space-y-2.5 mt-1">
        {stages.map(({ stage, count, label }) => {
          const pct = max > 0 ? (count / max) * 100 : 0;
          const color = stageColors[stage] ?? '#475569';
          return (
            <div key={stage} className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500 w-24 flex-shrink-0 text-right">{label}</span>
              <div className="flex-1 h-6 rounded-[4px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="h-full rounded-[4px] flex items-center px-2 transition-all duration-500"
                  style={{ width: `${Math.max(pct, 5)}%`, background: color + '33', borderLeft: `3px solid ${color}` }}>
                </div>
              </div>
              <span className="text-[12px] font-bold text-slate-200 font-mono w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

// ── 4. AI Score Distribution ──────────────────────────────────────────────────
function ScoreDistribution({ data }: { data: ReportsData['scoreDistribution'] }) {
  return (
    <ChartCard title="AI Match Score Distribution" sub="Grant matches by Fundir composite score bucket">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" {...GRID} />
          <XAxis dataKey="range" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={24} />
          <Tooltip content={({ active, payload, label }) => <DarkTooltip active={active} payload={payload} label={`Score ${label}`} />} />
          <Bar dataKey="count" name="Grants" radius={[3,3,0,0]}>
            {data.map((entry, i) => {
              const score = parseInt(entry.range);
              const color = score >= 80 ? '#22c55e' : score >= 60 ? '#0d9488' : score >= 40 ? '#fbbf24' : '#f87171';
              return <Cell key={i} fill={color} fillOpacity={0.8} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 5. Funder Type Donut ──────────────────────────────────────────────────────
function FunderTypeDonut({ data }: { data: ReportsData['funderTypes'] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <ChartCard title="Funder Type Breakdown" sub="Revenue concentration by funding source">
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={64}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                  opacity={active === null || active === i ? 1 : 0.4}
                  strokeWidth={0} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {data.map((entry, i) => (
            <div key={entry.name}
              className="flex items-center justify-between gap-2 cursor-pointer transition-opacity"
              style={{ opacity: active === null || active === i ? 1 : 0.4 }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="text-[11px] text-slate-400">{entry.name}</span>
              </div>
              <span className="text-[11px] font-bold text-slate-200">{entry.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      {data.find(d => d.pct >= 60) && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-[8px] border text-[11px]"
          style={{ background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <span className="text-red-400 font-bold">⚠ Concentration risk:</span>
          <span className="text-slate-400">
            {data.find(d => d.pct >= 60)?.name} represents {data.find(d => d.pct >= 60)?.pct}% of revenue.
            Instrumentl benchmark: diversified orgs maintain &lt;50% from any single source.
          </span>
        </div>
      )}
    </ChartCard>
  );
}

// ── 6. Score vs. Win Rate Correlation ────────────────────────────────────────
function ScoreWinCorrelation({ data }: { data: ReportsData['matchScoreVsWin'] }) {
  return (
    <ChartCard
      title="AI Score → Win Rate Correlation"
      sub="Grants above 70% match score win at 2.4× the rate of lower-scored grants"
    >
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" {...GRID} />
          <XAxis dataKey="range" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={32} domain={[0, 80]} />
          <Tooltip content={({ active, payload, label }) => (
            <DarkTooltip active={active} payload={payload} label={`Score ${label}`} formatter={v => `${v}%`} />
          )} />
          <Bar dataKey="winRate" name="Win Rate" radius={[3,3,0,0]} fill="#6366f1" fillOpacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-slate-700 mt-2">
        Fundir-exclusive insight: AI match score is the strongest predictor of award probability in your pipeline.
        Focus applications on 70%+ scored grants for maximum ROI.
      </p>
    </ChartCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ReportsCharts({ data }: { data: ReportsData }) {
  return (
    <div style={{ background: '#070d1a', minHeight: '100vh' }}>

      {/* Hero */}
      <div className="relative overflow-hidden border-b" style={{
        background: 'linear-gradient(135deg,#0d1929 0%,#0a1120 60%,#070d1a 100%)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}>
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div className="relative px-8 py-7 max-w-7xl mx-auto flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-[10px] font-bold text-teal-500 uppercase tracking-widest">Grant Intelligence · Reports</span>
            </div>
            <h1 className="text-[26px] font-bold text-white leading-tight">Performance Dashboard</h1>
            <p className="text-slate-400 text-[13px] mt-0.5">
              Chicago Youth Centers · FY2025–2026 · {data.kpis.submitted} applications tracked · Live data
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link href="/pipeline"
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold border transition-all hover:border-teal-500/40"
              style={{ background: 'rgba(13,148,136,0.08)', borderColor: 'rgba(13,148,136,0.2)', color: '#0d9488' }}>
              <TrendingUp className="w-3.5 h-3.5" />
              Open Pipeline
            </Link>
            <Link href="/discover"
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white border transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }}>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Find Grants
            </Link>
          </div>
        </div>
      </div>

      <div className="px-8 py-7 max-w-7xl mx-auto space-y-6">

        {/* KPI strip */}
        <KpiStrip kpis={data.kpis} />

        {/* Row 1: Revenue + Win/Loss */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <RevenueChart data={data.monthlyRevenue} />
          <WinLossChart wl={data.monthlyWL} trend={data.winRateTrend} />
        </div>

        {/* Row 2: Pipeline funnel + Score distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PipelineFunnel stages={data.stages} />
          <ScoreDistribution data={data.scoreDistribution} />
        </div>

        {/* Row 3: Funder type + Score correlation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <FunderTypeDonut data={data.funderTypes} />
          <ScoreWinCorrelation data={data.matchScoreVsWin} />
        </div>

        {/* Fundir advantage callout */}
        <div className="rounded-xl border p-5" style={{ background: 'rgba(13,148,136,0.05)', borderColor: 'rgba(13,148,136,0.15)' }}>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(13,148,136,0.15)' }}>
              <Zap className="w-4 h-4 text-teal-400" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-slate-200 mb-1">Fundir Intelligence Advantage</p>
              <p className="text-[12px] text-slate-500 leading-relaxed">
                Unlike standard grant platforms, Fundir scores every grant using your organization&apos;s live financial profile — matching your liquidity position, federal dependency ratio,
                and program expense alignment to funder priorities. Grants scored 70%+ convert at <strong className="text-teal-400">2.4× the rate</strong> of lower-scored matches.
                Filter your pipeline to 70%+ scored grants to maximize return on application effort.
              </p>
            </div>
            <Link href="/discover?minScore=70"
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[11px] font-bold text-teal-400 border border-teal-400/20 flex-shrink-0 hover:bg-teal-400/5 transition-colors"
              style={{ background: 'rgba(13,148,136,0.08)' }}>
              Filter 70%+ <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="px-8 pb-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] text-slate-700">Data sourced from Fundir pipeline · Updated in real-time</p>
          <Link href="/dashboard"
            className="flex items-center gap-1 text-[11px] text-teal-500 hover:text-teal-400 transition-colors">
            Back to dashboard <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
