'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3, TrendingDown, AlertTriangle,
  DollarSign, Users, Building2,
  ChevronRight, Brain, Library, Wand2, Zap,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import {
  YMCA_CORE, YMCA_REVENUE_HISTORY, YMCA_LEADERSHIP,
  YMCA_CONTRACTORS, YMCA_INTELLIGENCE_FLAGS,
} from '@/lib/ymca-live-data';
import {
  Card, SectionTitle,
  AITab, DocumentLibraryTab, StrategyBriefTab,
  type CommonTab,
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

// ── Revenue sparkline bars ────────────────────────────────────────────────────
//
// Same bug fix as CYC: container height bumped (now 140px), no clipping,
// tokens replace dark/saturated colors. Paired bars per year (revenue +
// expenses) so the gap between them reads as surplus or deficit.
function RevenueBars() {
  const CHART_H = 140;
  const years = YMCA_REVENUE_HISTORY.slice(-7);
  const max = Math.max(...years.map(y => Math.max(y.revenue, y.expenses)));
  return (
    <div className="flex items-end gap-3 pt-2">
      {years.map(y => {
        const rev    = y.revenue;
        const exp    = y.expenses;
        const revH   = Math.round((rev / max) * CHART_H);
        const expH   = Math.round((exp / max) * CHART_H);
        const isPos  = rev >= exp;
        return (
          <div key={y.year} className="flex-1 flex flex-col items-center gap-1.5">
            <span className={`font-mono text-[10.5px] font-semibold tabular-nums ${isPos ? 'text-success' : 'text-critical'}`}>
              {isPos ? `+${fmt(rev - exp)}` : `(${fmt(exp - rev)})`}
            </span>
            <div className="w-full relative flex items-end gap-1 justify-center bg-page border border-hairline rounded-sm" style={{ height: CHART_H }}>
              <div className="flex-1 rounded-sm" style={{
                height: revH,
                background: 'linear-gradient(to top, var(--accent), color-mix(in srgb, var(--accent) 35%, transparent))',
                borderTop: '2px solid var(--accent)',
              }} />
              <div className="flex-1 rounded-sm" style={{
                height: expH,
                background: 'linear-gradient(to top, var(--critical), color-mix(in srgb, var(--critical) 35%, transparent))',
                borderTop: '2px solid var(--critical)',
              }} />
            </div>
            <span className="font-mono text-[10.5px] font-semibold text-primary tabular-nums">{fmt(rev)}</span>
            <span className="font-mono text-[10.5px] text-tertiary tabular-nums">{y.year}</span>
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
  const sev = {
    critical: { tone: 'text-critical', left: 'border-l-critical' },
    warning:  { tone: 'text-warning',  left: 'border-l-warning'  },
    info:     { tone: 'text-info',     left: 'border-l-info'     },
  }[severity];

  return (
    <div className={`rounded-sm border border-hairline border-l-[3px] ${sev.left} bg-surface p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${sev.tone}`} />
          <p className={`text-[13px] font-semibold ${sev.tone} truncate`}>{headline}</p>
        </div>
        <span className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] ${sev.tone} flex-shrink-0`}>
          {category}
        </span>
      </div>
      <p className="text-[11.5px] text-muted leading-relaxed mb-3">{detail}</p>
      <div className="flex items-center gap-2 pt-2.5 border-t border-hairline">
        <Zap className={`w-3 h-3 flex-shrink-0 ${sev.tone}`} />
        <p className="text-[11.5px] font-medium leading-relaxed text-primary">{action}</p>
        <span className={`ml-auto font-mono text-[10.5px] font-semibold tabular-nums ${sev.tone} flex-shrink-0`}>
          {metric}
        </span>
      </div>
    </div>
  );
}

// ── TAB: Overview ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const core      = YMCA_CORE;
  const compPct   = ((core.employeeCompensation / core.revenue) * 100).toFixed(1);
  const deficitPct = ((Math.abs(core.netChange) / core.revenue) * 100).toFixed(1);
  const critCount = YMCA_INTELLIGENCE_FLAGS.filter(f => f.severity === 'critical').length;
  const warnCount = YMCA_INTELLIGENCE_FLAGS.filter(f => f.severity === 'warning').length;
  const infoCount = YMCA_INTELLIGENCE_FLAGS.filter(f => f.severity === 'info').length;

  const kpis = [
    {
      label: 'Total Revenue',
      value: fmt(core.revenue),
      sub: 'FY2024 (YE Dec 31)',
      icon: DollarSign,
      color: 'var(--accent)',
      bg: 'var(--accent-tint)',
      neg: false,
    },
    {
      label: 'Total Expenses',
      value: fmt(core.expenses),
      sub: 'Expenses exceed revenue 30%',
      icon: TrendingDown,
      color: 'var(--critical)',
      bg: 'var(--critical-tint)',
      neg: true,
    },
    {
      label: 'Net Deficit',
      value: `(${fmt(Math.abs(core.netChange))})`,
      sub: `${deficitPct}% of revenue`,
      icon: TrendingDown,
      color: 'var(--critical)',
      bg: 'var(--critical-tint)',
      neg: true,
    },
    {
      label: 'Employee Comp',
      value: `${compPct}%`,
      sub: `${fmt(core.employeeCompensation)} of revenue`,
      icon: Users,
      color: 'var(--warning)',
      bg: 'var(--warning-tint)',
      neg: false,
    },
  ] as const;

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg, neg }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-wide">{label}</span>
              <div className="w-6 h-6 rounded-[5px] flex items-center justify-center" style={{ background: bg }}>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
            </div>
            <div className={`text-[22px] font-bold leading-none mb-1 ${neg ? 'text-critical' : 'text-primary'}`}>{value}</div>
            <p className="text-[10px] text-tertiary">{sub}</p>
          </Card>
        ))}
      </div>

      {/* Revenue vs expenses trend */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[12px] font-bold text-muted">Revenue vs. Expenses — 7-Year Trend</p>
            <p className="text-[11px] text-tertiary">
              <span className="inline-block w-2 h-2 rounded-sm bg-accent mr-1" />Revenue&nbsp;&nbsp;
              <span className="inline-block w-2 h-2 rounded-sm bg-critical mr-1" />Expenses
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-secondary">FY2024 Gap</p>
            <p className="text-[16px] font-bold text-critical font-mono">{fmt(Math.abs(core.netChange))}</p>
          </div>
        </div>
        <RevenueBars />
      </Card>

      {/* Intelligence flags */}
      <div>
        <SectionTitle
          title="Intelligence Flags"
          sub={`${critCount} critical · ${warnCount} warning · ${infoCount} informational — derived from IRS Form 990 (FY2024)`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {YMCA_INTELLIGENCE_FLAGS.map((f, i) => <Flag key={i} {...f} />)}
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-3 py-3.5 px-5 rounded-xl border"
        style={{ background: 'var(--accent-tint)', borderColor: 'var(--accent)' }}>
        <Zap className="w-4 h-4 text-accent flex-shrink-0" />
        <p className="text-secondary text-[12px]">
          YMCA Metro Chicago carries a <strong className="text-primary">$24.1M operating deficit</strong> —
          prioritize unrestricted general operating grants and workforce development funding.
        </p>
        <Link href="/discover"
          className="ml-auto flex-shrink-0 text-[11px] font-bold text-accent hover:text-accent transition-colors flex items-center gap-1 whitespace-nowrap">
          Find matching grants <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── TAB: Compensation ─────────────────────────────────────────────────────────
function CompensationTab() {
  const core    = YMCA_CORE;
  const avgComp = Math.round(
    YMCA_LEADERSHIP.reduce((s, l) => s + l.total, 0) / YMCA_LEADERSHIP.length
  );

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees',     value: core.totalEmployees.toLocaleString(), color: 'var(--accent)' },
          { label: 'Employee Comp (Total)',value: fmt(core.employeeCompensation),       color: 'var(--warning)' },
          { label: 'Disclosed Executives', value: `${YMCA_LEADERSHIP.length} officers`, color: 'var(--info)' },
          { label: 'Avg Exec Comp',        value: fmt(avgComp),                         color: 'var(--info)' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-wide mb-2">{label}</p>
            <p className="text-[20px] font-bold font-mono" style={{ color }}>{value}</p>
          </Card>
        ))}
      </div>

      <SectionTitle
        title="Executive Compensation — FY2024 Schedule J"
        sub="IRS Form 990 · Fiscal year ended December 31, 2024 · EIN 36-2179782"
      />

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-elevated)' }}>
              {['Name / Title', 'From Org', 'Other', 'Total', 'YoY'].map((h, i) => (
                <th key={h} className={`py-2.5 px-4 text-[10px] font-bold text-secondary uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {YMCA_LEADERSHIP.map(leader => {
              const yoy = leader.vsLastYear;
              return (
                <tr key={leader.name} className="border-t hover:bg-elevated transition-colors"
                  style={{ borderColor: 'var(--bg-elevated)' }}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-primary">{leader.name}</p>
                        <p className="text-[11px] text-accent mt-0.5">{leader.title}</p>
                      </div>
                      {leader.isNew && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-success border border-success/20 flex-shrink-0"
                          style={{ background: 'var(--success-tint)' }}>NEW</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[13px] font-mono text-muted">{fmtFull(leader.fromOrg)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[13px] font-mono text-secondary">{fmtFull(leader.other)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[14px] font-bold font-mono text-primary">{fmtFull(leader.total)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {yoy === null ? (
                      <span className="text-[11px] text-tertiary">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${yoy > 0 ? 'text-success' : yoy < 0 ? 'text-critical' : 'text-secondary'}`}>
                        {yoy > 0 ? <ArrowUp className="w-3 h-3" /> : yoy < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {Math.abs(yoy).toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-elevated)' }}>
              <td className="py-3 px-4 text-[12px] font-bold text-primary">
                Total ({YMCA_LEADERSHIP.length} disclosed) · {core.totalEmployees.toLocaleString()} total employees
              </td>
              <td />
              <td />
              <td className="py-3 px-4 text-right text-[13px] font-bold text-primary font-mono">
                {fmtFull(YMCA_LEADERSHIP.reduce((s, l) => s + l.total, 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="rounded-xl border p-4 flex items-start gap-3"
        style={{ background: 'var(--warning-tint)', borderColor: 'var(--warning)' }}>
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-warning leading-relaxed">
          <strong>Employee compensation totals $59.4M</strong> — 57% of total revenue and 56.8% of all expenses.
          Only 15 executive salaries are disclosed on Schedule J; the remaining {(core.totalEmployees - 15).toLocaleString()} employees average ~$19,359.
          For grant applications, address this ratio directly and emphasize direct service delivery impact per dollar.
        </p>
      </div>
    </div>
  );
}

// ── TAB: Contractors ──────────────────────────────────────────────────────────
function ContractorsTab() {
  const core = YMCA_CORE;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Contractor Spend',  value: fmt(core.contractorCompensation), color: 'var(--critical)' },
          { label: 'Reported Vendors',         value: '5 vendors',                      color: 'var(--info)' },
          { label: 'New in FY2024',            value: '3 of 5 new',                    color: 'var(--warning)' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-wide mb-2">{label}</p>
            <p className="text-[20px] font-bold font-mono" style={{ color }}>{value}</p>
          </Card>
        ))}
      </div>

      <SectionTitle
        title="Top Contractors — FY2024"
        sub="IRS Form 990 Part VII Section B · Five highest-paid independent contractors"
      />

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-elevated)' }}>
              {['Contractor', 'Category', 'Amount', 'YoY'].map((h, i) => (
                <th key={h} className={`py-2.5 px-4 text-[10px] font-bold text-secondary uppercase tracking-wide ${i === 0 || i === 1 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {YMCA_CONTRACTORS.map(c => {
              const yoy = c.vsLastYear;
              return (
                <tr key={c.name} className="border-t hover:bg-elevated transition-colors"
                  style={{ borderColor: 'var(--bg-elevated)' }}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-tertiary flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-semibold text-primary">{c.name}</p>
                        {c.isNew && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-success border border-success/20 inline-block mt-0.5"
                            style={{ background: 'var(--success-tint)' }}>NEW IN 2024</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] px-2 py-0.5 rounded text-accent border border-accent/20"
                      style={{ background: 'var(--accent-tint)' }}>{c.category}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[14px] font-bold font-mono text-primary">{fmtFull(c.amount)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {yoy === null ? (
                      <span className="text-[11px] text-tertiary">New</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${yoy > 0 ? 'text-success' : yoy < 0 ? 'text-critical' : 'text-secondary'}`}>
                        {yoy > 0 ? <ArrowUp className="w-3 h-3" /> : yoy < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {yoy === 0 ? 'Flat' : `${Math.abs(yoy).toFixed(1)}%`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-elevated)' }}>
              <td className="py-3 px-4 text-[12px] font-bold text-primary">Total Contractor Compensation</td>
              <td />
              <td className="py-3 px-4 text-right text-[13px] font-bold text-primary font-mono">
                {fmtFull(core.contractorCompensation)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ background: 'var(--warning-tint)', borderColor: 'var(--warning)' }}>
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-warning">High Contractor Turnover Signal</p>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed">
            3 of 5 top contractors are new in FY2024, suggesting a significant shift in facility and operational strategy.
            P4 Security dropped 36.4%, replaced by Stanton Mechanical ($1.9M) and Rmb Interiors ($676K) — indicating capital investment in facilities.
          </p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: 'var(--accent-tint)', borderColor: 'var(--accent)' }}>
          <div className="flex items-start gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-accent">Grant Opportunity: Child Care Staffing</p>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed">
            Childcare Careers ($844K) signals contracted child care staffing — a direct grant opportunity for workforce development in early childhood education. Target DCFS and CCAP-adjacent funding streams.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const YMCA_TABS = [
  { id: 'overview',      label: 'Overview',      icon: BarChart3   },
  { id: 'compensation',  label: 'Compensation',  icon: Users       },
  { id: 'contractors',   label: 'Contractors',   icon: Building2   },
] as const;

type YMCATab = typeof YMCA_TABS[number]['id'];
type AnyTab  = YMCATab | CommonTab;

const ALL_TABS = [
  ...YMCA_TABS,
  { id: 'ai',       label: 'AI Analyzer',    icon: Brain   },
  { id: 'docs',     label: 'Documents',      icon: Library },
  { id: 'strategy', label: 'Strategy Brief', icon: Wand2   },
] as const;

// ── YMCA Financials Shell ─────────────────────────────────────────────────────
export function YMCAFinancialsShell({
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

      {/* ── Hero — light surface, hairline bottom, accent eyebrow ────────── */}
      <div className="bg-surface border-b border-hairline">
        <div className="px-8 py-7 max-w-7xl mx-auto flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-accent" />
              <span className="font-mono text-[10.5px] font-semibold text-accent uppercase tracking-[0.14em]">
                Org Intelligence · Financials
              </span>
            </div>
            <h1 className="text-h1 text-primary leading-tight">YMCA of Metropolitan Chicago</h1>
            <p className="text-secondary text-[13px] mt-1">
              Founded <span className="font-mono tabular-nums">{YMCA_CORE.founded}</span> ·{' '}
              <span className="font-mono tabular-nums">{YMCA_CORE.totalEmployees.toLocaleString()}</span> employees · Chicago, IL · EIN{' '}
              <span className="font-mono tabular-nums">{YMCA_CORE.ein}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-critical inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-critical" />
              FY2024 IRS 990 · ($24.1M) Deficit
            </span>
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-info inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              #9 &amp; #10 Human Services · Chicago
            </span>
          </div>
        </div>
      </div>

      {/* ── Sticky tab nav — light, hairline bottom, 2px accent on active ─ */}
      <div className="sticky top-0 z-20 bg-surface border-b border-hairline">
        <div
          className="px-8 max-w-7xl mx-auto flex items-center overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {ALL_TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id as AnyTab)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 py-3.5 text-[12.5px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'text-primary border-accent'
                    : 'text-tertiary border-transparent hover:text-primary'
                }`}
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

      {/* ── Tab content ──────────────────────────────────────── */}
      <div className="px-8 py-7 max-w-7xl mx-auto">
        {tab === 'overview'     && <OverviewTab />}
        {tab === 'compensation' && <CompensationTab />}
        {tab === 'contractors'  && <ContractorsTab />}
        {tab === 'ai'           && (
          <AITab orgCode={orgCode} orgId={orgId} orgName={orgName}
            googleConnected={googleConnected} microsoftConnected={microsoftConnected} />
        )}
        {tab === 'docs'         && (
          <DocumentLibraryTab orgCode={orgCode} orgId={orgId} orgName={orgName}
            googleConnected={googleConnected} microsoftConnected={microsoftConnected}
            onSwitchToAnalyzer={() => setTab('ai')} />
        )}
        {tab === 'strategy'     && <StrategyBriefTab orgCode={orgCode} orgName={orgName} />}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="px-8 pb-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between py-4 border-t" style={{ borderColor: 'var(--fin-border)' }}>
          <p className="text-[11px] text-tertiary">
            Source: IRS Form 990 (FY2024) · Compensation990.com · EIN 36-2179782 · ymcachicago.org
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
