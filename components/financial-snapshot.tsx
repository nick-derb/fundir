'use client';

import { ComputedFinancials, Filing990 } from '@/lib/propublica';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Shield, AlertTriangle,
  DollarSign, BarChart3, Clock, Info,
} from 'lucide-react';

interface FinancialSnapshotProps {
  orgName: string;
  ein: string;
  computed: ComputedFinancials;
  latest: Filing990;
  history: Filing990[];        // last 5 filings
  fetchedAt: string;
  filingYear: number;
}

function MetricCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-[#64748b]">{label}</span>
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center" style={{ background: bg }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div className="text-[22px] font-bold text-[#0f172a] leading-none">{value}</div>
      {sub && <p className="text-[11px] text-[#64748b] mt-1">{sub}</p>}
    </div>
  );
}

function RevenueBar({
  label, pct, color,
}: {
  label: string; pct: number; color: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] text-[#0f172a]">{label}</span>
        <span className="text-[13px] font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
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
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      <AlertTriangle className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function RevenueSparkline({ history }: { history: Filing990[] }) {
  const years = [...history].reverse(); // oldest first for chart
  if (years.length < 2) return null;

  const maxRev = Math.max(...years.map(f => f.totrevenue));
  const h = 48;

  const points = years.map((f, i) => {
    const x = (i / (years.length - 1)) * 200;
    const y = h - (f.totrevenue / maxRev) * h;
    return `${x},${y}`;
  });

  return (
    <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
      <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">
        Revenue Trend ({years[0].tax_prd_yr}–{years[years.length - 1].tax_prd_yr})
      </p>
      <div className="flex items-end gap-1">
        <svg viewBox={`0 0 200 ${h}`} className="flex-1 h-12" preserveAspectRatio="none">
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="#0d9488"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {years.map((f, i) => {
            const x = (i / (years.length - 1)) * 200;
            const y = h - (f.totrevenue / maxRev) * h;
            return <circle key={i} cx={x} cy={y} r="2.5" fill="#0d9488" />;
          })}
        </svg>
        <div className="text-right ml-3 flex-shrink-0">
          <p className="text-[11px] text-[#94a3b8]">Latest</p>
          <p className="text-[13px] font-bold text-[#0f172a]">
            {formatCurrency(years[years.length - 1].totrevenue)}
          </p>
        </div>
      </div>
      <div className="flex justify-between mt-1">
        {years.map(f => (
          <span key={f.tax_prd_yr} className="text-[10px] text-[#94a3b8]">'{String(f.tax_prd_yr).slice(2)}</span>
        ))}
      </div>
    </div>
  );
}

export function FinancialSnapshot({
  orgName, ein, computed, latest, history, fetchedAt, filingYear,
}: FinancialSnapshotProps) {
  const govtRisk = computed.govtDependency;
  const riskColor = govtRisk === 'critical' ? '#dc2626' : govtRisk === 'elevated' ? '#c2410c' : govtRisk === 'moderate' ? '#d97706' : '#16a34a';

  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0d9488]" />
            <h2 className="text-[15px] font-semibold text-[#0f172a]">Financial Analysis</h2>
            <span className="text-[11px] px-2 py-0.5 bg-white border border-[#e2e8f0] rounded-full text-[#94a3b8]">
              IRS Form 990 · {filingYear}
            </span>
          </div>
          <p className="text-[12px] text-[#64748b] mt-0.5">
            {orgName} · EIN {ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
          </p>
        </div>
        <DependencyBadge level={govtRisk} />
      </div>

      <div className="p-5">
        {/* Top metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
            sub={computed.monthsOfReserves >= 6 ? 'Healthy' : computed.monthsOfReserves >= 3 ? 'Adequate' : 'Low'}
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

        {/* Revenue mix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[12px] font-semibold text-[#94a3b8] uppercase tracking-widest mb-3">
              Revenue Composition
            </p>
            <RevenueBar
              label="Government Grants"
              pct={computed.governmentGrantsPct}
              color={computed.governmentGrantsPct >= 50 ? '#dc2626' : computed.governmentGrantsPct >= 30 ? '#d97706' : '#16a34a'}
            />
            <RevenueBar
              label="Private Grants & Gifts"
              pct={computed.privateGrantsPct}
              color="#2563eb"
            />
            <RevenueBar
              label="Program Service Revenue"
              pct={computed.programRevenuePct}
              color="#7c3aed"
            />
            {100 - computed.governmentGrantsPct - computed.privateGrantsPct - computed.programRevenuePct > 0 && (
              <RevenueBar
                label="Other Revenue"
                pct={Math.max(0, 100 - computed.governmentGrantsPct - computed.privateGrantsPct - computed.programRevenuePct)}
                color="#94a3b8"
              />
            )}
          </div>

          {/* Raw filing values */}
          <div>
            <p className="text-[12px] font-semibold text-[#94a3b8] uppercase tracking-widest mb-3">
              990 Key Line Items
            </p>
            <div className="space-y-2">
              {[
                { label: 'Total Revenue',           value: latest.totrevenue },
                { label: 'Total Expenses',           value: latest.totfuncexpns },
                { label: 'Government Grants',        value: latest.govtgrnts ?? 0 },
                { label: 'Private Gifts & Grants',   value: latest.gftgrntsrcvd },
                { label: 'Program Service Revenue',  value: latest.prgmservrev },
                { label: 'Total Assets (EOY)',        value: latest.totassetsend },
                { label: 'Total Liabilities (EOY)',   value: latest.totliabend },
                { label: 'Net Assets (EOY)',          value: latest.netassetsend },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#f8fafc] last:border-0">
                  <span className="text-[12px] text-[#64748b]">{label}</span>
                  <span className="text-[13px] font-semibold text-[#0f172a] font-mono">{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue sparkline */}
        {history.length >= 2 && <RevenueSparkline history={history} />}

        {/* AI grant strategy insight */}
        <div className="mt-5 p-4 bg-[#f0fdfa] rounded-[6px] border border-[#99f6e4] flex items-start gap-3">
          <Info className="w-4 h-4 text-[#0d9488] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-[#0f172a] mb-1">Fundir Grant Strategy Insight</p>
            <p className="text-[12px] text-[#475569] leading-relaxed">
              {computed.governmentGrantsPct >= 50
                ? `${orgName} derives ${computed.governmentGrantsPct}% of revenue from government grants — a critical concentration risk. Fundir is prioritizing private foundation and corporate grants to diversify your funding base.`
                : computed.governmentGrantsPct >= 30
                ? `Government grants make up ${computed.governmentGrantsPct}% of revenue. Fundir is surfacing both federal and private foundation opportunities to maintain a healthy mix.`
                : `${orgName} has a well-diversified revenue base (${computed.governmentGrantsPct}% government). Fundir is identifying growth opportunities across all grant categories.`
              }
              {` With ${computed.monthsOfReserves} months of reserves, `}
              {computed.monthsOfReserves >= 6
                ? 'the organization has a strong runway to pursue multi-year grant opportunities.'
                : computed.monthsOfReserves >= 3
                ? 'focus on grants with fast award timelines (3–6 months) to maintain liquidity.'
                : 'prioritizing rapid-award grants and bridge funding is strongly recommended.'}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-[#94a3b8] mt-3 text-right">
          Data via ProPublica Nonprofit Explorer · IRS 990 FY{filingYear} ·
          Synced {new Date(fetchedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
