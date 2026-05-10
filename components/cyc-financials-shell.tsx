'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3, TrendingDown, Shield, AlertTriangle,
  DollarSign, Clock, CheckCircle, Users, MapPin,
  Target, Landmark, Activity, Zap,
  ChevronRight, TrendingUp, Brain, Library, Wand2,
} from 'lucide-react';
import {
  CYC_INCOME_STATEMENT, CYC_BALANCE_SHEET, CYC_LIQUIDITY,
  CYC_REVENUE_TREND, CYC_INTELLIGENCE_FLAGS, CYC_FEDERAL_PROGRAMS,
  CYC_LEADERSHIP, CYC_SITES, CYC_IMPACT, CYC_BOARD,
  CYC_CAPITAL_CAMPAIGN, CYC_ENDOWMENT, CYC_PROGRAM_ANALYSIS,
} from '@/lib/cyc-live-data';
import {
  Card, CardHeader, SectionTitle,
  AITab, DocumentLibraryTab, StrategyBriefTab,
  COMMON_TABS, type CommonTab,
} from './financials-shell';

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number, dec = 1): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(a / 1_000_000).toFixed(dec)}M`;
  if (a >= 1_000)     return `$${(a / 1_000).toFixed(0)}K`;
  return `$${a.toLocaleString()}`;
}
function fmtFull(n: number): string {
  return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString();
}

// ── Health score ──────────────────────────────────────────────────────────────
function computeHealthScore(): number {
  const inc = CYC_INCOME_STATEMENT;
  const liq = CYC_LIQUIDITY;
  let score = 50;
  const govtPct = (inc.revenue.governmentFeesGrants / inc.revenue.totalRevenue) * 100;
  if (govtPct > 75) score -= 15;
  else if (govtPct > 60) score -= 7;
  else if (govtPct < 40) score += 12;
  if (liq.monthsOfLiquidity >= 6)      score += 18;
  else if (liq.monthsOfLiquidity >= 3) score += 8;
  else if (liq.monthsOfLiquidity < 2)  score -= 12;
  if (inc.netChange > 0) score += 14;
  else if (inc.netChange < -inc.revenue.totalRevenue * 0.03) score -= 10;
  else score -= 3;
  const progRatio = (inc.expenses.totalProgramServices / inc.expenses.totalExpenses) * 100;
  if (progRatio > 85) score += 10;
  else if (progRatio > 75) score += 4;
  score += CYC_IMPACT.charityNavigatorRating * 2;
  return Math.max(10, Math.min(99, Math.round(score)));
}
const HEALTH_SCORE = computeHealthScore();

// ── Health gauge SVG ──────────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const R = 36, cx = 50, cy = 56;
  const fromDeg = -220, toDeg = 40;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (from: number, to: number) => {
    const x1 = cx + R * Math.cos(toRad(from));
    const y1 = cy + R * Math.sin(toRad(from));
    const x2 = cx + R * Math.cos(toRad(to));
    const y2 = cy + R * Math.sin(toRad(to));
    return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const filled = fromDeg + (score / 100) * (toDeg - fromDeg);
  const color  = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';
  const label  = score >= 70 ? 'Strong' : score >= 45 ? 'Needs Attention' : 'Critical';
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28">
      <path d={arc(fromDeg, toDeg)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} strokeLinecap="round" />
      <path d={arc(fromDeg, filled)} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <text x={50} y={54} textAnchor="middle" fill="white" fontSize={20} fontWeight="700" fontFamily="monospace">{score}</text>
      <text x={50} y={66} textAnchor="middle" fill="#475569" fontSize={7}>{label}</text>
    </svg>
  );
}

// ── Revenue sparkline bars ────────────────────────────────────────────────────
function RevenueBars() {
  const max = Math.max(...CYC_REVENUE_TREND.map(t => t.revenue));
  return (
    <div className="flex items-end gap-3" style={{ height: 100 }}>
      {CYC_REVENUE_TREND.map(t => {
        const barH = Math.round((t.revenue / max) * 64);
        const isPos = t.surplus >= 0;
        return (
          <div key={t.year} className="flex-1 flex flex-col items-center gap-1">
            <span className={`text-[10px] font-bold font-mono ${isPos ? 'text-green-400' : 'text-red-400'}`}>
              {isPos ? `+${fmt(t.surplus)}` : `(${fmt(Math.abs(t.surplus))})`}
            </span>
            <div className="w-full rounded-[4px] flex flex-col-reverse overflow-hidden"
              style={{ height: 60, background: 'rgba(255,255,255,0.04)' }}>
              <div className="w-full rounded-[4px]" style={{
                height: barH,
                background: isPos
                  ? 'linear-gradient(to top,rgba(13,148,136,0.8),rgba(13,148,136,0.25))'
                  : 'linear-gradient(to top,rgba(239,68,68,0.8),rgba(239,68,68,0.25))',
                borderTop: `2px solid ${isPos ? '#0d9488' : '#ef4444'}`,
              }} />
            </div>
            <span className="text-[10px] font-mono text-slate-400">{fmt(t.revenue)}</span>
            <span className="text-[9px] text-slate-600">{t.year}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Flag component ────────────────────────────────────────────────────────────
function Flag({
  severity, headline, detail, metric, action, category,
}: {
  severity: 'critical' | 'warning' | 'info';
  headline: string; detail: string; metric: string; action: string; category: string;
}) {
  const isCrit = severity === 'critical', isWarn = severity === 'warning';
  const color  = isCrit ? '#f87171' : isWarn ? '#fbbf24' : '#38bdf8';
  const bg     = isCrit ? 'rgba(239,68,68,0.07)' : isWarn ? 'rgba(251,191,36,0.07)' : 'rgba(56,189,248,0.07)';
  const border = isCrit ? 'rgba(239,68,68,0.22)' : isWarn ? 'rgba(251,191,36,0.22)' : 'rgba(56,189,248,0.22)';
  const tagBg  = isCrit ? '#dc2626' : isWarn ? '#d97706' : '#0284c7';
  return (
    <div className="rounded-[10px] border p-4" style={{ background: bg, borderColor: border }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
          <p className="text-[13px] font-bold" style={{ color }}>{headline}</p>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
          style={{ background: tagBg }}>{category.toUpperCase()}</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{detail}</p>
      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: border }}>
        <Zap className="w-3 h-3 flex-shrink-0" style={{ color }} />
        <p className="text-[11px] font-medium leading-relaxed" style={{ color }}>{action}</p>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
          style={{ background: tagBg }}>{metric}</span>
      </div>
    </div>
  );
}

// ── DRow component ────────────────────────────────────────────────────────────
function DRow({ label, value, prior, highlight = false }: {
  label: string; value: number; prior?: number; highlight?: boolean;
}) {
  const delta = prior && prior !== 0 ? ((value - prior) / Math.abs(prior)) * 100 : null;
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-[6px] ${highlight ? 'bg-white/[0.04] font-semibold' : ''}`}>
      <span className={`text-[12px] ${highlight ? 'text-slate-200' : 'text-slate-400'}`}>{label}</span>
      <div className="flex items-center gap-3">
        {delta !== null && (
          <span className={`text-[10px] font-medium ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
        {prior !== undefined && (
          <span className="text-[11px] text-slate-600 tabular-nums font-mono w-20 text-right">
            {prior < 0 ? `(${fmt(Math.abs(prior))})` : fmt(prior)}
          </span>
        )}
        <span className={`text-[13px] tabular-nums font-mono w-20 text-right ${value < 0 ? 'text-red-400' : highlight ? 'text-white font-bold' : 'text-slate-300'}`}>
          {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
        </span>
      </div>
    </div>
  );
}

// ── TAB: Overview ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const inc  = CYC_INCOME_STATEMENT;
  const liq  = CYC_LIQUIDITY;
  const prog = CYC_PROGRAM_ANALYSIS;
  const govtPct   = ((inc.revenue.governmentFeesGrants / inc.revenue.totalRevenue) * 100).toFixed(1);
  const critCount = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'critical').length;
  const warnCount = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'warning').length;
  const infoCount = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'info').length;
  const totalGap  = (prog.schoolAge.fundingGap ?? 0) + (prog.teenLeadership.fundingGap ?? 0);

  const kpis = [
    { label: 'Total Revenue',   value: fmt(inc.revenue.totalRevenue), sub: 'FY2025 (YE Jun 30)',         icon: DollarSign,  color: '#0d9488', bg: 'rgba(13,148,136,0.15)', neg: false },
    { label: 'Net Change',      value: `(${fmt(Math.abs(inc.netChange))})`, sub: 'Operating deficit',    icon: TrendingDown, color: '#f87171', bg: 'rgba(239,68,68,0.15)',  neg: true  },
    { label: 'Liquidity',       value: `${liq.monthsOfLiquidity}mo`,        sub: `${fmt(liq.netUnrestrictedLiquidity)} usable`, icon: Clock, color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', neg: false },
    { label: 'Govt Dependency', value: `${govtPct}%`,                       sub: 'Critical >50% threshold', icon: Shield,   color: '#f87171', bg: 'rgba(239,68,68,0.15)',  neg: true  },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="p-5 flex flex-col items-center justify-center gap-0.5 text-center">
          <HealthGauge score={HEALTH_SCORE} />
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Financial Health</p>
          <p className="text-[9px] text-slate-700 mt-0.5">Composite score · FY2025</p>
        </Card>
        <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(({ label, value, sub, icon: Icon, color, bg, neg }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
                <div className="w-6 h-6 rounded-[5px] flex items-center justify-center" style={{ background: bg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
              </div>
              <div className={`text-[22px] font-bold leading-none mb-1 ${neg ? 'text-red-400' : 'text-white'}`}>{value}</div>
              <p className="text-[10px] text-slate-600">{sub}</p>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[12px] font-bold text-slate-300">3-Year Revenue Trend</p>
            <p className="text-[11px] text-slate-600">FY2023–FY2025 · surplus / deficit annotated</p>
          </div>
          <span className="text-[10px] text-slate-600 italic max-w-[200px] text-right">
            {CYC_REVENUE_TREND[CYC_REVENUE_TREND.length - 1]?.note}
          </span>
        </div>
        <RevenueBars />
      </Card>

      <div>
        <SectionTitle
          title="Intelligence Flags"
          sub={`${critCount} critical · ${warnCount} warning · ${infoCount} informational — derived from FY2025 audited statements`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {CYC_INTELLIGENCE_FLAGS.map((f, i) => <Flag key={i} {...f} />)}
        </div>
      </div>

      <div className="flex items-center gap-3 py-3.5 px-5 rounded-xl border"
        style={{ background: 'rgba(13,148,136,0.06)', borderColor: 'rgba(13,148,136,0.18)' }}>
        <Zap className="w-4 h-4 text-teal-400 flex-shrink-0" />
        <p className="text-slate-400 text-[12px]">
          CYC carries a <strong className="text-white">{fmt(totalGap)} funding gap</strong> across School Age and Teen Leadership programs — {critCount} flags require immediate attention.
        </p>
        <Link href="/discover"
          className="ml-auto flex-shrink-0 text-[11px] font-bold text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 whitespace-nowrap">
          Find matching grants <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── TAB: Income Statement ─────────────────────────────────────────────────────
function IncomeTab() {
  const inc = CYC_INCOME_STATEMENT;
  const progRatio = ((inc.expenses.totalProgramServices / inc.expenses.totalExpenses) * 100).toFixed(1);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
        <span>FY2025 · Year ended June 30, 2025 · Kearney & Company, P.C. (audited)</span>
        <div className="flex items-center gap-4">
          <span>FY2024</span>
          <span className="font-bold text-slate-300">FY2025</span>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <CardHeader accent="rgba(13,148,136,0.08)">
            <p className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Revenue</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1.5">Public Support</p>
            <DRow label="Contributions (cash)"    value={inc.revenue.contributionsCash}   prior={inc.revenue.contributionsCashPrior} />
            <DRow label="Contributions (in-kind)" value={inc.revenue.contributionsInKind} />
            <DRow label="Special events (net)"    value={inc.revenue.specialEventsNet} />
            <DRow label="Total Public Support"    value={inc.revenue.totalPublicSupport}  highlight />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1.5 mt-2">Direct Program Revenue</p>
            <DRow label="Government fees & grants" value={inc.revenue.governmentFeesGrants} prior={inc.revenue.governmentFeesGrantsPrior} />
            <DRow label="Program service fees"     value={inc.revenue.programServiceFees} />
            <DRow label="Total Program Revenue"    value={inc.revenue.totalDirectProgram}   highlight />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1.5 mt-2">Other Income</p>
            <DRow label="Investment return (net)" value={inc.revenue.investmentReturnNet} />
            <DRow label="Realized gains"          value={inc.revenue.realizedGains} />
            <DRow label="Unrealized gains"        value={inc.revenue.unrealizedGains} />
            <DRow label="Total Revenue"           value={inc.revenue.totalRevenue} prior={inc.revenue.totalRevenuePrior} highlight />
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader accent="rgba(239,68,68,0.06)">
              <p className="text-[11px] font-bold text-red-400 uppercase tracking-widest">Expenses</p>
            </CardHeader>
            <div className="p-3 space-y-0.5">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1.5">Program Services</p>
              <DRow label="Early Childhood Education" value={inc.expenses.earlyChildhoodEducation} prior={inc.expenses.earlyChildhoodPrior} />
              <DRow label="School Age Child Dev."     value={inc.expenses.schoolAgeChildDev}        prior={inc.expenses.schoolAgePrior} />
              <DRow label="Teen Leadership Dev."      value={inc.expenses.teenLeadershipDev}         prior={inc.expenses.teenPrior} />
              <DRow label="Total Program Services"    value={inc.expenses.totalProgramServices}      prior={inc.expenses.totalProgramPrior} highlight />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1.5 mt-2">Supporting Services</p>
              <DRow label="Management & General"      value={inc.expenses.managementGeneral} />
              <DRow label="Development & Fundraising" value={inc.expenses.developmentFundraising} />
              <DRow label="Total Expenses"            value={inc.expenses.totalExpenses} prior={inc.expenses.totalExpensesPrior} highlight />
            </div>
          </Card>
          <div className="rounded-xl border p-4" style={{ background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.22)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-bold text-red-400">Net Change in Assets</p>
              <p className="text-[20px] font-bold text-red-400 font-mono">({fmt(Math.abs(inc.netChange))})</p>
            </div>
            <p className="text-[11px] text-slate-500">
              FY2025 deficit vs +{fmt(inc.netChangePrior)} surplus in FY2024.
              Revenue fell {fmt(inc.revenue.totalRevenuePrior - inc.revenue.totalRevenue)} while expenses grew {fmt(inc.expenses.totalExpenses - inc.expenses.totalExpensesPrior)}.
            </p>
          </div>
          <Card className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Program Expense Ratio</p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-[32px] font-bold text-green-400">{progRatio}%</span>
              <span className="text-[11px] text-slate-500 mb-1">★★★★ Charity Navigator</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full bg-green-500" style={{ width: `${progRatio}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div><p className="font-bold text-green-400">{progRatio}%</p><p className="text-slate-600">Programs</p></div>
              <div><p className="font-bold text-slate-400">10.5%</p><p className="text-slate-600">Mgmt & G</p></div>
              <div><p className="font-bold text-slate-400">3.5%</p><p className="text-slate-600">Fundraising</p></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── TAB: Balance Sheet ────────────────────────────────────────────────────────
function BalanceTab() {
  const bal = CYC_BALANCE_SHEET;
  const liq = CYC_LIQUIDITY;
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-600">Statement of Financial Position · Year ended June 30, 2025</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="overflow-hidden">
          <CardHeader accent="rgba(13,148,136,0.08)">
            <p className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">Assets</p>
            <p className="text-[11px] text-slate-500">{fmtFull(bal.assets.totalAssets)}</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <DRow label="Cash & equivalents"         value={bal.assets.cash}                    prior={bal.assets.cashPrior} />
            <DRow label="Govt receivables"           value={bal.assets.accountsReceivableGovt} />
            <DRow label="Other receivables"          value={bal.assets.accountsReceivableOther} />
            <DRow label="Pledges receivable (net)"   value={bal.assets.pledgesReceivableNet} />
            <DRow label="Investments"                value={bal.assets.investments}              prior={bal.assets.investmentsPrior} />
            <DRow label="Property & equipment (net)" value={bal.assets.propertyEquipmentNet} />
            <DRow label="ROU — operating leases"     value={bal.assets.rightOfUseOperating} />
            <DRow label="Real estate held for sale"  value={bal.assets.realEstateHeldForSale} />
            <DRow label="Total Assets"               value={bal.assets.totalAssets}              prior={bal.assets.totalAssetsPrior} highlight />
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader accent="rgba(239,68,68,0.06)">
            <p className="text-[11px] font-bold text-red-400 uppercase tracking-widest">Liabilities</p>
            <p className="text-[11px] text-slate-500">{fmtFull(bal.liabilities.totalLiabilities)}</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <DRow label="Accounts payable"           value={bal.liabilities.accountsPayable} />
            <DRow label="Accrued payroll"             value={bal.liabilities.accruedPayroll} />
            <DRow label="Deferred revenue"            value={bal.liabilities.deferredRevenue} />
            <DRow label="Line of credit (BMO Harris)" value={bal.liabilities.lineOfCredit} />
            <DRow label="Operating lease liability"   value={bal.liabilities.leaseLiabilityOperating} />
            <DRow label="Total Liabilities"           value={bal.liabilities.totalLiabilities} prior={bal.liabilities.totalLiabilitiesPrior} highlight />
          </div>
          <div className="px-4 py-3 border-t flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(251,191,36,0.06)' }}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-[11px] text-amber-400 leading-snug">Line of credit drawn for first time — $455K of $1.5M outstanding (FY2024: $0).</p>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader accent="rgba(34,197,94,0.06)">
            <p className="text-[11px] font-bold text-green-400 uppercase tracking-widest">Net Assets</p>
            <p className="text-[11px] text-slate-500">{fmtFull(bal.netAssets.totalNetAssets)}</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1">Without Donor Restrictions</p>
            <DRow label="Undesignated"         value={bal.netAssets.unrestrictedUndesignated} />
            <DRow label="Board-designated"     value={bal.netAssets.boardDesignatedInvestment} />
            <DRow label="Invested in property" value={bal.netAssets.investedInPropertyEquip} />
            <DRow label="Subtotal"             value={bal.netAssets.totalWithoutRestriction} prior={bal.netAssets.totalWithoutRestrictionPrior} highlight />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 py-1 mt-2">With Donor Restrictions</p>
            <DRow label="Time/purpose restricted" value={bal.netAssets.timePurposeRestricted} />
            <DRow label="Endowment fund"          value={bal.netAssets.endowmentFund} />
            <DRow label="Subtotal"                value={bal.netAssets.totalWithRestriction} prior={bal.netAssets.totalWithRestrictionPrior} highlight />
            <DRow label="Total Net Assets"        value={bal.netAssets.totalNetAssets}         prior={bal.netAssets.totalNetAssetsPrior} highlight />
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">Liquidity & Availability (Note 2) — Usable Cash Analysis</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { label: 'Gross Financial Assets',    value: liq.grossFinancialAssets,     color: 'text-slate-200' },
            { label: 'Less: Unavailable',          value: liq.unavailableWithinOneYear, color: 'text-red-400'   },
            { label: 'Available for General Use', value: liq.availableForGeneralUse,   color: 'text-teal-400'  },
            { label: 'Net Unrestricted Liquidity', value: liq.netUnrestrictedLiquidity, color: 'text-amber-400' },
          ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
            <div key={label} className="text-center p-3 rounded-[8px]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-slate-500 mb-1.5 leading-snug">{label}</p>
              <p className={`text-[18px] font-bold font-mono ${color}`}>
                {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6 text-[11px]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-500"><strong className="text-slate-300">{liq.monthsOfLiquidity} months</strong> of operating expenses covered</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-slate-500">LOC available: <strong className="text-slate-300">{fmt(liq.lineOfCreditAvailable)}</strong> of $1.5M limit</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-500">Grant pipeline: <strong className="text-slate-300">{fmt(liq.unconditionalGrantPipeline)}</strong> (unrecognized)</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── TAB: Programs ─────────────────────────────────────────────────────────────
function ProgramsTab() {
  const prog    = CYC_PROGRAM_ANALYSIS;
  const inc     = CYC_INCOME_STATEMENT;
  const govtPct = ((inc.revenue.governmentFeesGrants / inc.revenue.totalRevenue) * 100).toFixed(1);

  function ProgramCard({ title, pct, expense, govt, gap, costPer, perLabel, note, trend }: {
    title: string; pct: number; expense: number; govt: number;
    gap?: number; costPer: number; perLabel: string; note: string; trend?: number;
  }) {
    const coverage = (govt / expense) * 100;
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[13px] font-bold text-slate-100">{title}</p>
            <p className="text-[11px] text-slate-500">{pct}% of program expenses</p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-teal-400 border border-teal-400/20"
            style={{ background: 'rgba(13,148,136,0.08)' }}>{fmt(expense)}</span>
        </div>
        <div className="space-y-2.5 mb-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-500">Govt contract coverage</span>
              <span className="font-bold text-slate-200">{coverage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.min(coverage, 100)}%`,
                background: coverage >= 90 ? '#22c55e' : coverage >= 60 ? '#f59e0b' : '#ef4444',
              }} />
            </div>
          </div>
          {gap !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Funding gap (private needed)</span>
              <span className="font-bold text-red-400">{fmt(gap)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Cost {perLabel}</span>
            <span className="font-bold text-slate-200 font-mono">{fmtFull(costPer)}</span>
          </div>
          {trend !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">vs prior year</span>
              <span className={`font-bold ${trend > 0 ? 'text-red-400' : 'text-green-400'}`}>{trend > 0 ? '+' : ''}{trend.toFixed(1)}%</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed border-t pt-2"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>{note}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProgramCard title="Early Childhood Education"    pct={prog.earlyChildhood.pctOfProgramExpenses}  expense={prog.earlyChildhood.expenseFY2025}  govt={prog.earlyChildhood.revenueFromGovt}  costPer={prog.earlyChildhood.costPerChild}  perLabel="per child" note={prog.earlyChildhood.efficiencyNote} trend={prog.earlyChildhood.growthVsPrior} />
        <ProgramCard title="School Age Child Development" pct={prog.schoolAge.pctOfProgramExpenses}       expense={prog.schoolAge.expenseFY2025}        govt={prog.schoolAge.revenueFromGovt}        gap={prog.schoolAge.fundingGap} costPer={prog.schoolAge.costPerChild}  perLabel="per child" note={prog.schoolAge.note} />
        <ProgramCard title="Teen Leadership Development"  pct={prog.teenLeadership.pctOfProgramExpenses}  expense={prog.teenLeadership.expenseFY2025}   govt={prog.teenLeadership.revenueFromGovt}   gap={prog.teenLeadership.fundingGap} costPer={prog.teenLeadership.costPerTeen} perLabel="per teen" note={prog.teenLeadership.note} />
      </div>
      <SectionTitle title="Federal Funding Risk Matrix"
        sub={`${govtPct}% of revenue from government — program-level risk breakdown and exposure`} />
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              {['Federal Program', 'ALN', 'Est. Amount', '% Revenue', 'Risk', 'Program Impact'].map((h, i) => (
                <th key={h} className={`py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide ${i === 0 || i === 5 ? 'text-left' : i >= 4 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CYC_FEDERAL_PROGRAMS.map(p => {
              const isCrit = p.risk === 'critical';
              return (
                <tr key={p.name} className="border-t hover:bg-white/[0.02] transition-colors" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="py-3 px-4">
                    <p className="text-[13px] font-semibold text-slate-200">{p.name}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5 max-w-xs">{p.riskReason}</p>
                  </td>
                  <td className="py-3 px-4 text-right"><span className="text-[11px] font-mono text-slate-600">{p.aln}</span></td>
                  <td className="py-3 px-4 text-right"><span className="text-[13px] font-bold font-mono text-slate-200">{fmt(p.estimatedAmount)}</span></td>
                  <td className="py-3 px-4 text-right"><span className="text-[13px] font-bold" style={{ color: isCrit ? '#f87171' : '#fbbf24' }}>{p.pctOfRevenue}%</span></td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      style={{ color: isCrit ? '#f87171' : '#fbbf24', borderColor: isCrit ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.25)', background: isCrit ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)' }}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {isCrit ? 'CRITICAL' : 'MODERATE'}
                    </span>
                  </td>
                  <td className="py-3 px-4"><span className="text-[11px] text-slate-500">{p.programImpact}</span></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.02)' }}>
              <td className="py-3 px-4 text-[12px] font-bold text-slate-200">Total Federal/State</td>
              <td /><td className="py-3 px-4 text-right text-[13px] font-bold text-slate-200 font-mono">{fmt(inc.revenue.governmentFeesGrants)}</td>
              <td className="py-3 px-4 text-right text-[13px] font-bold text-red-400">{govtPct}%</td>
              <td /><td />
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}

// ── TAB: Capital & Board ──────────────────────────────────────────────────────
function CapitalTab() {
  const camp    = CYC_CAPITAL_CAMPAIGN;
  const end     = CYC_ENDOWMENT;
  const bd      = CYC_BOARD;
  const campPct = ((camp.pledgesInBook / camp.goal) * 100).toFixed(1);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-indigo-400" />
            <h3 className="text-[14px] font-bold text-slate-100">{camp.name}</h3>
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-slate-500">Progress</span>
              <span className="font-bold text-slate-200">{fmt(camp.pledgesInBook)} / {fmt(camp.goal)}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${campPct}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
            </div>
            <p className="text-[10px] text-slate-600 mt-1">{campPct}% of {fmt(camp.goal)} goal pledged</p>
          </div>
          <div className="space-y-2">
            {camp.pledgeDueDates.map(pd => (
              <div key={pd.year} className="flex justify-between text-[12px]">
                <span className="text-slate-500">{pd.year} pledge payments</span>
                <span className="font-semibold text-slate-200 font-mono">{fmtFull(pd.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t text-[11px] text-slate-600" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            Board pledges: {fmtFull(camp.boardPledgesIncluded)} · FY2025 released: {fmtFull(camp.releasedToDate)}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="w-4 h-4 text-teal-400" />
            <h3 className="text-[14px] font-bold text-slate-100">Endowment Fund</h3>
            <span className="text-[11px] text-slate-500">5% spending policy</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-[8px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-slate-500 mb-1">Total Endowment</p>
              <p className="text-[18px] font-bold text-slate-100">{fmt(end.totalEndowment)}</p>
              <p className="text-[10px] text-green-400">+{fmt(end.totalEndowment - end.priorYearTotal)} from FY2024</p>
            </div>
            <div className="p-3 rounded-[8px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-slate-500 mb-1">FY2025 Investment Return</p>
              <p className="text-[18px] font-bold text-green-400">{fmt(end.investmentReturnFY2025)}</p>
              <p className="text-[10px] text-slate-600">{fmt(end.expenditures)} distributed</p>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Named Funds</p>
          <div className="space-y-1.5">
            {end.namedFunds.map(f => (
              <div key={f.name} className="flex justify-between text-[12px]">
                <span className="text-slate-400">{f.name}</span>
                <span className="font-mono font-semibold text-slate-200">{fmtFull(f.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-teal-400" />
          <h2 className="text-[14px] font-bold text-slate-100">Board Intelligence</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full text-green-400 border border-green-400/20 font-bold"
            style={{ background: 'rgba(34,197,94,0.08)' }}>{bd.totalMembers} members</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {([
            { label: 'Board Chair', value: bd.chair },
            { label: 'Vice Chair',  value: bd.viceChair },
            { label: 'Secretary',   value: bd.secretary },
            { label: 'Treasurer',   value: bd.treasurer },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div key={label} className="p-3 rounded-[8px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
              <p className="text-[13px] font-semibold text-slate-200">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            { label: 'Direct Board Contributions',        value: bd.boardGivingFY2025.directContributions },
            { label: 'Corporate Sponsorships (via Board)', value: bd.boardGivingFY2025.affiliatedCompanySponsorships },
            { label: 'Total Board-Sourced Revenue',       value: bd.boardGivingFY2025.totalBoardSourced, sub: `${bd.boardGivingFY2025.pctOfTotalRevenue}% of total revenue` },
          ] as { label: string; value: number; sub?: string }[]).map(({ label, value, sub }) => (
            <div key={label} className="p-4 rounded-[8px]" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <p className="text-[11px] text-slate-500 mb-1">{label}</p>
              <p className="text-[20px] font-bold text-green-400">{fmtFull(value)}</p>
              {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 mt-3">Auxiliary board: {bd.auxiliaryBoard} · Strong engagement relative to comparable nonprofits.</p>
      </Card>

      <SectionTitle title="Leadership Team" sub="Compensation from FY2025 audited statements · Schedule J" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CYC_LEADERSHIP.map(leader => (
          <Card key={leader.name} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[14px] font-bold text-slate-100">{leader.name}</p>
                <p className="text-[11px] text-teal-400 font-semibold">{leader.title}</p>
              </div>
              {leader.salary && (
                <span className="text-[12px] font-bold text-slate-200 font-mono px-2 py-1 rounded-[6px]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {fmtFull(leader.salary)}
                </span>
              )}
            </div>
            {leader.tenure && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold text-teal-400 border-teal-400/20 inline-block mb-2"
                style={{ background: 'rgba(13,148,136,0.08)' }}>{leader.tenure}-year tenure</span>
            )}
            <p className="text-[11px] text-slate-400 leading-relaxed">{leader.bio}</p>
            {leader.note && <p className="text-[10px] text-slate-600 mt-2 italic">{leader.note}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── TAB: Sites & Impact ───────────────────────────────────────────────────────
function SitesTab() {
  return (
    <div className="space-y-6">
      <SectionTitle
        title="Service Sites"
        sub={`${CYC_SITES.length} centers across Chicago · ${CYC_IMPACT.youthServedTotal.toLocaleString()} youth served FY2024`}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CYC_SITES.map(site => (
          <Card key={site.name} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[13px] font-bold text-slate-100 leading-snug">{site.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-slate-600" />
                  <span className="text-[11px] text-slate-500">{site.neighborhood}</span>
                </div>
              </div>
              {site.isNewest && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-green-400 border border-green-400/20 flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.08)' }}>NEWEST</span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 mb-2">{site.address}</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {site.programs.map(p => (
                <span key={p} className="text-[10px] px-1.5 py-0.5 rounded text-teal-400 border border-teal-400/20"
                  style={{ background: 'rgba(13,148,136,0.08)' }}>{p}</span>
              ))}
            </div>
            <p className="text-[10px] text-slate-600">Ages: {site.agesServed}</p>
            {site.note && <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">{site.note}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <h2 className="text-[14px] font-bold text-slate-100">Program Outcomes — FY2024 Stewardship Report</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              Early Learning ({CYC_IMPACT.earlyLearningParticipants} participants)
            </p>
            <div className="space-y-2.5">
              {CYC_IMPACT.outcomes.earlyLearning.map(o => (
                <div key={o.metric} className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{o.metric}</span>
                  <span className="text-[12px] font-bold text-green-400">{o.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              Out-of-School Time ({CYC_IMPACT.ostParticipants} participants)
            </p>
            <div className="space-y-2.5">
              {CYC_IMPACT.outcomes.outOfSchoolTime.map(o => (
                <div key={o.metric} className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{o.metric}</span>
                  <span className="text-[12px] font-bold text-green-400">{o.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Org Overview</p>
            <div className="space-y-3">
              {([
                { label: 'Total Youth Served', value: CYC_IMPACT.youthServedTotal.toLocaleString() },
                { label: 'Years in Operation', value: `${CYC_IMPACT.yearsInOperation} years` },
                { label: 'Charity Navigator',  value: `${CYC_IMPACT.charityNavigatorRating}/4 stars` },
                { label: 'Teen Participants',  value: CYC_IMPACT.teenParticipants.toLocaleString() },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[12px] text-slate-400">{label}</span>
                  <span className="text-[13px] font-bold text-slate-100">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const CYC_TABS = [
  { id: 'overview',  label: 'Overview',        icon: BarChart3  },
  { id: 'income',    label: 'Income Statement', icon: DollarSign },
  { id: 'balance',   label: 'Balance Sheet',   icon: Shield     },
  { id: 'programs',  label: 'Programs',        icon: Target     },
  { id: 'capital',   label: 'Capital & Board', icon: Landmark   },
  { id: 'sites',     label: 'Sites & Impact',  icon: MapPin     },
] as const;

type CYCTab = typeof CYC_TABS[number]['id'];
type AnyTab = CYCTab | CommonTab;

const ALL_TABS = [
  ...CYC_TABS,
  { id: 'ai',       label: 'AI Analyzer',    icon: Brain   },
  { id: 'docs',     label: 'Documents',      icon: Library },
  { id: 'strategy', label: 'Strategy Brief', icon: Wand2   },
] as const;

// ── CYC Financials Shell ──────────────────────────────────────────────────────
export function CYCFinancialsShell({
  orgCode, orgId, orgName,
  googleConnected, microsoftConnected,
}: {
  orgCode:            string;
  orgId?:             string;
  orgName?:           string;
  googleConnected:    boolean;
  microsoftConnected: boolean;
}) {
  const [tab, setTab] = useState<AnyTab>('overview');

  return (
    <div style={{ background: '#070d1a', minHeight: '100vh' }}>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b" style={{
        background: 'linear-gradient(135deg,#0d1929 0%,#0a1120 60%,#070d1a 100%)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}>
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div className="absolute top-0 right-1/3 w-80 h-36 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle,rgba(13,148,136,0.10),transparent)' }} />
        <div className="relative px-8 py-7 max-w-7xl mx-auto flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-[10px] font-bold text-teal-500 uppercase tracking-widest">Org Intelligence · Financials</span>
            </div>
            <h1 className="text-[26px] font-bold text-white leading-tight">Chicago Youth Centers</h1>
            <p className="text-slate-400 text-[13px] mt-0.5">
              Founded 1956 · {CYC_IMPACT.yearsInOperation} years · {CYC_SITES.length} centers across Chicago · EIN 36-2196050
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold text-green-400 border border-green-400/20"
              style={{ background: 'rgba(34,197,94,0.08)' }}>★★★★ Charity Navigator</span>
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold text-red-400 border border-red-400/20"
              style={{ background: 'rgba(239,68,68,0.08)' }}>FY2025 Audited · Operating Deficit</span>
          </div>
        </div>
      </div>

      {/* ── Sticky tab nav ───────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b" style={{
        background: 'rgba(7,13,26,0.97)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'rgba(255,255,255,0.07)',
      }}>
        <div className="px-8 max-w-7xl mx-auto flex items-center overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {ALL_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id as AnyTab)}
              className="flex items-center gap-2 px-4 py-3.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition-all"
              style={{
                color: tab === id ? '#fff' : '#64748b',
                borderBottomColor: tab === id ? '#0d9488' : 'transparent',
              }}>
              <Icon className="w-3.5 h-3.5" />
              {label}
              {id === 'ai' && (googleConnected || microsoftConnected) && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────── */}
      <div className="px-8 py-7 max-w-7xl mx-auto">
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'income'    && <IncomeTab />}
        {tab === 'balance'   && <BalanceTab />}
        {tab === 'programs'  && <ProgramsTab />}
        {tab === 'capital'   && <CapitalTab />}
        {tab === 'sites'     && <SitesTab />}
        {tab === 'ai'        && (
          <AITab orgCode={orgCode} orgId={orgId} orgName={orgName}
            googleConnected={googleConnected} microsoftConnected={microsoftConnected} />
        )}
        {tab === 'docs'      && (
          <DocumentLibraryTab orgCode={orgCode} orgId={orgId} orgName={orgName}
            googleConnected={googleConnected} microsoftConnected={microsoftConnected}
            onSwitchToAnalyzer={() => setTab('ai')} />
        )}
        {tab === 'strategy'  && <StrategyBriefTab orgCode={orgCode} orgName={orgName} />}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="px-8 pb-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] text-slate-700">
            Source: FY2025 Audited Financial Statements · Kearney & Company, P.C. · Audit issued January 5, 2026 · chicagoyouthcenters.org
          </p>
          <Link href="/dashboard"
            className="flex items-center gap-1 text-[11px] text-teal-500 hover:text-teal-400 transition-colors">
            Back to dashboard <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
