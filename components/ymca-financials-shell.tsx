'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3, TrendingDown, AlertTriangle,
  DollarSign, Users, Building2,
  ChevronRight, TrendingUp, Brain, Library, Wand2, Zap,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import {
  YMCA_CORE, YMCA_REVENUE_HISTORY, YMCA_LEADERSHIP,
  YMCA_CONTRACTORS, YMCA_INTELLIGENCE_FLAGS,
} from '@/lib/ymca-live-data';
import {
  Card, CardHeader, SectionTitle,
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
function RevenueBars() {
  const years = YMCA_REVENUE_HISTORY.slice(-7);
  const max = Math.max(...years.map(y => y.expenses));
  return (
    <div className="flex items-end gap-3" style={{ height: 110 }}>
      {years.map(y => {
        const rev    = y.revenue;
        const exp    = y.expenses;
        const revH   = Math.round((rev / max) * 64);
        const expH   = Math.round((exp / max) * 64);
        const isPos  = rev >= exp;
        return (
          <div key={y.year} className="flex-1 flex flex-col items-center gap-1">
            <span className={`text-[10px] font-bold font-mono ${isPos ? 'text-green-400' : 'text-red-400'}`}>
              {isPos ? `+${fmt(rev - exp)}` : `(${fmt(exp - rev)})`}
            </span>
            <div className="w-full relative flex items-end gap-px justify-center" style={{ height: 60 }}>
              <div className="flex-1 rounded-[3px]" style={{
                height: revH,
                background: 'linear-gradient(to top,rgba(13,148,136,0.8),rgba(13,148,136,0.25))',
                borderTop: '2px solid #0d9488',
              }} />
              <div className="flex-1 rounded-[3px]" style={{
                height: expH,
                background: 'linear-gradient(to top,rgba(239,68,68,0.6),rgba(239,68,68,0.15))',
                borderTop: '2px solid #ef4444',
              }} />
            </div>
            <span className="text-[10px] font-mono text-slate-400">{fmt(rev)}</span>
            <span className="text-[9px] text-slate-600">{y.year}</span>
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
      color: '#0d9488',
      bg: 'rgba(13,148,136,0.15)',
      neg: false,
    },
    {
      label: 'Total Expenses',
      value: fmt(core.expenses),
      sub: 'Expenses exceed revenue 30%',
      icon: TrendingDown,
      color: '#f87171',
      bg: 'rgba(239,68,68,0.15)',
      neg: true,
    },
    {
      label: 'Net Deficit',
      value: `(${fmt(Math.abs(core.netChange))})`,
      sub: `${deficitPct}% of revenue`,
      icon: TrendingDown,
      color: '#f87171',
      bg: 'rgba(239,68,68,0.15)',
      neg: true,
    },
    {
      label: 'Employee Comp',
      value: `${compPct}%`,
      sub: `${fmt(core.employeeCompensation)} of revenue`,
      icon: Users,
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.15)',
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

      {/* Revenue vs expenses trend */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[12px] font-bold text-slate-300">Revenue vs. Expenses — 7-Year Trend</p>
            <p className="text-[11px] text-slate-600">
              <span className="inline-block w-2 h-2 rounded-sm bg-teal-500 mr-1" />Revenue&nbsp;&nbsp;
              <span className="inline-block w-2 h-2 rounded-sm bg-red-500 mr-1" />Expenses
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">FY2024 Gap</p>
            <p className="text-[16px] font-bold text-red-400 font-mono">{fmt(Math.abs(core.netChange))}</p>
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
        style={{ background: 'rgba(13,148,136,0.06)', borderColor: 'rgba(13,148,136,0.18)' }}>
        <Zap className="w-4 h-4 text-teal-400 flex-shrink-0" />
        <p className="text-slate-400 text-[12px]">
          YMCA Metro Chicago carries a <strong className="text-white">$24.1M operating deficit</strong> —
          prioritize unrestricted general operating grants and workforce development funding.
        </p>
        <Link href="/discover"
          className="ml-auto flex-shrink-0 text-[11px] font-bold text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 whitespace-nowrap">
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
          { label: 'Total Employees',     value: core.totalEmployees.toLocaleString(), color: '#0d9488' },
          { label: 'Employee Comp (Total)',value: fmt(core.employeeCompensation),       color: '#fbbf24' },
          { label: 'Disclosed Executives', value: `${YMCA_LEADERSHIP.length} officers`, color: '#38bdf8' },
          { label: 'Avg Exec Comp',        value: fmt(avgComp),                         color: '#a78bfa' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
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
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              {['Name / Title', 'From Org', 'Other', 'Total', 'YoY'].map((h, i) => (
                <th key={h} className={`py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {YMCA_LEADERSHIP.map(leader => {
              const yoy = leader.vsLastYear;
              return (
                <tr key={leader.name} className="border-t hover:bg-white/[0.02] transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-slate-100">{leader.name}</p>
                        <p className="text-[11px] text-teal-400 mt-0.5">{leader.title}</p>
                      </div>
                      {leader.isNew && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-green-400 border border-green-400/20 flex-shrink-0"
                          style={{ background: 'rgba(34,197,94,0.08)' }}>NEW</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[13px] font-mono text-slate-300">{fmtFull(leader.fromOrg)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[13px] font-mono text-slate-500">{fmtFull(leader.other)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[14px] font-bold font-mono text-slate-100">{fmtFull(leader.total)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {yoy === null ? (
                      <span className="text-[11px] text-slate-600">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${yoy > 0 ? 'text-green-400' : yoy < 0 ? 'text-red-400' : 'text-slate-400'}`}>
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
            <tr className="border-t-2" style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.02)' }}>
              <td className="py-3 px-4 text-[12px] font-bold text-slate-200">
                Total ({YMCA_LEADERSHIP.length} disclosed) · {core.totalEmployees.toLocaleString()} total employees
              </td>
              <td />
              <td />
              <td className="py-3 px-4 text-right text-[13px] font-bold text-slate-200 font-mono">
                {fmtFull(YMCA_LEADERSHIP.reduce((s, l) => s + l.total, 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="rounded-xl border p-4 flex items-start gap-3"
        style={{ background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }}>
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-300 leading-relaxed">
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
          { label: 'Total Contractor Spend',  value: fmt(core.contractorCompensation), color: '#f87171' },
          { label: 'Reported Vendors',         value: '5 vendors',                      color: '#38bdf8' },
          { label: 'New in FY2024',            value: '3 of 5 new',                    color: '#fbbf24' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
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
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              {['Contractor', 'Category', 'Amount', 'YoY'].map((h, i) => (
                <th key={h} className={`py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide ${i === 0 || i === 1 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {YMCA_CONTRACTORS.map(c => {
              const yoy = c.vsLastYear;
              return (
                <tr key={c.name} className="border-t hover:bg-white/[0.02] transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-semibold text-slate-100">{c.name}</p>
                        {c.isNew && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-green-400 border border-green-400/20 inline-block mt-0.5"
                            style={{ background: 'rgba(34,197,94,0.08)' }}>NEW IN 2024</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] px-2 py-0.5 rounded text-teal-400 border border-teal-400/20"
                      style={{ background: 'rgba(13,148,136,0.08)' }}>{c.category}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[14px] font-bold font-mono text-slate-100">{fmtFull(c.amount)}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {yoy === null ? (
                      <span className="text-[11px] text-slate-600">New</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${yoy > 0 ? 'text-green-400' : yoy < 0 ? 'text-red-400' : 'text-slate-400'}`}>
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
            <tr className="border-t-2" style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.02)' }}>
              <td className="py-3 px-4 text-[12px] font-bold text-slate-200">Total Contractor Compensation</td>
              <td />
              <td className="py-3 px-4 text-right text-[13px] font-bold text-slate-200 font-mono">
                {fmtFull(core.contractorCompensation)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' }}>
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-amber-300">High Contractor Turnover Signal</p>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            3 of 5 top contractors are new in FY2024, suggesting a significant shift in facility and operational strategy.
            P4 Security dropped 36.4%, replaced by Stanton Mechanical ($1.9M) and Rmb Interiors ($676K) — indicating capital investment in facilities.
          </p>
        </div>
        <div className="rounded-xl border p-4" style={{ background: 'rgba(13,148,136,0.06)', borderColor: 'rgba(13,148,136,0.18)' }}>
          <div className="flex items-start gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-teal-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-teal-300">Grant Opportunity: Child Care Staffing</p>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
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
    <div style={{ background: 'var(--fin-page-bg)', minHeight: '100vh' }}>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b" style={{
        background: 'var(--fin-hero-bg)',
        borderColor: 'var(--fin-border)',
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
            <h1 className="text-[26px] font-bold text-white leading-tight">YMCA of Metropolitan Chicago</h1>
            <p className="text-slate-400 text-[13px] mt-0.5">
              Founded {YMCA_CORE.founded} · {YMCA_CORE.totalEmployees.toLocaleString()} employees · Chicago, IL · EIN {YMCA_CORE.ein}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold text-red-400 border border-red-400/20"
              style={{ background: 'rgba(239,68,68,0.08)' }}>FY2024 IRS 990 · ($24.1M) Deficit</span>
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-400 border border-sky-400/20"
              style={{ background: 'rgba(56,189,248,0.08)' }}>#9 &amp; #10 Human Services · Chicago</span>
          </div>
        </div>
      </div>

      {/* ── Sticky tab nav ───────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b" style={{
        background: 'var(--fin-nav-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--fin-border)',
      }}>
        <div className="px-8 max-w-7xl mx-auto flex items-center overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {ALL_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id as AnyTab)}
              className="flex items-center gap-2 px-4 py-3.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition-all"
              style={{
                color: tab === id ? 'var(--fin-tab-active)' : 'var(--fin-tab-inactive)',
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
          <p className="text-[11px] text-slate-700">
            Source: IRS Form 990 (FY2024) · Compensation990.com · EIN 36-2179782 · ymcachicago.org
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
