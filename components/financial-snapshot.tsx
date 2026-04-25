'use client';

import { ComputedFinancials, Filing990 } from '@/lib/propublica';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Shield, AlertTriangle,
  DollarSign, BarChart3, Clock, Info, CheckCircle, XCircle, MinusCircle,
} from 'lucide-react';

interface FinancialSnapshotProps {
  orgName: string;
  ein: string;
  computed: ComputedFinancials;
  latest: Filing990;
  history: Filing990[];
  fetchedAt: string;
  filingYear: number;
}

function MetricCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div className="text-[22px] font-bold text-[#0f172a] leading-none tabular-nums">{value}</div>
      {sub && <p className="text-[11px] text-[#64748b] mt-1.5">{sub}</p>}
    </div>
  );
}

function RevenueBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-[#475569] font-medium">{label}</span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function DependencyBadge({ level }: { level: ComputedFinancials['govtDependency'] }) {
  const map = {
    critical: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Critical Dependency' },
    elevated: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', label: 'Elevated Dependency' },
    moderate: { bg: '#fffbeb', text: '#d97706', border: '#fde68a', label: 'Moderate Dependency' },
    low:      { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', label: 'Low Dependency' },
  };
  const s = map[level];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}>
      <AlertTriangle className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function AreaSparkline({ history }: { history: Filing990[] }) {
  const years = [...history].reverse();
  if (years.length < 2) return null;

  const maxRev = Math.max(...years.map(f => f.totrevenue));
  const minRev = Math.min(...years.map(f => f.totrevenue));
  const range  = maxRev - minRev || 1;
  const W = 300, H = 64, PAD = 4;

  const pts = years.map((f, i) => {
    const x = PAD + (i / (years.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((f.totrevenue - minRev) / range) * (H - PAD * 2);
    return { x, y, f };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;

  const cagr = years.length >= 2
    ? (((years[years.length - 1].totrevenue / years[0].totrevenue) ** (1 / (years.length - 1))) - 1) * 100
    : 0;
  const cagrColor = cagr > 5 ? '#16a34a' : cagr > 0 ? '#d97706' : '#dc2626';

  return (
    <div className="mt-5 pt-5 border-t border-[#f1f5f9]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">
          Revenue Trend · {years[0].tax_prd_yr}–{years[years.length - 1].tax_prd_yr}
        </p>
        <div className="flex items-center gap-1.5">
          {cagr > 0 ? <TrendingUp className="w-3 h-3" style={{ color: cagrColor }} />
                    : <TrendingDown className="w-3 h-3" style={{ color: cagrColor }} />}
          <span className="text-[11px] font-bold" style={{ color: cagrColor }}>
            {cagr > 0 ? '+' : ''}{cagr.toFixed(1)}% CAGR
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={linePath} fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(({ x, y, f }, i) => (
          <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5}
            fill={i === pts.length - 1 ? '#0d9488' : '#fff'}
            stroke="#0d9488" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {years.map(f => (
          <span key={f.tax_prd_yr} className="text-[10px] text-[#94a3b8]">'{String(f.tax_prd_yr).slice(2)}</span>
        ))}
      </div>
      {/* Year-over-year values */}
      <div className="flex justify-between mt-2">
        {years.map((f, i) => {
          const prev = i > 0 ? years[i - 1] : null;
          const delta = prev ? ((f.totrevenue - prev.totrevenue) / prev.totrevenue) * 100 : null;
          return (
            <div key={f.tax_prd_yr} className="text-center">
              <p className="text-[10px] font-bold text-[#0f172a] tabular-nums">
                {f.totrevenue >= 1_000_000
                  ? `$${(f.totrevenue / 1_000_000).toFixed(1)}M`
                  : `$${(f.totrevenue / 1_000).toFixed(0)}K`}
              </p>
              {delta !== null && (
                <p className={`text-[9px] font-medium ${delta > 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GrantReadinessGauge({ computed, filingYear }: { computed: ComputedFinancials; filingYear: number }) {
  // Score each dimension
  const reserve  = Math.min(computed.monthsOfReserves / 12, 1) * 25;
  const govtRisk = computed.govtDependency === 'low' ? 25 : computed.govtDependency === 'moderate' ? 18 : computed.govtDependency === 'elevated' ? 10 : 5;
  const diversity = Math.min((100 - computed.governmentGrantsPct) / 100, 1) * 25;
  const positive  = computed.netAssets > 0 ? 25 : 0;
  const score     = Math.round(reserve + govtRisk + diversity + positive);
  const color     = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : score >= 40 ? '#c2410c' : '#dc2626';
  const label     = score >= 80 ? 'Grant-Ready' : score >= 60 ? 'Competitive' : score >= 40 ? 'Needs Work' : 'High Risk';

  const dimensions = [
    { label: 'Cash Reserves',    score: Math.round(reserve),   max: 25, tip: `${computed.monthsOfReserves}mo reserves` },
    { label: 'Funding Mix',      score: Math.round(govtRisk),  max: 25, tip: `${computed.govtDependency} govt dependency` },
    { label: 'Revenue Diversity',score: Math.round(diversity), max: 25, tip: `${computed.governmentGrantsPct}% govt revenue` },
    { label: 'Balance Sheet',    score: Math.round(positive),  max: 25, tip: computed.netAssets > 0 ? 'Positive net assets' : 'Negative net assets' },
  ];

  const r = 42, cx = 52, cy = 52, circ = 2 * Math.PI * r;
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
        {/* Gauge */}
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
        {/* Dimensions */}
        <div className="flex-1 space-y-2">
          {dimensions.map(({ label, score: s, max, tip }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-[#64748b]">{label}</span>
                <span className="text-[10px] font-bold text-[#0f172a]">{s}/{max}</span>
              </div>
              <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(s / max) * 100}%`, background: s / max >= 0.7 ? '#16a34a' : s / max >= 0.4 ? '#d97706' : '#dc2626' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadinessSignal({ ok, label }: { ok: boolean | 'warn'; label: string }) {
  const Icon = ok === true ? CheckCircle : ok === 'warn' ? MinusCircle : XCircle;
  const color = ok === true ? '#16a34a' : ok === 'warn' ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
      <span className="text-[12px] text-[#475569]">{label}</span>
    </div>
  );
}

export function FinancialSnapshot({
  orgName, ein, computed, latest, history, fetchedAt, filingYear,
}: FinancialSnapshotProps) {
  const govtRisk  = computed.govtDependency;
  const riskColor = govtRisk === 'critical' ? '#dc2626' : govtRisk === 'elevated' ? '#c2410c' : govtRisk === 'moderate' ? '#d97706' : '#16a34a';

  const otherPct = Math.max(0, 100 - computed.governmentGrantsPct - computed.privateGrantsPct - computed.programRevenuePct);

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
            <span className="text-[10px] px-2 py-0.5 bg-white border border-[#e2e8f0] rounded-full text-[#94a3b8] font-medium">
              IRS Form 990 · FY{filingYear}
            </span>
          </div>
          <p className="text-[12px] text-[#64748b] mt-0.5 ml-9">
            {orgName} · EIN {ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
          </p>
        </div>
        <DependencyBadge level={govtRisk} />
      </div>

      <div className="p-5 space-y-6">
        {/* Top metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Total Revenue"
            value={formatCurrency(computed.totalRevenue)}
            sub={`FY ${filingYear}`}
            icon={DollarSign}
            color="#0d9488"
            bg="#f0fdfa"
          />
          <MetricCard
            label="Net Assets"
            value={formatCurrency(computed.netAssets)}
            sub="End of year"
            icon={computed.netAssets > 0 ? TrendingUp : TrendingDown}
            color={computed.netAssets > 0 ? '#16a34a' : '#dc2626'}
            bg={computed.netAssets > 0 ? '#f0fdf4' : '#fef2f2'}
          />
          <MetricCard
            label="Months of Reserves"
            value={`${computed.monthsOfReserves}mo`}
            sub={computed.monthsOfReserves >= 6 ? 'Healthy reserve' : computed.monthsOfReserves >= 3 ? 'Adequate' : 'Below target'}
            icon={Clock}
            color={computed.monthsOfReserves >= 6 ? '#16a34a' : computed.monthsOfReserves >= 3 ? '#d97706' : '#dc2626'}
            bg={computed.monthsOfReserves >= 6 ? '#f0fdf4' : computed.monthsOfReserves >= 3 ? '#fffbeb' : '#fef2f2'}
          />
          <MetricCard
            label="Govt Grant Risk"
            value={`${computed.governmentGrantsPct}%`}
            sub="of total revenue"
            icon={Shield}
            color={riskColor}
            bg={riskColor + '15'}
          />
        </div>

        {/* Grant Readiness Gauge */}
        <GrantReadinessGauge computed={computed} filingYear={filingYear} />

        {/* Revenue mix + line items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-4">Revenue Composition</p>
            <RevenueBar
              label="Government Grants"
              pct={computed.governmentGrantsPct}
              color={computed.governmentGrantsPct >= 50 ? '#dc2626' : computed.governmentGrantsPct >= 30 ? '#d97706' : '#16a34a'}
            />
            <RevenueBar label="Private Grants & Gifts" pct={computed.privateGrantsPct}  color="#2563eb" />
            <RevenueBar label="Program Service Revenue" pct={computed.programRevenuePct} color="#7c3aed" />
            {otherPct > 0 && <RevenueBar label="Other Revenue" pct={otherPct} color="#94a3b8" />}

            {/* Quick health signals */}
            <div className="mt-5 pt-4 border-t border-[#f1f5f9] space-y-2">
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2.5">Health Signals</p>
              <ReadinessSignal
                ok={computed.monthsOfReserves >= 6 ? true : computed.monthsOfReserves >= 3 ? 'warn' : false}
                label={`${computed.monthsOfReserves}mo cash reserves ${computed.monthsOfReserves >= 6 ? '(strong)' : computed.monthsOfReserves >= 3 ? '(adequate)' : '(low)'}`}
              />
              <ReadinessSignal
                ok={computed.netAssets > 0 ? true : false}
                label={`Net assets ${computed.netAssets > 0 ? 'positive' : 'negative'} (${formatCurrency(Math.abs(computed.netAssets))})`}
              />
              <ReadinessSignal
                ok={computed.governmentGrantsPct < 30 ? true : computed.governmentGrantsPct < 50 ? 'warn' : false}
                label={`Government revenue ${computed.governmentGrantsPct >= 50 ? 'concentration risk' : computed.governmentGrantsPct >= 30 ? 'moderate exposure' : 'well diversified'}`}
              />
              <ReadinessSignal
                ok={computed.privateGrantsPct >= 20 ? true : computed.privateGrantsPct >= 10 ? 'warn' : false}
                label={`Private grants ${computed.privateGrantsPct}% of revenue`}
              />
            </div>
          </div>

          {/* Key line items */}
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-4">990 Key Line Items</p>
            <div className="space-y-1.5">
              {[
                { label: 'Total Revenue',           value: latest.totrevenue,       highlight: true },
                { label: 'Total Expenses',           value: latest.totfuncexpns,     highlight: false },
                { label: 'Government Grants',        value: latest.govtgrnts ?? 0,   highlight: false },
                { label: 'Private Gifts & Grants',   value: latest.gftgrntsrcvd,     highlight: false },
                { label: 'Program Service Revenue',  value: latest.prgmservrev,      highlight: false },
                { label: 'Total Assets (EOY)',        value: latest.totassetsend,     highlight: false },
                { label: 'Total Liabilities (EOY)',   value: latest.totliabend,       highlight: false },
                { label: 'Net Assets (EOY)',          value: latest.netassetsend,     highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label} className={`flex items-center justify-between py-2 px-2.5 rounded-[6px] ${highlight ? 'bg-[#f8fafc]' : ''}`}>
                  <span className="text-[12px] text-[#64748b]">{label}</span>
                  <span className={`text-[13px] font-semibold font-mono tabular-nums ${highlight ? 'text-[#0f172a]' : 'text-[#475569]'}`}>
                    {formatCurrency(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue sparkline */}
        {history.length >= 2 && <AreaSparkline history={history} />}

        {/* AI Strategy Insight */}
        <div className="p-4 rounded-[10px] border border-[#99f6e4]"
          style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)' }}>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-[6px] bg-[#0d9488] flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-[#0f172a] mb-1">Fundir Grant Strategy Insight</p>
              <p className="text-[12px] text-[#475569] leading-relaxed">
                {computed.governmentGrantsPct >= 50
                  ? `${orgName} derives ${computed.governmentGrantsPct}% of revenue from government grants — a critical concentration risk. Fundir is prioritizing private foundation and corporate grants to diversify your funding base.`
                  : computed.governmentGrantsPct >= 30
                  ? `Government grants make up ${computed.governmentGrantsPct}% of revenue. Fundir is surfacing both federal and private foundation opportunities to maintain a healthy mix.`
                  : `${orgName} has a well-diversified revenue base (${computed.governmentGrantsPct}% government). Fundir is identifying growth opportunities across all grant categories.`
                }
                {` With ${computed.monthsOfReserves} months of reserves, `}
                {computed.monthsOfReserves >= 6
                  ? 'the organization has strong runway to pursue multi-year grant opportunities.'
                  : computed.monthsOfReserves >= 3
                  ? 'focus on grants with fast award timelines (3–6 months) to maintain liquidity.'
                  : 'prioritizing rapid-award grants and bridge funding is strongly recommended.'}
              </p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-[#94a3b8] text-right">
          Data via ProPublica Nonprofit Explorer · IRS 990 FY{filingYear} · Synced {new Date(fetchedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
