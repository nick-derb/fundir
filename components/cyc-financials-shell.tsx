'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3, Shield, AlertTriangle,
  DollarSign, Clock, CheckCircle, Users, MapPin,
  Target, Landmark, Activity,
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
  type CommonTab,
} from './financials-shell';
import { FinancialsOverview } from './financials-overview';

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

// NOTE: HealthGauge / RevenueBars / Flag (the Overview-only helpers) are
// gone — the new <FinancialsOverview> from ./financials-overview now
// renders the gauge, the trajectory chart, and the flag cards.

// ── DRow component ────────────────────────────────────────────────────────────
function DRow({ label, value, prior, highlight = false }: {
  label: string; value: number; prior?: number; highlight?: boolean;
}) {
  const delta = prior && prior !== 0 ? ((value - prior) / Math.abs(prior)) * 100 : null;
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-sm ${highlight ? 'bg-elevated' : ''}`}>
      <span className={`text-[12px] ${highlight ? 'text-primary font-semibold' : 'text-secondary'}`}>{label}</span>
      <div className="flex items-center gap-3">
        {delta !== null && (
          <span className={`font-mono text-[10.5px] font-medium tabular-nums ${delta >= 0 ? 'text-success' : 'text-critical'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
        {prior !== undefined && (
          <span className="text-[11px] text-tertiary tabular-nums font-mono w-20 text-right">
            {prior < 0 ? `(${fmt(Math.abs(prior))})` : fmt(prior)}
          </span>
        )}
        <span className={`text-[13px] tabular-nums font-mono w-20 text-right ${value < 0 ? 'text-critical' : highlight ? 'text-primary font-semibold' : 'text-muted'}`}>
          {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
        </span>
      </div>
    </div>
  );
}

// ── TAB: Overview ─────────────────────────────────────────────────────────────
//
// Rebuilt against the financials-overview-reference.html brief. All chart
// composition lives in <FinancialsOverview>; this function only maps the
// audited CYC numbers onto the shape that component consumes.
//
// Driver bars on Composite Health are derived from real audited inputs using
// transparent formulas (no fabrication) — the model already computes these
// dimensions; here we surface them.
function OverviewTab() {
  const inc  = CYC_INCOME_STATEMENT;
  const liq  = CYC_LIQUIDITY;
  const prog = CYC_PROGRAM_ANALYSIS;
  const trend = CYC_REVENUE_TREND;

  const totalRev    = inc.revenue.totalRevenue;
  const totalRevPY  = inc.revenue.totalRevenuePrior;
  const yoyPct      = ((totalRev - totalRevPY) / totalRevPY) * 100;
  const govtPct     = (inc.revenue.governmentFeesGrants / totalRev) * 100;
  const govtAmt     = inc.revenue.governmentFeesGrants;
  const headStartAmt = prog.earlyChildhood.revenueFromGovt;
  const headStartPct = (headStartAmt / totalRev) * 100;
  const otherGovtPct = ((govtAmt - headStartAmt) / totalRev) * 100;
  const publicSupportPct = (inc.revenue.totalPublicSupport / totalRev) * 100;
  const programFeesPct   = (inc.revenue.programServiceFees / totalRev) * 100;
  const otherIncomePct   = 100 - headStartPct - otherGovtPct - publicSupportPct - programFeesPct;

  const progRatio       = (inc.expenses.totalProgramServices / inc.expenses.totalExpenses) * 100;
  const mgRatio         = (inc.expenses.managementGeneral    / inc.expenses.totalExpenses) * 100;
  const fundraisingPct  = (inc.expenses.developmentFundraising / inc.expenses.totalExpenses) * 100;

  // Health-driver sub-scores — all derived from audited inputs.
  const efficiencyScore = Math.round(progRatio);                                 // 86
  const liquidityScore  = Math.round(Math.min(100, (liq.monthsOfLiquidity / 6) * 100)); // 40
  const concScore       = Math.round(Math.max(0, 100 - govtPct));                // 25
  const reservesRatio   = CYC_BALANCE_SHEET.netAssets.totalNetAssets / inc.expenses.totalExpenses;
  const reservesScore   = Math.round(Math.max(0, Math.min(100, 50 + (reservesRatio - 1) * 50))); // ~52
  const revStabScore    = Math.round(Math.max(0, Math.min(100, 50 + yoyPct * 1.0))); // -10 → 40

  const data: import('./financials-overview').FinancialsOverviewData = {
    healthScore:   HEALTH_SCORE,
    healthVerdict: HEALTH_SCORE >= 70 ? 'STRONG' : HEALTH_SCORE >= 45 ? 'NEEDS ATTENTION' : 'CRITICAL',
    healthSubcopy: 'Strong program efficiency is offset by high government concentration and thin reserves.',
    healthDrivers: [
      { label: 'Efficiency',        value: efficiencyScore, tone: efficiencyScore >= 70 ? 'success' : 'warning'  },
      { label: 'Reserves',          value: reservesScore,   tone: reservesScore   >= 70 ? 'success' : reservesScore  >= 40 ? 'warning' : 'critical' },
      { label: 'Revenue stability', value: revStabScore,    tone: revStabScore    >= 70 ? 'success' : revStabScore   >= 40 ? 'warning' : 'critical' },
      { label: 'Liquidity',         value: liquidityScore,  tone: liquidityScore  >= 70 ? 'success' : liquidityScore >= 40 ? 'warning' : 'critical' },
      { label: 'Concentration',     value: concScore,       tone: concScore       >= 70 ? 'success' : concScore      >= 40 ? 'warning' : 'critical' },
    ],

    totalRevenue:        totalRev,
    totalRevenueYoYPct:  yoyPct,

    netResult:        inc.netChange,
    netResultPrior:   inc.netChangePrior,

    liquidityMonths:  liq.monthsOfLiquidity,
    liquidityHealthy: { min: 3, max: 6 },

    govtDependencyPct:       govtPct,
    govtDependencyThreshold: 50,

    revenueSparklinePoints: trend.map(t => t.revenue),
    netSparklinePoints:     trend.map(t => t.surplus),

    revenueSeries: trend.map(t => ({ label: t.year, revenue: t.revenue, net: t.surplus })),

    concentration: {
      thresholdPct:     60,
      governmentPct:    govtPct,
      governmentAmount: govtAmt,
      totalRevenue:     totalRev,
      dominantProgram:  { name: 'Head Start (Early Childhood)', amount: headStartAmt },
      callout:          `Single-program exposure: Head Start drives ~${headStartPct.toFixed(0)}% of revenue ($${(headStartAmt / 1_000_000).toFixed(1)}M). Auditors flag that any significant reduction could materially affect programs. Diversifying private/foundation revenue is the primary mitigation.`,
      segments: [
        { label: 'Head Start', pct: headStartPct,           tone: 'critical' },
        { label: 'Other govt', pct: Math.max(0, otherGovtPct), tone: 'neutral'  },
        { label: 'Private',    pct: publicSupportPct,       tone: 'accent'   },
        { label: 'Program',    pct: programFeesPct,         tone: 'info'     },
        { label: 'Other',      pct: Math.max(0, otherIncomePct), tone: 'muted' },
      ],
    },

    liquidity: {
      months:          liq.monthsOfLiquidity,
      financialAssets: liq.availableForGeneralUse,
      payables:        Math.abs(liq.outstandingObligations),
      netLiquid:       liq.netUnrestrictedLiquidity,
      healthyMin:      3,
      healthyMax:      6,
      scaleMax:        6,
      lineOfCredit:    {
        drawn: 455_000,
        limit: 1_500_000,
        note:  'first draw on record',
      },
    },

    expense: {
      programPct:           progRatio,
      managementGeneralPct: mgRatio,
      fundraisingPct,
      benchmarkLabel:       progRatio >= 75 ? '4★ Charity Navigator threshold met' : undefined,
    },

    flags: CYC_INTELLIGENCE_FLAGS.map(f => ({
      severity:       f.severity,
      headline:       f.headline,
      category:       f.category,
      body:           f.detail,
      recommendation: f.action,
      chip:           f.metric,
    })),
  };

  return <FinancialsOverview data={data} />;
}

// ── TAB: Income Statement ─────────────────────────────────────────────────────
function IncomeTab() {
  const inc = CYC_INCOME_STATEMENT;
  const progRatio = ((inc.expenses.totalProgramServices / inc.expenses.totalExpenses) * 100).toFixed(1);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] text-tertiary mb-1">
        <span>FY2025 · Year ended June 30, 2025 · Kearney & Company, P.C. (audited)</span>
        <div className="flex items-center gap-4">
          <span>FY2024</span>
          <span className="font-bold text-muted">FY2025</span>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <CardHeader accent="var(--accent-tint)">
            <p className="text-[11px] font-bold text-accent uppercase tracking-widest">Revenue</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1.5">Public Support</p>
            <DRow label="Contributions (cash)"    value={inc.revenue.contributionsCash}   prior={inc.revenue.contributionsCashPrior} />
            <DRow label="Contributions (in-kind)" value={inc.revenue.contributionsInKind} />
            <DRow label="Special events (net)"    value={inc.revenue.specialEventsNet} />
            <DRow label="Total Public Support"    value={inc.revenue.totalPublicSupport}  highlight />
            <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1.5 mt-2">Direct Program Revenue</p>
            <DRow label="Government fees & grants" value={inc.revenue.governmentFeesGrants} prior={inc.revenue.governmentFeesGrantsPrior} />
            <DRow label="Program service fees"     value={inc.revenue.programServiceFees} />
            <DRow label="Total Program Revenue"    value={inc.revenue.totalDirectProgram}   highlight />
            <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1.5 mt-2">Other Income</p>
            <DRow label="Investment return (net)" value={inc.revenue.investmentReturnNet} />
            <DRow label="Realized gains"          value={inc.revenue.realizedGains} />
            <DRow label="Unrealized gains"        value={inc.revenue.unrealizedGains} />
            <DRow label="Total Revenue"           value={inc.revenue.totalRevenue} prior={inc.revenue.totalRevenuePrior} highlight />
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader accent="var(--critical-tint)">
              <p className="text-[11px] font-bold text-critical uppercase tracking-widest">Expenses</p>
            </CardHeader>
            <div className="p-3 space-y-0.5">
              <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1.5">Program Services</p>
              <DRow label="Early Childhood Education" value={inc.expenses.earlyChildhoodEducation} prior={inc.expenses.earlyChildhoodPrior} />
              <DRow label="School Age Child Dev."     value={inc.expenses.schoolAgeChildDev}        prior={inc.expenses.schoolAgePrior} />
              <DRow label="Teen Leadership Dev."      value={inc.expenses.teenLeadershipDev}         prior={inc.expenses.teenPrior} />
              <DRow label="Total Program Services"    value={inc.expenses.totalProgramServices}      prior={inc.expenses.totalProgramPrior} highlight />
              <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1.5 mt-2">Supporting Services</p>
              <DRow label="Management & General"      value={inc.expenses.managementGeneral} />
              <DRow label="Development & Fundraising" value={inc.expenses.developmentFundraising} />
              <DRow label="Total Expenses"            value={inc.expenses.totalExpenses} prior={inc.expenses.totalExpensesPrior} highlight />
            </div>
          </Card>
          <div className="rounded-xl border p-4" style={{ background: 'var(--critical-tint)', borderColor: 'var(--critical)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-bold text-critical">Net Change in Assets</p>
              <p className="text-[20px] font-bold text-critical font-mono">({fmt(Math.abs(inc.netChange))})</p>
            </div>
            <p className="text-[11px] text-secondary">
              FY2025 deficit vs +{fmt(inc.netChangePrior)} surplus in FY2024.
              Revenue fell {fmt(inc.revenue.totalRevenuePrior - inc.revenue.totalRevenue)} while expenses grew {fmt(inc.expenses.totalExpenses - inc.expenses.totalExpensesPrior)}.
            </p>
          </div>
          <Card className="p-4">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Program Expense Ratio</p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-[32px] font-bold text-success">{progRatio}%</span>
              <span className="text-[11px] text-secondary mb-1">★★★★ Charity Navigator</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full bg-success" style={{ width: `${progRatio}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div><p className="font-bold text-success">{progRatio}%</p><p className="text-tertiary">Programs</p></div>
              <div><p className="font-bold text-secondary">10.5%</p><p className="text-tertiary">Mgmt & G</p></div>
              <div><p className="font-bold text-secondary">3.5%</p><p className="text-tertiary">Fundraising</p></div>
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
      <p className="text-[11px] text-tertiary">Statement of Financial Position · Year ended June 30, 2025</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="overflow-hidden">
          <CardHeader accent="var(--accent-tint)">
            <p className="text-[11px] font-bold text-accent uppercase tracking-widest">Assets</p>
            <p className="text-[11px] text-secondary">{fmtFull(bal.assets.totalAssets)}</p>
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
          <CardHeader accent="var(--critical-tint)">
            <p className="text-[11px] font-bold text-critical uppercase tracking-widest">Liabilities</p>
            <p className="text-[11px] text-secondary">{fmtFull(bal.liabilities.totalLiabilities)}</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <DRow label="Accounts payable"           value={bal.liabilities.accountsPayable} />
            <DRow label="Accrued payroll"             value={bal.liabilities.accruedPayroll} />
            <DRow label="Deferred revenue"            value={bal.liabilities.deferredRevenue} />
            <DRow label="Line of credit (BMO Harris)" value={bal.liabilities.lineOfCredit} />
            <DRow label="Operating lease liability"   value={bal.liabilities.leaseLiabilityOperating} />
            <DRow label="Total Liabilities"           value={bal.liabilities.totalLiabilities} prior={bal.liabilities.totalLiabilitiesPrior} highlight />
          </div>
          <div className="px-4 py-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--border-hairline)', background: 'var(--warning-tint)' }}>
            <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
            <p className="text-[11px] text-warning leading-snug">Line of credit drawn for first time — $455K of $1.5M outstanding (FY2024: $0).</p>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader accent="var(--success-tint)">
            <p className="text-[11px] font-bold text-success uppercase tracking-widest">Net Assets</p>
            <p className="text-[11px] text-secondary">{fmtFull(bal.netAssets.totalNetAssets)}</p>
          </CardHeader>
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1">Without Donor Restrictions</p>
            <DRow label="Undesignated"         value={bal.netAssets.unrestrictedUndesignated} />
            <DRow label="Board-designated"     value={bal.netAssets.boardDesignatedInvestment} />
            <DRow label="Invested in property" value={bal.netAssets.investedInPropertyEquip} />
            <DRow label="Subtotal"             value={bal.netAssets.totalWithoutRestriction} prior={bal.netAssets.totalWithoutRestrictionPrior} highlight />
            <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-3 py-1 mt-2">With Donor Restrictions</p>
            <DRow label="Time/purpose restricted" value={bal.netAssets.timePurposeRestricted} />
            <DRow label="Endowment fund"          value={bal.netAssets.endowmentFund} />
            <DRow label="Subtotal"                value={bal.netAssets.totalWithRestriction} prior={bal.netAssets.totalWithRestrictionPrior} highlight />
            <DRow label="Total Net Assets"        value={bal.netAssets.totalNetAssets}         prior={bal.netAssets.totalNetAssetsPrior} highlight />
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <p className="text-[11px] font-bold text-secondary uppercase tracking-widest mb-4">Liquidity & Availability (Note 2) — Usable Cash Analysis</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { label: 'Gross Financial Assets',    value: liq.grossFinancialAssets,     color: 'text-primary' },
            { label: 'Less: Unavailable',          value: liq.unavailableWithinOneYear, color: 'text-critical'   },
            { label: 'Available for General Use', value: liq.availableForGeneralUse,   color: 'text-accent'  },
            { label: 'Net Unrestricted Liquidity', value: liq.netUnrestrictedLiquidity, color: 'text-warning' },
          ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
            <div key={label} className="text-center p-3 rounded-[8px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
              <p className="text-[10px] text-secondary mb-1.5 leading-snug">{label}</p>
              <p className={`text-[18px] font-bold font-mono ${color}`}>
                {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6 text-[11px]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-warning" />
            <span className="text-secondary"><strong className="text-muted">{liq.monthsOfLiquidity} months</strong> of operating expenses covered</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-accent" />
            <span className="text-secondary">LOC available: <strong className="text-muted">{fmt(liq.lineOfCreditAvailable)}</strong> of $1.5M limit</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-info" />
            <span className="text-secondary">Grant pipeline: <strong className="text-muted">{fmt(liq.unconditionalGrantPipeline)}</strong> (unrecognized)</span>
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
            <p className="text-[13px] font-bold text-primary">{title}</p>
            <p className="text-[11px] text-secondary">{pct}% of program expenses</p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-accent border border-hairline"
            style={{ background: 'var(--accent-tint)' }}>{fmt(expense)}</span>
        </div>
        <div className="space-y-2.5 mb-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-secondary">Govt contract coverage</span>
              <span className="font-bold text-primary">{coverage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.min(coverage, 100)}%`,
                background: coverage >= 90 ? 'var(--success)' : coverage >= 60 ? 'var(--warning)' : 'var(--critical)',
              }} />
            </div>
          </div>
          {gap !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-secondary">Funding gap (private needed)</span>
              <span className="font-bold text-critical">{fmt(gap)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-secondary">Cost {perLabel}</span>
            <span className="font-bold text-primary font-mono">{fmtFull(costPer)}</span>
          </div>
          {trend !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-secondary">vs prior year</span>
              <span className={`font-bold ${trend > 0 ? 'text-critical' : 'text-success'}`}>{trend > 0 ? '+' : ''}{trend.toFixed(1)}%</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-tertiary leading-relaxed border-t pt-2"
          style={{ borderColor: 'var(--border-hairline)' }}>{note}</p>
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
            <tr className="border-b" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-elevated)' }}>
              {['Federal Program', 'ALN', 'Est. Amount', '% Revenue', 'Risk', 'Program Impact'].map((h, i) => (
                <th key={h} className={`py-2.5 px-4 text-[10px] font-bold text-secondary uppercase tracking-wide ${i === 0 || i === 5 ? 'text-left' : i >= 4 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CYC_FEDERAL_PROGRAMS.map(p => {
              const isCrit = p.risk === 'critical';
              return (
                <tr key={p.name} className="border-t hover:bg-elevated transition-colors" style={{ borderColor: 'var(--bg-elevated)' }}>
                  <td className="py-3 px-4">
                    <p className="text-[13px] font-semibold text-primary">{p.name}</p>
                    <p className="text-[10px] text-tertiary mt-0.5 max-w-xs">{p.riskReason}</p>
                  </td>
                  <td className="py-3 px-4 text-right"><span className="text-[11px] font-mono text-tertiary">{p.aln}</span></td>
                  <td className="py-3 px-4 text-right"><span className="text-[13px] font-bold font-mono text-primary">{fmt(p.estimatedAmount)}</span></td>
                  <td className="py-3 px-4 text-right"><span className="text-[13px] font-bold" style={{ color: isCrit ? 'var(--critical)' : 'var(--warning)' }}>{p.pctOfRevenue}%</span></td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      style={{ color: isCrit ? 'var(--critical)' : 'var(--warning)', borderColor: isCrit ? 'var(--critical)' : 'var(--warning)', background: isCrit ? 'var(--critical-tint)' : 'var(--warning-tint)' }}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {isCrit ? 'CRITICAL' : 'MODERATE'}
                    </span>
                  </td>
                  <td className="py-3 px-4"><span className="text-[11px] text-secondary">{p.programImpact}</span></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-elevated)' }}>
              <td className="py-3 px-4 text-[12px] font-bold text-primary">Total Federal/State</td>
              <td /><td className="py-3 px-4 text-right text-[13px] font-bold text-primary font-mono">{fmt(inc.revenue.governmentFeesGrants)}</td>
              <td className="py-3 px-4 text-right text-[13px] font-bold text-critical">{govtPct}%</td>
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
            <Target className="w-4 h-4 text-info" />
            <h3 className="text-[14px] font-bold text-primary">{camp.name}</h3>
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-secondary">Progress</span>
              <span className="font-bold text-primary">{fmt(camp.pledgesInBook)} / {fmt(camp.goal)}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${campPct}%`, background: 'var(--info)' }} />
            </div>
            <p className="text-[10px] text-tertiary mt-1">{campPct}% of {fmt(camp.goal)} goal pledged</p>
          </div>
          <div className="space-y-2">
            {camp.pledgeDueDates.map(pd => (
              <div key={pd.year} className="flex justify-between text-[12px]">
                <span className="text-secondary">{pd.year} pledge payments</span>
                <span className="font-semibold text-primary font-mono">{fmtFull(pd.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t text-[11px] text-tertiary" style={{ borderColor: 'var(--border-hairline)' }}>
            Board pledges: {fmtFull(camp.boardPledgesIncluded)} · FY2025 released: {fmtFull(camp.releasedToDate)}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="w-4 h-4 text-accent" />
            <h3 className="text-[14px] font-bold text-primary">Endowment Fund</h3>
            <span className="text-[11px] text-secondary">5% spending policy</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-[8px]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
              <p className="text-[10px] text-secondary mb-1">Total Endowment</p>
              <p className="text-[18px] font-bold text-primary">{fmt(end.totalEndowment)}</p>
              <p className="text-[10px] text-success">+{fmt(end.totalEndowment - end.priorYearTotal)} from FY2024</p>
            </div>
            <div className="p-3 rounded-[8px]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
              <p className="text-[10px] text-secondary mb-1">FY2025 Investment Return</p>
              <p className="text-[18px] font-bold text-success">{fmt(end.investmentReturnFY2025)}</p>
              <p className="text-[10px] text-tertiary">{fmt(end.expenditures)} distributed</p>
            </div>
          </div>
          <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Named Funds</p>
          <div className="space-y-1.5">
            {end.namedFunds.map(f => (
              <div key={f.name} className="flex justify-between text-[12px]">
                <span className="text-secondary">{f.name}</span>
                <span className="font-mono font-semibold text-primary">{fmtFull(f.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-accent" />
          <h2 className="text-[14px] font-bold text-primary">Board Intelligence</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full text-success border border-hairline font-bold"
            style={{ background: 'var(--success-tint)' }}>{bd.totalMembers} members</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {([
            { label: 'Board Chair', value: bd.chair },
            { label: 'Vice Chair',  value: bd.viceChair },
            { label: 'Secretary',   value: bd.secretary },
            { label: 'Treasurer',   value: bd.treasurer },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div key={label} className="p-3 rounded-[8px]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
              <p className="text-[10px] text-secondary mb-0.5">{label}</p>
              <p className="text-[13px] font-semibold text-primary">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            { label: 'Direct Board Contributions',        value: bd.boardGivingFY2025.directContributions },
            { label: 'Corporate Sponsorships (via Board)', value: bd.boardGivingFY2025.affiliatedCompanySponsorships },
            { label: 'Total Board-Sourced Revenue',       value: bd.boardGivingFY2025.totalBoardSourced, sub: `${bd.boardGivingFY2025.pctOfTotalRevenue}% of total revenue` },
          ] as { label: string; value: number; sub?: string }[]).map(({ label, value, sub }) => (
            <div key={label} className="p-4 rounded-[8px]" style={{ background: 'var(--success-tint)', border: '1px solid var(--success-tint)' }}>
              <p className="text-[11px] text-secondary mb-1">{label}</p>
              <p className="text-[20px] font-bold text-success">{fmtFull(value)}</p>
              {sub && <p className="text-[10px] text-tertiary">{sub}</p>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-tertiary mt-3">Auxiliary board: {bd.auxiliaryBoard} · Strong engagement relative to comparable nonprofits.</p>
      </Card>

      <SectionTitle title="Leadership Team" sub="Compensation from FY2025 audited statements · Schedule J" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CYC_LEADERSHIP.map(leader => (
          <Card key={leader.name} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[14px] font-bold text-primary">{leader.name}</p>
                <p className="text-[11px] text-accent font-semibold">{leader.title}</p>
              </div>
              {leader.salary && (
                <span className="text-[12px] font-bold text-primary font-mono px-2 py-1 rounded-[6px]"
                  style={{ background: 'var(--border-hairline)', border: '1px solid var(--bg-elevated)' }}>
                  {fmtFull(leader.salary)}
                </span>
              )}
            </div>
            {leader.tenure && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold text-accent border-hairline inline-block mb-2"
                style={{ background: 'var(--accent-tint)' }}>{leader.tenure}-year tenure</span>
            )}
            <p className="text-[11px] text-secondary leading-relaxed">{leader.bio}</p>
            {leader.note && <p className="text-[10px] text-tertiary mt-2 italic">{leader.note}</p>}
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
                <p className="text-[13px] font-bold text-primary leading-snug">{site.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-tertiary" />
                  <span className="text-[11px] text-secondary">{site.neighborhood}</span>
                </div>
              </div>
              {site.isNewest && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-success border border-hairline flex-shrink-0"
                  style={{ background: 'var(--success-tint)' }}>NEWEST</span>
              )}
            </div>
            <p className="text-[11px] text-tertiary mb-2">{site.address}</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {site.programs.map(p => (
                <span key={p} className="text-[10px] px-1.5 py-0.5 rounded text-accent border border-hairline"
                  style={{ background: 'var(--accent-tint)' }}>{p}</span>
              ))}
            </div>
            <p className="text-[10px] text-tertiary">Ages: {site.agesServed}</p>
            {site.note && <p className="text-[10px] text-tertiary mt-1 leading-relaxed">{site.note}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-4 h-4 text-success" />
          <h2 className="text-[14px] font-bold text-primary">Program Outcomes — FY2024 Stewardship Report</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">
              Early Learning ({CYC_IMPACT.earlyLearningParticipants} participants)
            </p>
            <div className="space-y-2.5">
              {CYC_IMPACT.outcomes.earlyLearning.map(o => (
                <div key={o.metric} className="flex items-center justify-between">
                  <span className="text-[11px] text-secondary">{o.metric}</span>
                  <span className="text-[12px] font-bold text-success">{o.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">
              Out-of-School Time ({CYC_IMPACT.ostParticipants} participants)
            </p>
            <div className="space-y-2.5">
              {CYC_IMPACT.outcomes.outOfSchoolTime.map(o => (
                <div key={o.metric} className="flex items-center justify-between">
                  <span className="text-[11px] text-secondary">{o.metric}</span>
                  <span className="text-[12px] font-bold text-success">{o.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Org Overview</p>
            <div className="space-y-3">
              {([
                { label: 'Total Youth Served', value: CYC_IMPACT.youthServedTotal.toLocaleString() },
                { label: 'Years in Operation', value: `${CYC_IMPACT.yearsInOperation} years` },
                { label: 'Charity Navigator',  value: `${CYC_IMPACT.charityNavigatorRating}/4 stars` },
                { label: 'Teen Participants',  value: CYC_IMPACT.teenParticipants.toLocaleString() },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[12px] text-secondary">{label}</span>
                  <span className="text-[13px] font-bold text-primary">{value}</span>
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
    <div className="bg-page min-h-screen">

      {/* ── Hero — dark command band w/ inline tab bar (per brief) ────────── */}
      <div
        className="text-white rounded-b-2xl"
        style={{
          background: 'linear-gradient(135deg, #0C1626 0%, #0B1220 100%)',
        }}
      >
        <div className="px-8 pt-[30px] pb-[26px] max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--accent-bright)' }} />
                <span
                  className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--accent-bright)' }}
                >
                  Org Intelligence · Financials
                </span>
              </div>
              <h1 className="text-[30px] font-semibold -tracking-[0.02em] mt-3 leading-tight">
                Chicago Youth Centers
              </h1>
              <p className="text-[13px] mt-2" style={{ color: '#9FB0C8' }}>
                Founded <span className="font-mono tabular-nums" style={{ color: '#C6D3E6' }}>1956</span> ·{' '}
                <span className="font-mono tabular-nums" style={{ color: '#C6D3E6' }}>{CYC_IMPACT.yearsInOperation}</span> years ·{' '}
                <span className="font-mono tabular-nums" style={{ color: '#C6D3E6' }}>{CYC_SITES.length}</span> centers across Chicago · EIN{' '}
                <span className="font-mono tabular-nums" style={{ color: '#C6D3E6' }}>36-2196050</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
              <span
                className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2"
                style={{ color: '#9FB0C8' }}
              >
                <span className="w-[7px] h-[7px] rounded-full bg-success" />
                ★★★★ Charity Navigator
              </span>
              <span
                className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2"
                style={{ color: '#9FB0C8' }}
              >
                <span className="w-[7px] h-[7px] rounded-full bg-critical" />
                FY2025 Audited · Operating Deficit
              </span>
            </div>
          </div>

          {/* Tab bar — inside the hero, dark, pill-style active */}
          <div className="flex gap-0.5 mt-[22px] flex-wrap" role="tablist">
            {ALL_TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id as AnyTab)}
                  className="text-[12.5px] py-[9px] px-[13px] rounded-[7px] inline-flex items-center gap-[7px] transition-colors"
                  style={{
                    color: active ? '#fff' : '#7E90AB',
                    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {id === 'ai' && (googleConnected || microsoftConnected) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
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
        <div className="flex items-center justify-between py-4 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
          <p className="text-[11px] text-tertiary">
            Source: FY2025 Audited Financial Statements · Kearney & Company, P.C. · Audit issued January 5, 2026 · chicagoyouthcenters.org
          </p>
          <Link href="/dashboard"
            className="flex items-center gap-1 text-[11px] text-accent hover:text-accent transition-colors">
            Back to dashboard <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
