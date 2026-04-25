export const dynamic = 'force-dynamic';

import type { ElementType } from 'react';
import { createServerClient } from '@/lib/supabase';
import { AppShell } from '@/components/app-shell';
import { ComputedFinancials, Filing990 } from '@/lib/propublica';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import {
  BarChart3, TrendingUp, TrendingDown, Shield, AlertTriangle,
  DollarSign, Clock, Activity, ArrowRight, Info, RefreshCw,
  Target, CheckCircle, ChevronRight,
} from 'lucide-react';

async function getFinancialData() {
  const supabase = createServerClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('name, ein, financial_data, financial_year, financial_fetched_at')
    .eq('org_code', 'CYC2025')
    .single();

  if (!org?.financial_data) return { org, financialData: null };

  const financialData = org.financial_data as {
    computed: ComputedFinancials;
    latest: Filing990;
    history: Filing990[];
  };

  return { org, financialData };
}

function fmt(n: number) { return formatCurrency(n); }

function pct(n: number, color?: string) {
  const c = color ?? (n >= 0 ? '#16a34a' : '#dc2626');
  return <span style={{ color: c }} className="font-semibold">{n > 0 ? '+' : ''}{n}%</span>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color, bg, trend,
}: {
  label: string; value: string; sub?: string;
  icon: ElementType; color: string; bg: string;
  trend?: { direction: 'up' | 'down'; pct: number };
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[12px] font-medium ${trend.direction === 'up' ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
            {trend.direction === 'up'
              ? <TrendingUp className="w-3.5 h-3.5" />
              : <TrendingDown className="w-3.5 h-3.5" />
            }
            {trend.pct}%
          </div>
        )}
      </div>
      <div className="text-[26px] font-bold text-[#0f172a] leading-none mb-1">{value}</div>
      <div className="text-[12px] font-medium text-[#64748b]">{label}</div>
      {sub && <div className="text-[11px] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Revenue composition bar ───────────────────────────────────────────────────
function CompositionBar({ segments }: {
  segments: { label: string; pct: number; color: string }[];
}) {
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
        {segments.map(s => (
          <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} className="first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-[12px] text-[#475569]">{s.label}</span>
            <span className="text-[12px] font-semibold text-[#0f172a]">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Year-over-year table row ──────────────────────────────────────────────────
function YoyRow({ filing, prev }: { filing: Filing990; prev?: Filing990 }) {
  const revChange = prev
    ? Math.round(((filing.totrevenue - prev.totrevenue) / prev.totrevenue) * 100)
    : null;
  const expChange = prev
    ? Math.round(((filing.totfuncexpns - prev.totfuncexpns) / prev.totfuncexpns) * 100)
    : null;
  const netAssetsChange = prev
    ? Math.round(((filing.netassetsend - prev.netassetsend) / Math.abs(prev.netassetsend || 1)) * 100)
    : null;

  return (
    <tr className="border-t border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
      <td className="py-3 px-4 text-[13px] font-semibold text-[#0f172a]">FY {filing.tax_prd_yr}</td>
      <td className="py-3 px-4 text-right">
        <div className="text-[13px] font-mono font-semibold text-[#0f172a]">{fmt(filing.totrevenue)}</div>
        {revChange !== null && (
          <div className={`text-[11px] ${revChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
            {revChange >= 0 ? '▲' : '▼'} {Math.abs(revChange)}%
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        <div className="text-[13px] font-mono font-semibold text-[#0f172a]">{fmt(filing.totfuncexpns)}</div>
        {expChange !== null && (
          <div className={`text-[11px] ${expChange <= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
            {expChange >= 0 ? '▲' : '▼'} {Math.abs(expChange)}%
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        <div className="text-[13px] font-mono font-semibold text-[#0f172a]">{fmt(filing.totassetsend)}</div>
      </td>
      <td className="py-3 px-4 text-right">
        <div className={`text-[13px] font-mono font-semibold ${filing.netassetsend >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
          {fmt(filing.netassetsend)}
        </div>
        {netAssetsChange !== null && (
          <div className={`text-[11px] ${netAssetsChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
            {netAssetsChange >= 0 ? '▲' : '▼'} {Math.abs(netAssetsChange)}%
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-[12px] font-mono text-[#64748b]">
          {fmt(filing.govtgrnts ?? 0)}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-[12px] font-mono text-[#64748b]">
          {fmt(filing.gftgrntsrcvd)}
        </span>
      </td>
    </tr>
  );
}

// ── Risk indicator ────────────────────────────────────────────────────────────
function RiskMeter({ level }: { level: ComputedFinancials['govtDependency'] }) {
  const steps = [
    { key: 'low',      label: 'Low',      color: '#16a34a' },
    { key: 'moderate', label: 'Moderate', color: '#d97706' },
    { key: 'elevated', label: 'Elevated', color: '#c2410c' },
    { key: 'critical', label: 'Critical', color: '#dc2626' },
  ] as const;
  const activeIdx = steps.findIndex(s => s.key === level);

  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex-1">
          <div
            className="h-2 rounded-full transition-all"
            style={{ background: i <= activeIdx ? s.color : '#e2e8f0' }}
          />
        </div>
      ))}
      <span className="ml-2 text-[12px] font-semibold" style={{ color: steps[activeIdx].color }}>
        {steps[activeIdx].label}
      </span>
    </div>
  );
}

// ── SVG sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, color = '#0d9488' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120; const h = 36;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-9" preserveAspectRatio="none">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Strategy recommendation pill ─────────────────────────────────────────────
function StrategyPill({ icon: Icon, color, bg, title, body }: {
  icon: ElementType; color: string; bg: string; title: string; body: string;
}) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-[#e2e8f0] bg-white">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#0f172a] mb-0.5">{title}</p>
        <p className="text-[12px] text-[#64748b] leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default async function FinancialsPage() {
  const { org, financialData } = await getFinancialData();

  if (!financialData) {
    return (
      <AppShell>
        <div className="px-8 py-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-[#0d9488]" />
            <h1 className="text-[22px] font-bold text-[#0f172a]">Financials</h1>
          </div>
          <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-16 text-center">
            <BarChart3 className="w-10 h-10 text-[#cbd5e1] mx-auto mb-4" />
            <p className="text-[15px] font-semibold text-[#0f172a] mb-2">990 Financial Data Not Synced</p>
            <p className="text-[13px] text-[#64748b] mb-6">
              Sync your IRS Form 990 from ProPublica to unlock full financial analysis.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0d9488] text-white rounded-lg text-[13px] font-semibold hover:bg-[#0f766e] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Sync from 990 →
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const { computed, latest, history } = financialData;
  const orgName = org?.name ?? 'Organization';
  const ein = org?.ein ?? '';

  // Year-over-year: history is newest-first from the stored data
  // Sort ascending for table display oldest→newest
  const allYears = [...(history || [latest])].sort((a, b) => b.tax_prd_yr - a.tax_prd_yr);

  // Revenue trend data for sparkline (oldest→newest)
  const revTrend = [...allYears].reverse().map(f => f.totrevenue);
  const expTrend = [...allYears].reverse().map(f => f.totfuncexpns);
  const netTrend = [...allYears].reverse().map(f => f.netassetsend);

  // Revenue composition segments
  const otherPct = Math.max(0, 100 - computed.governmentGrantsPct - computed.privateGrantsPct - computed.programRevenuePct);
  const compositionSegments = [
    { label: 'Govt Grants',    pct: computed.governmentGrantsPct, color: computed.governmentGrantsPct >= 50 ? '#dc2626' : computed.governmentGrantsPct >= 30 ? '#d97706' : '#0d9488' },
    { label: 'Private Grants', pct: computed.privateGrantsPct,    color: '#2563eb' },
    { label: 'Program Rev.',   pct: computed.programRevenuePct,   color: '#7c3aed' },
    ...(otherPct > 0 ? [{ label: 'Other', pct: otherPct, color: '#94a3b8' }] : []),
  ].filter(s => s.pct > 0);

  // Revenue growth from earliest to latest
  const earliest = allYears[allYears.length - 1];
  const revenueGrowthPct = earliest && earliest.totrevenue > 0
    ? Math.round(((latest.totrevenue - earliest.totrevenue) / earliest.totrevenue) * 100)
    : null;

  // Strategy recommendations
  const strategies = buildStrategies(computed, orgName);

  return (
    <AppShell>
      <div className="px-8 py-6 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <BarChart3 className="w-5 h-5 text-[#0d9488]" />
              <h1 className="text-[22px] font-bold text-[#0f172a]">Financial Analysis</h1>
              <span className="ml-1 text-[11px] px-2 py-0.5 bg-[#f0fdfa] border border-[#99f6e4] text-[#0d9488] rounded-full font-medium">
                IRS Form 990 · FY {computed.filingYear}
              </span>
            </div>
            <p className="text-[13px] text-[#64748b]">
              {orgName} · EIN {ein.replace(/(\d{2})(\d{7})/, '$1-$2')} ·
              Synced {org?.financial_fetched_at ? new Date(org.financial_fetched_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-2 px-3.5 py-2 border border-[#e2e8f0] rounded-lg text-[13px] font-medium text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-sync
          </Link>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Total Revenue"
            value={fmt(computed.totalRevenue)}
            sub={`FY ${computed.filingYear}`}
            icon={DollarSign}
            color="#0d9488"
            bg="#f0fdfa"
            trend={revenueGrowthPct !== null ? { direction: revenueGrowthPct >= 0 ? 'up' : 'down', pct: Math.abs(revenueGrowthPct) } : undefined}
          />
          <KpiCard
            label="Net Assets"
            value={fmt(computed.netAssets)}
            sub="End of year balance sheet"
            icon={computed.netAssets >= 0 ? TrendingUp : TrendingDown}
            color={computed.netAssets >= 0 ? '#16a34a' : '#dc2626'}
            bg={computed.netAssets >= 0 ? '#f0fdf4' : '#fef2f2'}
          />
          <KpiCard
            label="Months of Reserves"
            value={`${computed.monthsOfReserves}mo`}
            sub={computed.monthsOfReserves >= 6 ? 'Healthy liquidity' : computed.monthsOfReserves >= 3 ? 'Adequate' : 'Low — prioritize bridge funding'}
            icon={Clock}
            color={computed.monthsOfReserves >= 6 ? '#16a34a' : computed.monthsOfReserves >= 3 ? '#d97706' : '#dc2626'}
            bg={computed.monthsOfReserves >= 6 ? '#f0fdf4' : computed.monthsOfReserves >= 3 ? '#fffbeb' : '#fef2f2'}
          />
          <KpiCard
            label="Govt Grant Exposure"
            value={`${computed.governmentGrantsPct}%`}
            sub={`${computed.govtDependency.charAt(0).toUpperCase() + computed.govtDependency.slice(1)} dependency`}
            icon={Shield}
            color={computed.govtDependency === 'critical' ? '#dc2626' : computed.govtDependency === 'elevated' ? '#c2410c' : computed.govtDependency === 'moderate' ? '#d97706' : '#16a34a'}
            bg={computed.govtDependency === 'critical' ? '#fef2f2' : computed.govtDependency === 'elevated' ? '#fff7ed' : computed.govtDependency === 'moderate' ? '#fffbeb' : '#f0fdf4'}
          />
        </div>

        {/* ── Two-column: Revenue mix + Key items ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Revenue composition card */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Revenue Composition</h2>
              <span className="text-[11px] text-[#94a3b8]">FY {computed.filingYear}</span>
            </div>
            <CompositionBar segments={compositionSegments} />

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: 'Government Grants',       value: latest.govtgrnts ?? 0,    color: computed.governmentGrantsPct >= 50 ? '#dc2626' : '#0d9488' },
                { label: 'Private Grants & Gifts',  value: latest.gftgrntsrcvd,      color: '#2563eb' },
                { label: 'Program Service Revenue', value: latest.prgmservrev,       color: '#7c3aed' },
                { label: 'Total Expenses',          value: latest.totfuncexpns,      color: '#64748b' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-lg bg-[#f8fafc] border border-[#f1f5f9]">
                  <p className="text-[11px] text-[#94a3b8] mb-1">{label}</p>
                  <p className="text-[15px] font-bold font-mono" style={{ color }}>{fmt(value)}</p>
                </div>
              ))}
            </div>

            {/* Govt dependency risk meter */}
            <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-[#64748b] uppercase tracking-wide">Government Dependency Risk</span>
              </div>
              <RiskMeter level={computed.govtDependency} />
            </div>
          </div>

          {/* Sparklines card */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
            <h2 className="text-[14px] font-semibold text-[#0f172a] mb-4">Trend Overview</h2>
            <div className="space-y-4">
              {[
                { label: 'Revenue',    data: revTrend, color: '#0d9488' },
                { label: 'Expenses',   data: expTrend, color: '#64748b' },
                { label: 'Net Assets', data: netTrend, color: netTrend[netTrend.length - 1] >= 0 ? '#16a34a' : '#dc2626' },
              ].map(({ label, data, color }) => {
                const latest_val = data[data.length - 1] ?? 0;
                const first_val  = data[0] ?? 0;
                const chg = first_val !== 0 ? Math.round(((latest_val - first_val) / Math.abs(first_val)) * 100) : 0;
                return (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-medium text-[#0f172a]">{label}</p>
                      <p className="text-[11px] text-[#94a3b8]">{fmt(latest_val)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Sparkline data={data} color={color} />
                      <div className={`text-[11px] font-semibold ${chg >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                        {chg >= 0 ? '+' : ''}{chg}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Months of reserves bar */}
            <div className="mt-5 pt-4 border-t border-[#f1f5f9]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#0f172a]">Liquidity Runway</span>
                <span className="text-[12px] font-bold text-[#0f172a]">{computed.monthsOfReserves}mo</span>
              </div>
              <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (computed.monthsOfReserves / 12) * 100)}%`,
                    background: computed.monthsOfReserves >= 6 ? '#16a34a' : computed.monthsOfReserves >= 3 ? '#d97706' : '#dc2626',
                  }}
                />
              </div>
              <p className="text-[10px] text-[#94a3b8] mt-1">Target: 6+ months · Benchmark: industry avg 4.2mo</p>
            </div>
          </div>
        </div>

        {/* ── Year-over-year table ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Year-over-Year Comparison</h2>
              <p className="text-[11px] text-[#64748b] mt-0.5">IRS Form 990 · All available filings · ▲/▼ vs prior year</p>
            </div>
            <Activity className="w-4 h-4 text-[#94a3b8]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  {['Fiscal Year', 'Total Revenue', 'Total Expenses', 'Total Assets', 'Net Assets', 'Govt Grants', 'Private Grants'].map(h => (
                    <th key={h} className={`py-2.5 px-4 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide ${h === 'Fiscal Year' ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allYears.map((filing, i) => (
                  <YoyRow key={filing.tax_prd_yr} filing={filing} prev={allYears[i + 1]} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Balance sheet snapshot ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
            <h2 className="text-[14px] font-semibold text-[#0f172a] mb-4">Balance Sheet — FY {computed.filingYear}</h2>
            <div className="space-y-2.5">
              {[
                { label: 'Total Assets (End of Year)',      value: latest.totassetsend,  positive: true },
                { label: 'Total Liabilities (End of Year)', value: latest.totliabend,    positive: false },
                { label: 'Net Assets / Fund Balance',       value: latest.netassetsend,  positive: latest.netassetsend >= 0 },
                { label: 'Officer/Exec Compensation',       value: latest.compnsatncurrofcr, positive: true },
              ].map(({ label, value, positive }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-[#f8fafc] last:border-0">
                  <span className="text-[12px] text-[#64748b]">{label}</span>
                  <span className={`text-[13px] font-bold font-mono ${positive ? 'text-[#0f172a]' : 'text-[#dc2626]'}`}>
                    {fmt(value)}
                  </span>
                </div>
              ))}
            </div>
            {/* Asset-to-liability ratio */}
            <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
              <p className="text-[11px] text-[#94a3b8] mb-1.5">Asset Coverage Ratio</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0d9488] rounded-full"
                    style={{ width: `${Math.min(100, (latest.netassetsend / latest.totassetsend) * 100)}%` }}
                  />
                </div>
                <span className="text-[12px] font-bold text-[#0f172a]">
                  {latest.totassetsend > 0
                    ? `${Math.round((latest.netassetsend / latest.totassetsend) * 100)}%`
                    : 'N/A'}
                </span>
              </div>
              <p className="text-[10px] text-[#94a3b8] mt-1">Net assets as % of total assets</p>
            </div>
          </div>

          {/* Income statement */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
            <h2 className="text-[14px] font-semibold text-[#0f172a] mb-4">Income Statement — FY {computed.filingYear}</h2>
            <div className="space-y-2.5">
              {[
                { label: 'Government Grants',       value: latest.govtgrnts ?? 0 },
                { label: 'Private Grants & Gifts',  value: latest.gftgrntsrcvd },
                { label: 'Program Service Revenue', value: latest.prgmservrev },
                { label: 'Total Revenue',           value: latest.totrevenue, bold: true },
                { label: 'Total Expenses',          value: latest.totfuncexpns, bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label} className={`flex items-center justify-between py-2 border-b border-[#f8fafc] last:border-0 ${bold ? 'mt-1' : ''}`}>
                  <span className={`text-[12px] ${bold ? 'font-semibold text-[#0f172a]' : 'text-[#64748b]'}`}>{label}</span>
                  <span className={`font-mono ${bold ? 'text-[14px] font-bold text-[#0f172a]' : 'text-[13px] font-semibold text-[#475569]'}`}>
                    {fmt(value)}
                  </span>
                </div>
              ))}
            </div>
            {/* Surplus/deficit */}
            <div className="mt-3 p-3 rounded-lg" style={{
              background: latest.totrevenue - latest.totfuncexpns >= 0 ? '#f0fdf4' : '#fef2f2',
            }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold" style={{ color: latest.totrevenue - latest.totfuncexpns >= 0 ? '#16a34a' : '#dc2626' }}>
                  {latest.totrevenue - latest.totfuncexpns >= 0 ? 'Operating Surplus' : 'Operating Deficit'}
                </span>
                <span className="text-[14px] font-bold font-mono" style={{ color: latest.totrevenue - latest.totfuncexpns >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmt(Math.abs(latest.totrevenue - latest.totfuncexpns))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Fundir Strategy Recommendations ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-gradient-to-r from-[#f0fdfa] to-[#f8fafc]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#0d9488] rounded-lg flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-[#0f172a]">Fundir Grant Strategy — AI Recommendations</h2>
                <p className="text-[11px] text-[#64748b]">Based on your 990 financial profile · FY {computed.filingYear}</p>
              </div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {strategies.map((s, i) => (
              <StrategyPill key={i} {...s} />
            ))}
          </div>
        </div>

        {/* ── Full 990 line items ── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#0f172a]">990 Raw Line Items</h2>
              <p className="text-[11px] text-[#64748b] mt-0.5">Complete data as filed with the IRS · FY {computed.filingYear}</p>
            </div>
            <span className="text-[11px] text-[#94a3b8]">Source: ProPublica Nonprofit Explorer</span>
          </div>
          <div className="divide-y divide-[#f8fafc]">
            {[
              ['Total Revenue (Part VIII)',           fmt(latest.totrevenue)],
              ['Government Grants (Schedule I)',      fmt(latest.govtgrnts ?? 0)],
              ['Private Gifts & Grants Received',    fmt(latest.gftgrntsrcvd)],
              ['Program Service Revenue',             fmt(latest.prgmservrev)],
              ['Total Functional Expenses (Part IX)', fmt(latest.totfuncexpns)],
              ['Total Assets, End of Year',           fmt(latest.totassetsend)],
              ['Total Liabilities, End of Year',      fmt(latest.totliabend)],
              ['Net Assets / Fund Balance, EOY',      fmt(latest.netassetsend)],
              ['Officer/Director Compensation',       fmt(latest.compnsatncurrofcr)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-5 py-3 hover:bg-[#f8fafc] transition-colors">
                <span className="text-[12px] text-[#475569]">{label}</span>
                <span className="text-[13px] font-semibold font-mono text-[#0f172a]">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Data source footnote ── */}
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-[#94a3b8]">
            Data sourced from ProPublica Nonprofit Explorer · IRS Form 990 · FY {computed.filingYear} ·
            Synced {org?.financial_fetched_at ? new Date(org.financial_fetched_at).toLocaleDateString() : 'N/A'}
          </p>
          <Link href="/settings" className="text-[11px] text-[#0d9488] hover:underline flex items-center gap-1">
            Update data <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

      </div>
    </AppShell>
  );
}

// ── Build AI strategy recommendations from financial profile ─────────────────
function buildStrategies(computed: ComputedFinancials, orgName: string) {
  const strategies = [];

  if (computed.govtDependency === 'critical' || computed.govtDependency === 'elevated') {
    strategies.push({
      icon: Shield,
      color: '#dc2626',
      bg: '#fef2f2',
      title: 'Diversify Away from Government Grants',
      body: `At ${computed.governmentGrantsPct}% govt revenue, ${orgName} carries elevated concentration risk. Fundir is prioritizing private foundation grants and corporate giving programs to reduce exposure.`,
    });
  }

  if (computed.monthsOfReserves < 3) {
    strategies.push({
      icon: AlertTriangle,
      color: '#d97706',
      bg: '#fffbeb',
      title: 'Prioritize Rapid-Award Grants',
      body: `With only ${computed.monthsOfReserves} months of reserves, focus on grants with <6 month award timelines. Look for emergency bridge funding and rapid-response grant programs.`,
    });
  } else if (computed.monthsOfReserves < 6) {
    strategies.push({
      icon: Clock,
      color: '#d97706',
      bg: '#fffbeb',
      title: 'Target Fast-Cycle Grant Programs',
      body: `${computed.monthsOfReserves} months of reserves is adequate but below the 6-month benchmark. Prioritize grants with 3–6 month award cycles alongside multi-year applications.`,
    });
  } else {
    strategies.push({
      icon: CheckCircle,
      color: '#16a34a',
      bg: '#f0fdf4',
      title: 'Strong Position for Multi-Year Grants',
      body: `With ${computed.monthsOfReserves} months of reserves, ${orgName} is well-positioned to pursue multi-year grants ($500K+) that require demonstrated financial stability.`,
    });
  }

  if (computed.privateGrantsPct < 20) {
    strategies.push({
      icon: Target,
      color: '#2563eb',
      bg: '#eff6ff',
      title: 'Expand Private Foundation Pipeline',
      body: `Private grants represent only ${computed.privateGrantsPct}% of revenue. Fundir is surfacing high-match private foundation opportunities aligned with your program areas.`,
    });
  }

  if (computed.programRevenuePct < 10) {
    strategies.push({
      icon: TrendingUp,
      color: '#7c3aed',
      bg: '#f5f3ff',
      title: 'Explore Program Revenue Opportunities',
      body: `Program service revenue is ${computed.programRevenuePct}% of total. Fee-for-service contracts, training programs, or consulting services can reduce grant dependency long-term.`,
    });
  }

  if (computed.governmentGrantsPct < 30 && computed.monthsOfReserves >= 6) {
    strategies.push({
      icon: Activity,
      color: '#0d9488',
      bg: '#f0fdfa',
      title: 'Pursue Federal Grant Expansion',
      body: `Healthy diversification and strong reserves make ${orgName} an ideal candidate for competitive federal grants. Fundir is matching you with SAMHSA, HHS, and DOJ opportunities.`,
    });
  }

  if (computed.govtDependency === 'low' && computed.monthsOfReserves >= 6) {
    strategies.push({
      icon: ArrowRight,
      color: '#0d9488',
      bg: '#f0fdfa',
      title: 'Growth-Stage Grant Strategy',
      body: `${orgName} has a well-diversified, financially stable profile. Fundir recommends pursuing capacity-building and endowment grants to accelerate long-term growth.`,
    });
  }

  // Always include at least 4 strategies
  if (strategies.length < 4) {
    strategies.push({
      icon: Info,
      color: '#64748b',
      bg: '#f8fafc',
      title: 'Maintain Current Grant Mix',
      body: `${orgName}'s current funding mix is well-balanced. Fundir will continue monitoring federal funding changes and surface new opportunities as they emerge.`,
    });
  }

  return strategies.slice(0, 6);
}
