export const dynamic = 'force-dynamic';

import { AppShell } from '@/components/app-shell';
import Link from 'next/link';
import {
  BarChart3, TrendingDown, Shield, AlertTriangle,
  DollarSign, Clock, Info, CheckCircle,
  Users, MapPin, Target, Landmark, ChevronRight,
  Activity, Zap,
} from 'lucide-react';
import {
  CYC_INCOME_STATEMENT, CYC_BALANCE_SHEET, CYC_LIQUIDITY,
  CYC_REVENUE_TREND, CYC_INTELLIGENCE_FLAGS, CYC_FEDERAL_PROGRAMS,
  CYC_LEADERSHIP, CYC_SITES, CYC_IMPACT, CYC_BOARD,
  CYC_CAPITAL_CAMPAIGN, CYC_ENDOWMENT, CYC_PROGRAM_ANALYSIS,
} from '@/lib/cyc-live-data';

// ── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(decimals)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toLocaleString()}`;
}

function fmtFull(n: number): string {
  return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString();
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[16px] font-bold text-[#0f172a]">{title}</h2>
      {sub && <p className="text-[12px] text-[#64748b] mt-0.5">{sub}</p>}
    </div>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, color, bg, negative = false,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string; negative?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-white/10 p-4 backdrop-blur-sm"
      style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
        <div className="w-6 h-6 rounded-[5px] flex items-center justify-center"
          style={{ background: bg }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div className={`text-[24px] font-bold leading-none mb-1 ${negative ? 'text-[#f87171]' : 'text-white'}`}>
        {value}
      </div>
      {sub && <p className="text-[11px] text-[#64748b]">{sub}</p>}
    </div>
  );
}

function IntelligenceFlag({
  severity, headline, detail, metric, action, category,
}: {
  severity: 'critical' | 'warning' | 'info';
  headline: string; detail: string; metric: string; action: string; category: string;
}) {
  const isCrit = severity === 'critical';
  const isWarn = severity === 'warning';
  const bg     = isCrit ? '#fef2f2' : isWarn ? '#fffbeb' : '#f0f9ff';
  const border = isCrit ? '#fecaca' : isWarn ? '#fde68a' : '#bae6fd';
  const color  = isCrit ? '#dc2626' : isWarn ? '#92400e' : '#0369a1';
  const tagBg  = isCrit ? '#dc2626' : isWarn ? '#d97706' : '#0284c7';

  return (
    <div className="rounded-[10px] border p-4" style={{ background: bg, borderColor: border }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isCrit ? '#dc2626' : isWarn ? '#d97706' : '#0284c7' }} />
          <p className="text-[13px] font-bold" style={{ color }}>{headline}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: tagBg }}>
            {category.toUpperCase()}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-[#475569] leading-relaxed mb-2">{detail}</p>
      <div className="flex items-start gap-2 mt-2 pt-2 border-t" style={{ borderColor: border }}>
        <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color }} />
        <p className="text-[11px] font-medium leading-relaxed" style={{ color }}>{action}</p>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap text-white" style={{ background: tagBg }}>
          {metric}
        </span>
      </div>
    </div>
  );
}

function LineItem({
  label, value, prior, highlight = false, negative = false,
}: {
  label: string; value: number; prior?: number;
  highlight?: boolean; negative?: boolean;
}) {
  const delta = prior && prior !== 0 ? ((value - prior) / Math.abs(prior)) * 100 : null;
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-[6px] ${highlight ? 'bg-[#f8fafc] font-semibold' : ''}`}>
      <span className={`text-[12px] ${highlight ? 'text-[#0f172a]' : 'text-[#64748b]'}`}>{label}</span>
      <div className="flex items-center gap-3">
        {prior !== undefined && delta !== null && (
          <span className={`text-[10px] font-medium ${delta >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
        {prior !== undefined && (
          <span className="text-[11px] text-[#94a3b8] tabular-nums font-mono w-24 text-right">
            {prior < 0 ? `(${fmt(Math.abs(prior))})` : fmt(prior)}
          </span>
        )}
        <span className={`text-[13px] font-${highlight ? 'bold' : 'semibold'} tabular-nums font-mono w-24 text-right ${negative || value < 0 ? 'text-[#dc2626]' : highlight ? 'text-[#0f172a]' : 'text-[#475569]'}`}>
          {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
        </span>
      </div>
    </div>
  );
}

function ProgramCard({
  title, pct, expense, govt, gap, costPer, perLabel, note, trend,
}: {
  title: string; pct: number; expense: number; govt: number;
  gap?: number; costPer: number; perLabel: string; note: string; trend?: number;
}) {
  const govtCoverage = (govt / expense) * 100;
  return (
    <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[13px] font-bold text-[#0f172a]">{title}</p>
          <p className="text-[11px] text-[#64748b]">{pct}% of total program expenses</p>
        </div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4]">
          {fmt(expense)}
        </span>
      </div>
      <div className="space-y-2.5 mb-3">
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-[#64748b]">Govt contract coverage</span>
            <span className="font-bold text-[#0f172a]">{govtCoverage.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${Math.min(govtCoverage, 100)}%`,
              background: govtCoverage >= 90 ? '#16a34a' : govtCoverage >= 60 ? '#d97706' : '#dc2626',
            }} />
          </div>
        </div>
        {gap !== undefined && (
          <div className="flex justify-between text-[11px]">
            <span className="text-[#64748b]">Funding gap (private needed)</span>
            <span className="font-bold text-[#dc2626]">{fmt(gap)}</span>
          </div>
        )}
        <div className="flex justify-between text-[11px]">
          <span className="text-[#64748b]">Cost {perLabel}</span>
          <span className="font-bold text-[#0f172a]">{fmtFull(costPer)}</span>
        </div>
        {trend !== undefined && (
          <div className="flex justify-between text-[11px]">
            <span className="text-[#64748b]">Expenses vs prior year</span>
            <span className={`font-bold ${trend > 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      <p className="text-[11px] text-[#64748b] leading-relaxed border-t border-[#f1f5f9] pt-2 mt-2">{note}</p>
    </div>
  );
}

function SiteCard({
  name, neighborhood, address, programs, agesServed, note, isNewest,
}: typeof CYC_SITES[number]) {
  return (
    <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[13px] font-bold text-[#0f172a] leading-snug">{name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 text-[#94a3b8]" />
            <span className="text-[11px] text-[#64748b]">{neighborhood}</span>
          </div>
        </div>
        {isNewest && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] flex-shrink-0">
            NEWEST
          </span>
        )}
      </div>
      <p className="text-[11px] text-[#94a3b8] mb-2">{address}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {programs.map(p => (
          <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0fdfa] text-[#0d9488] border border-[#99f6e4]">{p}</span>
        ))}
      </div>
      <p className="text-[10px] text-[#64748b]">Ages: {agesServed}</p>
      {note && <p className="text-[10px] text-[#94a3b8] mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const inc  = CYC_INCOME_STATEMENT;
  const bal  = CYC_BALANCE_SHEET;
  const liq  = CYC_LIQUIDITY;
  const camp = CYC_CAPITAL_CAMPAIGN;
  const end  = CYC_ENDOWMENT;
  const bd   = CYC_BOARD;
  const prog = CYC_PROGRAM_ANALYSIS;

  const critFlags = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'critical');
  const warnFlags = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'warning');
  const infoFlags = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'info');

  const govtPct = parseFloat(((inc.revenue.governmentFeesGrants / inc.revenue.totalRevenue) * 100).toFixed(1));

  return (
    <AppShell>

      {/* ── Dark Hero ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 right-1/4 w-96 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />

        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6 mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-[#0d9488]" />
                <span className="text-[11px] font-bold text-[#0d9488] uppercase tracking-widest">Org Intelligence · Financials</span>
              </div>
              <h1 className="text-[26px] font-bold text-white leading-tight">
                Chicago Youth Centers
              </h1>
              <p className="text-[#94a3b8] text-[13px] mt-1">
                Founded 1956 · {CYC_IMPACT.yearsInOperation} years serving Chicago · {CYC_SITES.length} centers · EIN 36-2196050
              </p>
              <p className="text-[#64748b] text-[12px] mt-1 max-w-xl">
                Empowering Chicago youth and families through early childhood education, out-of-school time
                programs, and teen leadership development in under-resourced neighborhoods.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#f0fdf4]/10 text-[#4ade80] border border-[#4ade80]/20">
                ★★★★ Charity Navigator
              </span>
              <span className="px-3 py-1.5 rounded-full text-[11px] font-bold text-[#f87171] border border-[#f87171]/20"
                style={{ background: 'rgba(239,68,68,0.10)' }}>
                FY2025 Audited · {inc.netChange < 0 ? 'Operating Deficit' : 'Operating Surplus'}
              </span>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Revenue"     value={fmt(inc.revenue.totalRevenue)}
              sub="FY2025 (YE Jun 30, 2025)"
              icon={DollarSign} color="#0d9488" bg="rgba(13,148,136,0.25)"
            />
            <KpiCard
              label="Net Change"        value={`(${fmt(Math.abs(inc.netChange))})`}
              sub="Operating deficit — reversed from +$1M FY2024"
              icon={TrendingDown} color="#f87171" bg="rgba(239,68,68,0.20)" negative
            />
            <KpiCard
              label="Liquidity"         value={`${liq.monthsOfLiquidity}mo`}
              sub={`Net unrestricted · ${fmt(liq.netUnrestrictedLiquidity)}`}
              icon={Clock} color="#fbbf24" bg="rgba(251,191,36,0.20)"
            />
            <KpiCard
              label="Govt Dependency"   value={`${govtPct}%`}
              sub="Critical threshold · Head Start 61%"
              icon={Shield} color="#f87171" bg="rgba(239,68,68,0.20)"
            />
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="px-8 py-6 max-w-7xl mx-auto space-y-8">

        {/* ── Intelligence Flags ── */}
        <section>
          <SectionHeader
            title="Intelligence Flags"
            sub={`${critFlags.length} critical · ${warnFlags.length} warning · ${infoFlags.length} informational — derived from FY2025 audited statements`}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {[...critFlags, ...warnFlags, ...infoFlags].map((f, i) => (
              <IntelligenceFlag key={i} {...f} />
            ))}
          </div>
        </section>

        {/* ── Income Statement ── */}
        <section>
          <SectionHeader
            title="Statement of Activities — FY2025 vs FY2024"
            sub="Year ended June 30, 2025 · Source: Kearney & Company audited financials"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Revenue */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between">
                <p className="text-[12px] font-bold text-[#0f172a] uppercase tracking-wide">Revenue</p>
                <div className="flex items-center gap-4 text-[10px] text-[#94a3b8]">
                  <span>FY2024</span>
                  <span className="font-bold text-[#0f172a]">FY2025</span>
                </div>
              </div>
              <div className="p-3 space-y-0.5">
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1.5">Public Support</p>
                <LineItem label="Contributions (cash)" value={inc.revenue.contributionsCash} prior={inc.revenue.contributionsCashPrior} />
                <LineItem label="Contributions (in-kind)" value={inc.revenue.contributionsInKind} />
                <LineItem label="Special events (net)" value={inc.revenue.specialEventsNet} />
                <LineItem label="Total Public Support" value={inc.revenue.totalPublicSupport} highlight />

                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1.5 mt-2">Direct Program Revenue</p>
                <LineItem label="Government fees & grants" value={inc.revenue.governmentFeesGrants} prior={inc.revenue.governmentFeesGrantsPrior} />
                <LineItem label="Program service fees" value={inc.revenue.programServiceFees} />
                <LineItem label="Total Program Revenue" value={inc.revenue.totalDirectProgram} highlight />

                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1.5 mt-2">Other Income</p>
                <LineItem label="Investment return (net)" value={inc.revenue.investmentReturnNet} />
                <LineItem label="Realized gains" value={inc.revenue.realizedGains} />
                <LineItem label="Unrealized gains" value={inc.revenue.unrealizedGains} />
                <LineItem label="Total Revenue" value={inc.revenue.totalRevenue} prior={inc.revenue.totalRevenuePrior} highlight />
              </div>
            </div>

            {/* Expenses + Net */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between">
                  <p className="text-[12px] font-bold text-[#0f172a] uppercase tracking-wide">Expenses</p>
                  <div className="flex items-center gap-4 text-[10px] text-[#94a3b8]">
                    <span>FY2024</span>
                    <span className="font-bold text-[#0f172a]">FY2025</span>
                  </div>
                </div>
                <div className="p-3 space-y-0.5">
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1.5">Program Services</p>
                  <LineItem label="Early Childhood Education" value={inc.expenses.earlyChildhoodEducation} prior={inc.expenses.earlyChildhoodPrior} />
                  <LineItem label="School Age Child Dev." value={inc.expenses.schoolAgeChildDev} prior={inc.expenses.schoolAgePrior} />
                  <LineItem label="Teen Leadership Dev." value={inc.expenses.teenLeadershipDev} prior={inc.expenses.teenPrior} />
                  <LineItem label="Total Program Services" value={inc.expenses.totalProgramServices} prior={inc.expenses.totalProgramPrior} highlight />
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1.5 mt-2">Supporting Services</p>
                  <LineItem label="Management & General" value={inc.expenses.managementGeneral} />
                  <LineItem label="Development & Fundraising" value={inc.expenses.developmentFundraising} />
                  <LineItem label="Total Expenses" value={inc.expenses.totalExpenses} prior={inc.expenses.totalExpensesPrior} highlight />
                </div>
              </div>

              {/* Net change highlight */}
              <div className="rounded-[10px] border p-4"
                style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-bold text-[#dc2626]">Net Change in Assets</p>
                  <p className="text-[20px] font-bold text-[#dc2626] font-mono">({fmt(Math.abs(inc.netChange))})</p>
                </div>
                <p className="text-[11px] text-[#64748b]">
                  FY2025 deficit vs +{fmt(inc.netChangePrior)} surplus in FY2024.
                  Revenue fell {fmt(inc.revenue.totalRevenuePrior - inc.revenue.totalRevenue)} while expenses grew {fmt(inc.expenses.totalExpenses - inc.expenses.totalExpensesPrior)}.
                </p>
              </div>

              {/* Program expense ratio */}
              <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-4">
                <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Program Expense Ratio</p>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-[32px] font-bold text-[#16a34a]">86.0%</span>
                  <span className="text-[11px] text-[#64748b] mb-1">★★★★ Charity Navigator</span>
                </div>
                <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-[#16a34a]" style={{ width: '86%' }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div><p className="font-bold text-[#16a34a]">86.0%</p><p className="text-[#94a3b8]">Programs</p></div>
                  <div><p className="font-bold text-[#64748b]">10.5%</p><p className="text-[#94a3b8]">Mgmt & G</p></div>
                  <div><p className="font-bold text-[#64748b]">3.5%</p><p className="text-[#94a3b8]">Fundraising</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Federal Funding Risk ── */}
        <section>
          <SectionHeader
            title="Federal Funding Risk Matrix"
            sub="CYC receives 74.6% of revenue from government contracts — breakdown and risk assessment by program"
          />
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                  {['Federal Program', 'ALN', 'Est. Amount', '% Revenue', 'Risk', 'Program Impact'].map((h, i) => (
                    <th key={h} className={`py-2.5 px-4 text-[11px] font-bold text-[#94a3b8] uppercase tracking-wide ${i === 0 ? 'text-left' : i >= 4 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CYC_FEDERAL_PROGRAMS.map(p => {
                  const isCrit = p.risk === 'critical';
                  return (
                    <tr key={p.name} className="border-t border-[#f8fafc] hover:bg-[#f8fafc] transition-colors">
                      <td className="py-3 px-4">
                        <p className="text-[13px] font-semibold text-[#0f172a]">{p.name}</p>
                        <p className="text-[10px] text-[#64748b] mt-0.5 max-w-xs">{p.riskReason}</p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-[11px] font-mono text-[#94a3b8]">{p.aln}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-[13px] font-bold font-mono text-[#0f172a]">{fmt(p.estimatedAmount)}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-[13px] font-bold" style={{ color: isCrit ? '#dc2626' : '#d97706' }}>
                          {p.pctOfRevenue}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${isCrit ? 'bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]' : 'bg-[#fffbeb] text-[#d97706] border border-[#fde68a]'}`}>
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {isCrit ? 'CRITICAL' : 'MODERATE'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] text-[#475569]">{p.programImpact}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]">
                  <td className="py-3 px-4 text-[12px] font-bold text-[#0f172a]">Total Federal/State</td>
                  <td />
                  <td className="py-3 px-4 text-right text-[13px] font-bold text-[#0f172a] font-mono">{fmt(inc.revenue.governmentFeesGrants)}</td>
                  <td className="py-3 px-4 text-right text-[13px] font-bold text-[#dc2626]">{govtPct}%</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ── Balance Sheet ── */}
        <section>
          <SectionHeader
            title="Balance Sheet — FY2025 vs FY2024"
            sub="Statement of Financial Position · Year ended June 30, 2025"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Assets */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f0fdfa]">
                <p className="text-[12px] font-bold text-[#0d9488]">ASSETS</p>
                <p className="text-[11px] text-[#64748b]">Total: {fmtFull(bal.assets.totalAssets)}</p>
              </div>
              <div className="p-3 space-y-0.5">
                <LineItem label="Cash & equivalents" value={bal.assets.cash} prior={bal.assets.cashPrior} />
                <LineItem label="Govt receivables" value={bal.assets.accountsReceivableGovt} />
                <LineItem label="Other receivables" value={bal.assets.accountsReceivableOther} />
                <LineItem label="Pledges receivable (net)" value={bal.assets.pledgesReceivableNet} />
                <LineItem label="Investments" value={bal.assets.investments} prior={bal.assets.investmentsPrior} />
                <LineItem label="Property & equipment (net)" value={bal.assets.propertyEquipmentNet} />
                <LineItem label="ROU — operating leases" value={bal.assets.rightOfUseOperating} />
                <LineItem label="Real estate held for sale" value={bal.assets.realEstateHeldForSale} />
                <LineItem label="Total Assets" value={bal.assets.totalAssets} prior={bal.assets.totalAssetsPrior} highlight />
              </div>
            </div>

            {/* Liabilities */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#fef2f2]">
                <p className="text-[12px] font-bold text-[#dc2626]">LIABILITIES</p>
                <p className="text-[11px] text-[#64748b]">Total: {fmtFull(bal.liabilities.totalLiabilities)}</p>
              </div>
              <div className="p-3 space-y-0.5">
                <LineItem label="Accounts payable" value={bal.liabilities.accountsPayable} />
                <LineItem label="Accrued payroll" value={bal.liabilities.accruedPayroll} />
                <LineItem label="Deferred revenue" value={bal.liabilities.deferredRevenue} />
                <LineItem label="Line of credit (BMO Harris)" value={bal.liabilities.lineOfCredit} />
                <LineItem label="Operating lease liability" value={bal.liabilities.leaseLiabilityOperating} />
                <LineItem label="Total Liabilities" value={bal.liabilities.totalLiabilities} prior={bal.liabilities.totalLiabilitiesPrior} highlight />
              </div>
              <div className="px-4 py-3 border-t border-[#f1f5f9] bg-[#fffbeb]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#d97706]" />
                  <p className="text-[11px] text-[#92400e]">
                    <strong>Line of credit drawn for first time</strong> — $455K of $1.5M limit outstanding at year-end (FY2024: $0).
                  </p>
                </div>
              </div>
            </div>

            {/* Net Assets */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f0fdf4]">
                <p className="text-[12px] font-bold text-[#16a34a]">NET ASSETS</p>
                <p className="text-[11px] text-[#64748b]">Total: {fmtFull(bal.netAssets.totalNetAssets)}</p>
              </div>
              <div className="p-3 space-y-0.5">
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1">Without Donor Restrictions</p>
                <LineItem label="Undesignated" value={bal.netAssets.unrestrictedUndesignated} />
                <LineItem label="Board-designated (investments)" value={bal.netAssets.boardDesignatedInvestment} />
                <LineItem label="Invested in property" value={bal.netAssets.investedInPropertyEquip} />
                <LineItem label="Subtotal" value={bal.netAssets.totalWithoutRestriction} prior={bal.netAssets.totalWithoutRestrictionPrior} highlight />
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest px-3 py-1 mt-2">With Donor Restrictions</p>
                <LineItem label="Time/purpose restricted" value={bal.netAssets.timePurposeRestricted} />
                <LineItem label="Endowment fund" value={bal.netAssets.endowmentFund} />
                <LineItem label="Subtotal" value={bal.netAssets.totalWithRestriction} prior={bal.netAssets.totalWithRestrictionPrior} highlight />
                <LineItem label="Total Net Assets" value={bal.netAssets.totalNetAssets} prior={bal.netAssets.totalNetAssetsPrior} highlight />
              </div>
            </div>
          </div>

          {/* Liquidity box */}
          <div className="mt-4 bg-white rounded-xl border border-[#e2e8f0] p-5">
            <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-4">Liquidity & Availability (Note 2) — How Much Cash Can CYC Actually Use?</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {([
                { label: 'Gross Financial Assets', value: liq.grossFinancialAssets, color: '#0f172a' },
                { label: 'Less: Unavailable (endowment + restricted)', value: liq.unavailableWithinOneYear, color: '#dc2626' },
                { label: 'Available for General Use', value: liq.availableForGeneralUse, color: '#0d9488' },
                { label: 'Net Unrestricted Liquidity', value: liq.netUnrestrictedLiquidity, color: '#d97706' },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 rounded-[8px] bg-[#f8fafc] border border-[#f1f5f9]">
                  <p className="text-[11px] text-[#64748b] mb-1.5 leading-snug">{label}</p>
                  <p className="text-[18px] font-bold font-mono" style={{ color }}>
                    {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-6 text-[11px]">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#d97706]" />
                <span className="text-[#64748b]"><strong className="text-[#0f172a]">{liq.monthsOfLiquidity} months</strong> of operating expenses covered</span>
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-[#0d9488]" />
                <span className="text-[#64748b]">LOC available: <strong className="text-[#0f172a]">{fmt(liq.lineOfCreditAvailable)}</strong> of $1.5M limit remaining</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-[#6366f1]" />
                <span className="text-[#64748b]">Conditional grant pipeline: <strong className="text-[#0f172a]">{fmt(liq.unconditionalGrantPipeline)}</strong> (unrecognized)</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3-Year Revenue Trend ── */}
        <section>
          <SectionHeader
            title="3-Year Revenue Trend"
            sub="FY2023–FY2025 · Post-COVID normalization · Operating results"
          />
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                  {['Fiscal Year', 'Total Revenue', 'Total Expenses', 'Surplus / (Deficit)', 'YoY Revenue Change', 'Context'].map((h, i) => (
                    <th key={h} className={`py-2.5 px-4 text-[11px] font-bold text-[#94a3b8] uppercase tracking-wide ${i === 0 || i === 5 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CYC_REVENUE_TREND.map((t, i) => {
                  const prev  = i > 0 ? CYC_REVENUE_TREND[i - 1] : null;
                  const delta = prev ? ((t.revenue - prev.revenue) / prev.revenue) * 100 : null;
                  return (
                    <tr key={t.year} className={`border-t border-[#f8fafc] ${i === CYC_REVENUE_TREND.length - 1 ? 'bg-[#f8fafc] font-semibold' : ''}`}>
                      <td className="py-3 px-4 text-[13px] font-semibold text-[#0f172a]">{t.year}</td>
                      <td className="py-3 px-4 text-right text-[13px] font-mono font-semibold text-[#0f172a]">{fmt(t.revenue)}</td>
                      <td className="py-3 px-4 text-right text-[13px] font-mono text-[#475569]">{fmt(t.expenses)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-[13px] font-bold font-mono ${t.surplus < 0 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                          {t.surplus < 0 ? `(${fmt(Math.abs(t.surplus))})` : `+${fmt(t.surplus)}`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {delta !== null ? (
                          <span className={`text-[12px] font-bold ${delta >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                          </span>
                        ) : <span className="text-[#94a3b8] text-[11px]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[#64748b]">{t.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Program Analysis ── */}
        <section>
          <SectionHeader
            title="Program Analysis — FY2025"
            sub="Cost efficiency, government coverage, and funding gaps by division"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ProgramCard
              title="Early Childhood Education"
              pct={prog.earlyChildhood.pctOfProgramExpenses}
              expense={prog.earlyChildhood.expenseFY2025}
              govt={prog.earlyChildhood.revenueFromGovt}
              costPer={prog.earlyChildhood.costPerChild}
              perLabel="per child"
              note={prog.earlyChildhood.efficiencyNote}
              trend={prog.earlyChildhood.growthVsPrior}
            />
            <ProgramCard
              title="School Age Child Development"
              pct={prog.schoolAge.pctOfProgramExpenses}
              expense={prog.schoolAge.expenseFY2025}
              govt={prog.schoolAge.revenueFromGovt}
              gap={prog.schoolAge.fundingGap}
              costPer={prog.schoolAge.costPerChild}
              perLabel="per child"
              note={prog.schoolAge.note}
            />
            <ProgramCard
              title="Teen Leadership Development"
              pct={prog.teenLeadership.pctOfProgramExpenses}
              expense={prog.teenLeadership.expenseFY2025}
              govt={prog.teenLeadership.revenueFromGovt}
              gap={prog.teenLeadership.fundingGap}
              costPer={prog.teenLeadership.costPerTeen}
              perLabel="per teen"
              note={prog.teenLeadership.note}
            />
          </div>
        </section>

        {/* ── Capital Campaign + Endowment ── */}
        <section>
          <SectionHeader title="Capital Campaign & Endowment" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Capital Campaign */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-[#6366f1]" />
                <h3 className="text-[14px] font-bold text-[#0f172a]">{camp.name}</h3>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-[#64748b]">Campaign progress</span>
                  <span className="font-bold text-[#0f172a]">{fmt(camp.pledgesInBook)} / {fmt(camp.goal)}</span>
                </div>
                <div className="h-3 bg-[#f1f5f9] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(camp.pledgesInBook / camp.goal) * 100}%`,
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  }} />
                </div>
                <p className="text-[10px] text-[#94a3b8] mt-1">{((camp.pledgesInBook / camp.goal) * 100).toFixed(1)}% of {fmt(camp.goal)} goal pledged</p>
              </div>
              <div className="space-y-2">
                {camp.pledgeDueDates.map(pd => (
                  <div key={pd.year} className="flex justify-between text-[12px]">
                    <span className="text-[#64748b]">{pd.year} pledge payments</span>
                    <span className="font-semibold text-[#0f172a] font-mono">{fmtFull(pd.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#f1f5f9] text-[11px] text-[#64748b]">
                Board member pledges: {fmtFull(camp.boardPledgesIncluded)} included ·
                FY2025 released to income: {fmtFull(camp.releasedToDate)}
              </div>
            </div>

            {/* Endowment */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Landmark className="w-4 h-4 text-[#0d9488]" />
                <h3 className="text-[14px] font-bold text-[#0f172a]">Endowment Fund</h3>
                <span className="text-[11px] text-[#94a3b8]">5% spending policy</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                  <p className="text-[10px] text-[#94a3b8] mb-1">Total Endowment</p>
                  <p className="text-[18px] font-bold text-[#0f172a]">{fmt(end.totalEndowment)}</p>
                  <p className="text-[10px] text-[#16a34a]">+{fmt(end.totalEndowment - end.priorYearTotal)} from FY2024</p>
                </div>
                <div className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                  <p className="text-[10px] text-[#94a3b8] mb-1">FY2025 Investment Return</p>
                  <p className="text-[18px] font-bold text-[#16a34a]">{fmt(end.investmentReturnFY2025)}</p>
                  <p className="text-[10px] text-[#64748b]">{fmt(end.expenditures)} distributed</p>
                </div>
              </div>
              <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Named Funds</p>
              <div className="space-y-1.5">
                {end.namedFunds.map(f => (
                  <div key={f.name} className="flex justify-between text-[12px]">
                    <span className="text-[#475569]">{f.name}</span>
                    <span className="font-mono font-semibold text-[#0f172a]">{fmtFull(f.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Leadership Team ── */}
        <section>
          <SectionHeader
            title="Leadership Team"
            sub="Compensation from FY2025 audited financial statements · Schedule J"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CYC_LEADERSHIP.map(leader => (
              <div key={leader.name} className="bg-white rounded-[10px] border border-[#e2e8f0] p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[14px] font-bold text-[#0f172a]">{leader.name}</p>
                    <p className="text-[11px] text-[#0d9488] font-semibold">{leader.title}</p>
                  </div>
                  {leader.salary && (
                    <span className="text-[12px] font-bold text-[#0f172a] bg-[#f8fafc] px-2 py-1 rounded-[6px] border border-[#e2e8f0] font-mono">
                      {fmtFull(leader.salary)}
                    </span>
                  )}
                </div>
                {leader.tenure && (
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#f0fdfa] text-[#0d9488] rounded border border-[#99f6e4] font-bold">
                      {leader.tenure}-year tenure
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-[#64748b] leading-relaxed">{leader.bio}</p>
                {leader.note && (
                  <p className="text-[10px] text-[#94a3b8] mt-2 italic leading-relaxed">{leader.note}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Board Intelligence ── */}
        <section>
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-[#0d9488]" />
              <h2 className="text-[15px] font-bold text-[#0f172a]">Board Intelligence</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] font-bold">
                {bd.totalMembers} members
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {([
                { label: 'Board Chair',        value: bd.chair },
                { label: 'Vice Chair',         value: bd.viceChair },
                { label: 'Secretary',          value: bd.secretary },
                { label: 'Treasurer',          value: bd.treasurer },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} className="p-3 bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                  <p className="text-[10px] text-[#94a3b8] mb-0.5">{label}</p>
                  <p className="text-[13px] font-semibold text-[#0f172a]">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-[8px] bg-[#f0fdf4] border border-[#bbf7d0]">
                <p className="text-[11px] text-[#64748b] mb-1">Direct Board Contributions</p>
                <p className="text-[20px] font-bold text-[#16a34a]">{fmtFull(bd.boardGivingFY2025.directContributions)}</p>
              </div>
              <div className="p-4 rounded-[8px] bg-[#f0fdf4] border border-[#bbf7d0]">
                <p className="text-[11px] text-[#64748b] mb-1">Corporate Sponsorships (via Board)</p>
                <p className="text-[20px] font-bold text-[#16a34a]">{fmtFull(bd.boardGivingFY2025.affiliatedCompanySponsorships)}</p>
              </div>
              <div className="p-4 rounded-[8px] bg-[#f0fdf4] border border-[#bbf7d0]">
                <p className="text-[11px] text-[#64748b] mb-1">Total Board-Sourced Revenue</p>
                <p className="text-[20px] font-bold text-[#16a34a]">{fmtFull(bd.boardGivingFY2025.totalBoardSourced)}</p>
                <p className="text-[10px] text-[#64748b]">{bd.boardGivingFY2025.pctOfTotalRevenue}% of total revenue</p>
              </div>
            </div>
            <p className="text-[11px] text-[#64748b] mt-3">
              Auxiliary board: {bd.auxiliaryBoard} · Strong board engagement relative to comparable nonprofits.
            </p>
          </div>
        </section>

        {/* ── Sites ── */}
        <section>
          <SectionHeader
            title="Service Sites"
            sub={`${CYC_SITES.length} centers across Chicago · ${CYC_IMPACT.youthServedTotal.toLocaleString()} youth served FY2024`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CYC_SITES.map(site => (
              <SiteCard key={site.name} {...site} />
            ))}
          </div>
        </section>

        {/* ── Impact ── */}
        <section>
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-4 h-4 text-[#16a34a]" />
              <h2 className="text-[15px] font-bold text-[#0f172a]">Program Outcomes — FY2024 Stewardship Report</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Early Learning ({CYC_IMPACT.earlyLearningParticipants} participants)</p>
                <div className="space-y-2">
                  {CYC_IMPACT.outcomes.earlyLearning.map(o => (
                    <div key={o.metric} className="flex items-center justify-between">
                      <span className="text-[11px] text-[#475569]">{o.metric}</span>
                      <span className="text-[12px] font-bold text-[#16a34a]">{o.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Out-of-School Time ({CYC_IMPACT.ostParticipants} participants)</p>
                <div className="space-y-2">
                  {CYC_IMPACT.outcomes.outOfSchoolTime.map(o => (
                    <div key={o.metric} className="flex items-center justify-between">
                      <span className="text-[11px] text-[#475569]">{o.metric}</span>
                      <span className="text-[12px] font-bold text-[#16a34a]">{o.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-widest mb-3">Org Overview</p>
                <div className="space-y-3">
                  {([
                    { label: 'Total Youth Served', value: CYC_IMPACT.youthServedTotal.toLocaleString() },
                    { label: 'Years in Operation', value: `${CYC_IMPACT.yearsInOperation} years` },
                    { label: 'Charity Navigator', value: `${CYC_IMPACT.charityNavigatorRating}/4 stars` },
                    { label: 'Teen Participants', value: CYC_IMPACT.teenParticipants.toLocaleString() },
                  ] as { label: string; value: string }[]).map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-[12px] text-[#64748b]">{label}</span>
                      <span className="text-[13px] font-bold text-[#0f172a]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-1 pb-4">
          <p className="text-[11px] text-[#94a3b8]">
            Source: FY2025 Audited Financial Statements · Kearney &amp; Company, P.C. ·
            Audit issued January 5, 2026 · chicagoyouthcenters.org
          </p>
          <Link href="/dashboard"
            className="flex items-center gap-1 text-[11px] text-[#0d9488] hover:underline">
            Back to dashboard <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

      </div>
    </AppShell>
  );
}
