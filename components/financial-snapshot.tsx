'use client';

import Link from 'next/link';
import {
  TrendingDown, Shield, AlertTriangle,
  DollarSign, BarChart3, Clock, Info,
  CheckCircle, XCircle, MinusCircle, ArrowUpRight,
} from 'lucide-react';
import {
  CYC_INCOME_STATEMENT, CYC_BALANCE_SHEET, CYC_LIQUIDITY,
  CYC_REVENUE_TREND, CYC_INTELLIGENCE_FLAGS,
} from '@/lib/cyc-live-data';

interface FinancialSnapshotProps {
  orgName: string;
  ein: string;
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs}`;
}

function MetricCard({ label, value, sub, icon: Icon, color, bg, negative = false }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string; negative?: boolean;
}) {
  return (
    <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div className={`text-[22px] font-bold leading-none tabular-nums ${negative ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>
        {value}
      </div>
      {sub && <p className="text-[11px] text-[#64748b] mt-1.5">{sub}</p>}
    </div>
  );
}

function RevenueBar({ label, pct, color, amount }: {
  label: string; pct: number; color: string; amount: number;
}) {
  return (
    <div className="mb-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-[#475569] font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#94a3b8] tabular-nums">{fmt(amount)}</span>
          <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function ReadinessSignal({ ok, label }: { ok: boolean | 'warn'; label: string }) {
  const Icon  = ok === true ? CheckCircle : ok === 'warn' ? MinusCircle : XCircle;
  const color = ok === true ? '#16a34a'   : ok === 'warn' ? '#d97706'   : '#dc2626';
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color }} />
      <span className="text-[12px] text-[#475569] leading-snug">{label}</span>
    </div>
  );
}

function GrantReadinessGauge() {
  // Scores derived directly from CYC FY2025 audited data — not computed from ProPublica
  const reserveScore = 5;   // 2.4mo / 12 * 25 = 5.0
  const riskScore    = 5;   // critical govt dependency (74.6%) → 5/25
  const divScore     = 6;   // (100 - 74.6) / 100 * 25 ≈ 6
  const balanceScore = 25;  // $15M positive net assets → full marks
  const score = reserveScore + riskScore + divScore + balanceScore; // 41
  const color = '#c2410c';
  const label = 'Needs Work';

  const dimensions = [
    { label: 'Cash Reserves',     score: reserveScore, max: 25, tip: '2.4 months liquidity (target: 6+)' },
    { label: 'Funding Mix',       score: riskScore,    max: 25, tip: '74.6% govt dependency — critical' },
    { label: 'Revenue Diversity', score: divScore,     max: 25, tip: 'Heavily concentrated in govt contracts' },
    { label: 'Balance Sheet',     score: balanceScore, max: 25, tip: '$15M positive net assets' },
  ];

  const r = 42, cx = 52, cy = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="bg-[#f8fafc] rounded-[10px] border border-[#e2e8f0] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Grant Readiness Index</p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: color + '18', color }}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0 w-[104px] h-[104px]">
          <svg width="104" height="104" viewBox="0 0 104 104" className="rotate-[-90deg]">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={color} strokeWidth="8"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px] font-bold leading-none" style={{ color }}>{score}</span>
            <span className="text-[10px] text-[#94a3b8] font-medium">/100</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {dimensions.map(({ label: lbl, score: s, max }) => (
            <div key={lbl}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-[#64748b]">{lbl}</span>
                <span className="text-[10px] font-bold text-[#0f172a]">{s}/{max}</span>
              </div>
              <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(s / max) * 100}%`,
                    background: s / max >= 0.7 ? '#16a34a' : s / max >= 0.4 ? '#d97706' : '#dc2626',
                  }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RevenueTrendChart() {
  const trend = [...CYC_REVENUE_TREND];
  const W = 300, H = 64, PAD = 4;
  const maxVal = Math.max(...trend.map(t => t.revenue));
  const minVal = Math.min(...trend.map(t => t.revenue));
  const range  = maxVal - minVal || 1;

  const pts = trend.map((t, i) => ({
    x: PAD + (i / (trend.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((t.revenue - minVal) / range) * (H - PAD * 2),
    t,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;

  return (
    <div className="mt-5 pt-5 border-t border-[#f1f5f9]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">3-Year Revenue Trend</p>
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3 h-3 text-[#dc2626]" />
          <span className="text-[11px] font-bold text-[#dc2626]">−22.5% from FY2023 peak</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="revTrendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#revTrendGrad)" />
        <path d={linePath} fill="none" stroke="#dc2626" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(({ x, y }, i) => (
          <circle key={i} cx={x} cy={y}
            r={i === pts.length - 1 ? 4 : 2.5}
            fill={i === pts.length - 1 ? '#dc2626' : '#fff'}
            stroke="#dc2626" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {trend.map(t => (
          <span key={t.year} className="text-[10px] text-[#94a3b8]">{t.year}</span>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {trend.map((t, i) => {
          const prev  = i > 0 ? trend[i - 1] : null;
          const delta = prev ? ((t.revenue - prev.revenue) / prev.revenue) * 100 : null;
          return (
            <div key={t.year} className="text-center">
              <p className="text-[10px] font-bold text-[#0f172a] tabular-nums">{fmt(t.revenue)}</p>
              {delta !== null && (
                <p className={`text-[9px] font-medium ${delta > 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                </p>
              )}
              <p className={`text-[9px] ${t.surplus < 0 ? 'text-[#dc2626] font-bold' : 'text-[#16a34a]'}`}>
                {t.surplus < 0 ? `(${fmt(Math.abs(t.surplus))})` : `+${fmt(t.surplus)}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FinancialSnapshot({ orgName, ein }: FinancialSnapshotProps) {
  const inc = CYC_INCOME_STATEMENT;
  const liq = CYC_LIQUIDITY;
  const net = CYC_BALANCE_SHEET.netAssets;

  const govtPct  = parseFloat(((inc.revenue.governmentFeesGrants / inc.revenue.totalRevenue) * 100).toFixed(1));
  const privPct  = parseFloat(((inc.revenue.totalPublicSupport   / inc.revenue.totalRevenue) * 100).toFixed(1));
  const otherPct = parseFloat(((inc.revenue.totalOther           / inc.revenue.totalRevenue) * 100).toFixed(1));
  const svcPct   = parseFloat((((inc.revenue.programServiceFees + inc.revenue.contractualRevenue) / inc.revenue.totalRevenue) * 100).toFixed(1));

  const criticalFlags = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'critical');
  const warningFlags  = CYC_INTELLIGENCE_FLAGS.filter(f => f.severity === 'warning');

  const einFormatted = ein ? ein.replace(/(\d{2})(\d{7})/, '$1-$2') : '36-2196050';

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between"
        style={{ background: 'linear-gradient(to right, #f8fafc, #fff)' }}>
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[6px] bg-[#f0fdfa] flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-[#0d9488]" />
            </div>
            <h2 className="text-[15px] font-bold text-[#0f172a]">Financial Analysis</h2>
            <span className="text-[10px] px-2 py-0.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-full text-[#16a34a] font-bold">
              FY2025 Audited
            </span>
          </div>
          <p className="text-[12px] text-[#64748b] mt-0.5 ml-9">
            {orgName} · EIN {einFormatted} · Year ended June 30, 2025
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold border"
          style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>
          <AlertTriangle className="w-3 h-3" />
          Critical Dependency
        </span>
      </div>

      <div className="p-5 space-y-6">

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Total Revenue"   value={fmt(inc.revenue.totalRevenue)}
            sub="FY2025 (YE Jun 30)"
            icon={DollarSign} color="#0d9488" bg="#f0fdfa"
          />
          <MetricCard
            label="Net Change"      value={`(${fmt(Math.abs(inc.netChange))})`}
            sub="Operating deficit — reversed from +$1M FY2024"
            icon={TrendingDown} color="#dc2626" bg="#fef2f2" negative
          />
          <MetricCard
            label="Liquidity"       value={`${liq.monthsOfLiquidity}mo`}
            sub="Net unrestricted (target: 3–6 months)"
            icon={Clock} color="#d97706" bg="#fffbeb"
          />
          <MetricCard
            label="Govt Dependency" value={`${govtPct}%`}
            sub="of total revenue — critical threshold"
            icon={Shield} color="#dc2626" bg="#fef2f2"
          />
        </div>

        {/* Grant readiness */}
        <GrantReadinessGauge />

        {/* Revenue mix + health signals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-4">Revenue Composition</p>
            <RevenueBar label="Government Fees & Grants"       pct={govtPct}  color="#dc2626" amount={inc.revenue.governmentFeesGrants} />
            <RevenueBar label="Private Support & Events"       pct={privPct}  color="#2563eb" amount={inc.revenue.totalPublicSupport} />
            <RevenueBar label="Investment Income & Gains"      pct={otherPct} color="#7c3aed" amount={inc.revenue.totalOther} />
            <RevenueBar label="Program Service Fees"           pct={svcPct}   color="#94a3b8" amount={inc.revenue.programServiceFees + inc.revenue.contractualRevenue} />

            <div className="mt-5 pt-4 border-t border-[#f1f5f9] space-y-2">
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2.5">Health Signals</p>
              <ReadinessSignal ok={false}   label="Line of credit drawn: $455K of $1.5M limit (first time in org history)" />
              <ReadinessSignal ok={false}   label="Operating deficit ($909K) — reversed from $1.017M surplus in FY2024" />
              <ReadinessSignal ok="warn"    label={`Net unrestricted liquidity: ${liq.monthsOfLiquidity} months (below 3-month target)`} />
              <ReadinessSignal ok={true}    label="86% program expense ratio — Charity Navigator 4-star benchmark met" />
              <ReadinessSignal ok={true}    label={`${fmt(net.totalNetAssets)} positive net assets — strong balance sheet`} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-4">FY2025 Key Financials</p>
            <div className="space-y-1.5">
              {([
                { label: 'Total Revenue',          value: inc.revenue.totalRevenue,          hl: true,  neg: false },
                { label: 'Total Expenses',          value: inc.expenses.totalExpenses,        hl: false, neg: false },
                { label: 'Net Change (Deficit)',    value: inc.netChange,                     hl: true,  neg: true  },
                { label: 'Govt Fees & Grants',      value: inc.revenue.governmentFeesGrants,  hl: false, neg: false },
                { label: 'Private Support',         value: inc.revenue.totalPublicSupport,    hl: false, neg: false },
                { label: 'Total Net Assets (EOY)',  value: net.totalNetAssets,                hl: true,  neg: false },
                { label: 'Without Donor Restrict.', value: net.totalWithoutRestriction,       hl: false, neg: false },
                { label: 'Net Unrestricted Liquid', value: liq.netUnrestrictedLiquidity,      hl: false, neg: false },
              ] as { label: string; value: number; hl: boolean; neg: boolean }[]).map(({ label: lbl, value, hl, neg }) => (
                <div key={lbl}
                  className={`flex items-center justify-between py-2 px-2.5 rounded-[6px] ${hl ? 'bg-[#f8fafc]' : ''}`}>
                  <span className="text-[12px] text-[#64748b]">{lbl}</span>
                  <span className={`text-[13px] font-semibold font-mono tabular-nums ${neg ? 'text-[#dc2626]' : hl ? 'text-[#0f172a]' : 'text-[#475569]'}`}>
                    {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <RevenueTrendChart />

        {/* Critical + warning flags */}
        {(criticalFlags.length > 0 || warningFlags.length > 0) && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Intelligence Flags</p>
            {[...criticalFlags, ...warningFlags].map((flag, i) => {
              const isCrit = flag.severity === 'critical';
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-[8px] border"
                  style={{
                    background:   isCrit ? '#fef2f2' : '#fffbeb',
                    borderColor:  isCrit ? '#fecaca' : '#fde68a',
                  }}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                    style={{ color: isCrit ? '#dc2626' : '#d97706' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold" style={{ color: isCrit ? '#dc2626' : '#92400e' }}>
                      {flag.headline}
                    </p>
                    <p className="text-[11px] text-[#64748b] mt-0.5 leading-relaxed">{flag.action}</p>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
                    style={{ background: isCrit ? '#dc2626' : '#d97706', color: '#fff' }}>
                    {flag.metric}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Strategy insight + link to full financials */}
        <div className="p-4 rounded-[10px] border border-[#99f6e4]"
          style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)' }}>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-[6px] bg-[#0d9488] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-[#0f172a] mb-1">Fundir Grant Strategy Insight</p>
              <p className="text-[12px] text-[#475569] leading-relaxed">
                CYC derives 74.6% of revenue from government contracts — above the 60% critical threshold.
                Head Start alone drives ~61% of total revenue, and 21st CCLC faces proposed federal elimination.
                The operating deficit and first-ever line-of-credit draw signal a liquidity squeeze.
                Fundir is prioritizing rapid-award, unrestricted private foundation grants to rebuild the
                2.4-month cash buffer and reduce federal exposure before FY2026 renewals.
              </p>
            </div>
          </div>
          <div className="mt-3 ml-10">
            <Link href="/financials"
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0d9488] hover:text-[#0f766e] transition-colors">
              View full financial analysis & org intelligence
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <p className="text-[10px] text-[#94a3b8] text-right">
          Source: FY2025 Audited Financial Statements · Kearney &amp; Company · Audit issued January 5, 2026
        </p>
      </div>
    </div>
  );
}
