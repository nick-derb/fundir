'use client';

import { useState } from 'react';
import {
  Upload, Loader2, Sparkles, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  FileSpreadsheet, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { FilePicker } from '@/components/file-picker';
import { formatCurrency } from '@/lib/utils';

interface AnalysisResult {
  org_name:       string | null;
  fiscal_year:    number | null;
  file_name:      string;
  data_quality:   'complete' | 'partial' | 'minimal';
  summary:        string;
  income_statement: {
    total_revenue:    number;
    prior_year_revenue: number | null;
    revenue_categories: Array<{ name: string; amount: number; pct: number }>;
    total_expenses:   number;
    expense_categories: Array<{ name: string; amount: number; pct: number }>;
    net_income:       number;
    change_vs_prior_pct: number | null;
  };
  balance_sheet: {
    total_assets:    number;
    total_liabilities: number;
    net_assets:      number;
    unrestricted_net_assets: number | null;
  };
  liquidity: {
    cash_and_equivalents: number | null;
    months_of_reserves:   number | null;
    current_ratio:        number | null;
    line_of_credit_used:  number | null;
  };
  key_ratios: {
    govt_dependency_pct:     number | null;
    program_expense_ratio:   number | null;
    admin_ratio:             number | null;
    revenue_growth_rate_pct: number | null;
  };
  grant_readiness: {
    score: number;
    flags: Array<{ severity: 'critical' | 'warning' | 'info'; label: string; detail: string }>;
  };
  projections: {
    base_value:   number;
    assumptions:  string;
    conservative: { year1: number; year2: number; year3: number; growth_rate_pct: number };
    moderate:     { year1: number; year2: number; year3: number; growth_rate_pct: number };
    optimistic:   { year1: number; year2: number; year3: number; growth_rate_pct: number };
  };
  recommendations: Array<{ priority: 'high' | 'medium' | 'low'; category: string; text: string }>;
}

interface FinancialAnalyzerProps {
  orgCode: string;
  googleConnected:    boolean;
  microsoftConnected: boolean;
}

type Phase =
  | 'idle'
  | 'picking_google'
  | 'picking_microsoft'
  | 'extracting'
  | 'analyzing'
  | 'done'
  | 'error';

function flagColor(severity: 'critical' | 'warning' | 'info') {
  return severity === 'critical'
    ? { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
    : severity === 'warning'
    ? { bg: '#fffbeb', text: '#d97706', border: '#fde68a' }
    : { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
}

function priorityDot(priority: 'high' | 'medium' | 'low') {
  return priority === 'high'
    ? '#dc2626'
    : priority === 'medium'
    ? '#d97706'
    : '#94a3b8';
}

function GaugeArc({ score }: { score: number }) {
  const color =
    score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const r = 40, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-24 h-24">
      <svg viewBox="0 0 100 100" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] text-[#64748b] font-medium">/100</span>
      </div>
    </div>
  );
}

export function FinancialAnalyzer({
  orgCode,
  googleConnected,
  microsoftConnected,
}: FinancialAnalyzerProps) {
  const [phase,     setPhase]     = useState<Phase>('idle');
  const [status,    setStatus]    = useState('');
  const [analysis,  setAnalysis]  = useState<AnalysisResult | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [showIncome, setShowIncome] = useState(true);

  async function handleFileSelected(
    file: { id: string; name: string; mimeType?: string },
    provider: 'google' | 'microsoft',
  ) {
    setPhase('extracting');
    setStatus(`Reading "${file.name}"…`);

    try {
      const extractRes = await fetch('/api/integrations/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          orgCode,
          fileId: file.id,
          mimeType: file.mimeType,
          fileName: file.name,
        }),
      });

      const extractData = await extractRes.json();
      if (extractData.error) throw new Error(extractData.error);

      setPhase('analyzing');
      setStatus(`Analyzing "${file.name}" with Fundir AI…`);

      const analyzeRes = await fetch('/api/integrations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content:  extractData.content,
          fileName: file.name,
        }),
      });

      const analyzeData = await analyzeRes.json();
      if (analyzeData.error) throw new Error(analyzeData.error);

      setAnalysis(analyzeData.analysis as AnalysisResult);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('error');
    }
  }

  const anyConnected = googleConnected || microsoftConnected;

  // ── Idle state ──────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div>
        {!anyConnected ? (
          <div className="flex items-start gap-3 p-4 rounded-[10px] bg-[#fffbeb] border border-[#fde68a]">
            <AlertTriangle className="w-4 h-4 text-[#d97706] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-[#92400e]">No cloud storage connected</p>
              <p className="text-[12px] text-[#78350f] mt-0.5">
                Connect Google Workspace or Microsoft 365 above to import financial documents.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(8,145,178,0.08))' }}>
              <Upload className="w-6 h-6 text-[#0d9488]" />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold text-[#0f172a]">Import Financial Document</p>
              <p className="text-[13px] text-[#64748b] mt-1 max-w-sm">
                Select a spreadsheet or document from your connected cloud storage.
                Fundir AI will extract all financial data and build a complete model.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {googleConnected && (
                <button
                  onClick={() => setPhase('picking_google')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[13px] font-semibold border border-[#e2e8f0] hover:border-[#0d9488] hover:bg-[#f0fdfa] transition-all text-[#0f172a]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  From Google Drive
                </button>
              )}
              {microsoftConnected && (
                <button
                  onClick={() => setPhase('picking_microsoft')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[13px] font-semibold border border-[#e2e8f0] hover:border-[#0078D4] hover:bg-[#eff6ff] transition-all text-[#0f172a]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
                    <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
                    <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
                    <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                  </svg>
                  From OneDrive
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#94a3b8]">
              Supports: Google Sheets, Google Docs, Excel (.xlsx), Word (.docx), CSV
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── File picker ─────────────────────────────────────────────────────────────
  if (phase === 'picking_google' || phase === 'picking_microsoft') {
    const provider = phase === 'picking_google' ? 'google' : 'microsoft';
    return (
      <div className="py-4 text-center text-[13px] text-[#64748b]">
        <p>File picker opened…</p>
        <FilePicker
          provider={provider}
          orgCode={orgCode}
          onSelect={f => handleFileSelected(f, provider)}
          onClose={() => setPhase('idle')}
        />
      </div>
    );
  }

  // ── Loading states ───────────────────────────────────────────────────────────
  if (phase === 'extracting' || phase === 'analyzing') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(8,145,178,0.1))' }}>
            {phase === 'extracting'
              ? <FileSpreadsheet className="w-5 h-5 text-[#0d9488]" />
              : <Sparkles className="w-5 h-5 text-[#6366f1]" />
            }
          </div>
          <Loader2 className="absolute -bottom-1 -right-1 w-4 h-4 animate-spin text-[#0d9488]" />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-[#0f172a]">
            {phase === 'extracting' ? 'Reading document…' : 'Building financial model…'}
          </p>
          <p className="text-[12px] text-[#64748b] mt-1">{status}</p>
          {phase === 'analyzing' && (
            <p className="text-[11px] text-[#94a3b8] mt-2">
              Extracting figures · Calculating ratios · Building 3-year projections
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertTriangle className="w-8 h-8 text-red-500" />
        <p className="text-[13px] font-bold text-[#0f172a]">Analysis failed</p>
        <p className="text-[12px] text-[#64748b] text-center max-w-sm">{errorMsg}</p>
        <button
          onClick={() => setPhase('idle')}
          className="mt-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white"
          style={{ background: '#0f172a' }}
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────────
  if (!analysis) return null;
  const a = analysis;
  const netPositive = a.income_statement.net_income >= 0;
  const yr = a.fiscal_year ? `FY${a.fiscal_year}` : 'Fiscal Year';

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold text-[#0d9488] uppercase tracking-widest mb-0.5">
            Fundir AI Financial Model
          </p>
          <h3 className="text-[18px] font-bold text-[#0f172a]">
            {a.org_name ?? a.file_name}
          </h3>
          <p className="text-[12px] text-[#64748b]">
            {yr} · {a.data_quality === 'complete' ? 'Complete data' : a.data_quality === 'partial' ? 'Partial data' : 'Minimal data detected'}
          </p>
        </div>
        <button
          onClick={() => { setAnalysis(null); setPhase('idle'); }}
          className="text-[11px] text-[#94a3b8] hover:text-[#0d9488] transition-colors"
        >
          New import
        </button>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0]">
        <p className="text-[13px] text-[#475569] leading-relaxed">{a.summary}</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Revenue',
            value: formatCurrency(a.income_statement.total_revenue),
            icon: DollarSign,
            color: '#0d9488',
          },
          {
            label: 'Net Income',
            value: formatCurrency(a.income_statement.net_income),
            icon: netPositive ? TrendingUp : TrendingDown,
            color: netPositive ? '#16a34a' : '#dc2626',
          },
          {
            label: 'Net Assets',
            value: formatCurrency(a.balance_sheet.net_assets),
            icon: BarChart3,
            color: '#6366f1',
          },
          {
            label: 'Months Reserves',
            value: a.liquidity.months_of_reserves != null
              ? `${a.liquidity.months_of_reserves.toFixed(1)} mo`
              : '—',
            icon: CheckCircle,
            color: (a.liquidity.months_of_reserves ?? 0) >= 3 ? '#16a34a' : '#d97706',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 bg-white rounded-[10px] border border-[#e2e8f0]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <p className="text-[18px] font-bold font-mono leading-none" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Grant Readiness */}
      <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-5">
        <div className="flex items-start gap-5">
          <GaugeArc score={a.grant_readiness.score} />
          <div className="flex-1">
            <p className="text-[12px] font-bold text-[#0f172a] mb-2">Grant Readiness Score</p>
            <div className="space-y-1.5">
              {a.grant_readiness.flags.slice(0, 4).map((flag, i) => {
                const c = flagColor(flag.severity);
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 rounded-[6px] border"
                    style={{ background: c.bg, borderColor: c.border }}
                  >
                    <span className="text-[10px] font-bold leading-4" style={{ color: c.text }}>
                      {flag.label}
                    </span>
                    <span className="text-[10px] text-[#64748b] leading-snug flex-1">
                      {flag.detail}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Income Statement */}
      <div className="bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
        <button
          onClick={() => setShowIncome(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-[#f8fafc] border-b border-[#e2e8f0] hover:bg-[#f1f5f9] transition-colors"
        >
          <span className="text-[13px] font-bold text-[#0f172a]">Statement of Activities</span>
          {showIncome
            ? <ChevronUp className="w-4 h-4 text-[#64748b]" />
            : <ChevronDown className="w-4 h-4 text-[#64748b]" />}
        </button>
        {showIncome && (
          <div className="p-5 space-y-4">
            {/* Revenue */}
            <div>
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Revenue</p>
              <div className="space-y-1.5">
                {a.income_statement.revenue_categories.map((cat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] text-[#475569]">{cat.name}</span>
                        <span className="text-[12px] font-semibold font-mono text-[#0f172a]">
                          {formatCurrency(cat.amount)}
                        </span>
                      </div>
                      <div className="h-1 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0d9488]"
                          style={{ width: `${Math.min(cat.pct, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-[#94a3b8] w-8 text-right">{cat.pct.toFixed(0)}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-[#f1f5f9]">
                  <span className="text-[13px] font-bold text-[#0f172a]">Total Revenue</span>
                  <span className="text-[13px] font-bold font-mono text-[#0d9488]">
                    {formatCurrency(a.income_statement.total_revenue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Net */}
            <div className={`flex items-center justify-between p-3 rounded-[8px] ${
              netPositive ? 'bg-[#f0fdf4]' : 'bg-[#fef2f2]'
            }`}>
              <span className="text-[13px] font-bold" style={{ color: netPositive ? '#16a34a' : '#dc2626' }}>
                {netPositive ? 'Net Surplus' : 'Net Deficit'}
              </span>
              <span className="text-[15px] font-bold font-mono" style={{ color: netPositive ? '#16a34a' : '#dc2626' }}>
                {netPositive ? '+' : ''}{formatCurrency(a.income_statement.net_income)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3-Year Projections */}
      <div className="bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
        <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <p className="text-[13px] font-bold text-[#0f172a]">3-Year Revenue Projections</p>
          <p className="text-[11px] text-[#64748b] mt-0.5">{a.projections.assumptions}</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                { key: 'conservative', label: 'Conservative', color: '#64748b' },
                { key: 'moderate',     label: 'Moderate',     color: '#0d9488' },
                { key: 'optimistic',   label: 'Optimistic',   color: '#16a34a' },
              ] as const
            ).map(({ key, label, color }) => {
              const proj = a.projections[key];
              return (
                <div key={key} className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color }}>
                    {label}
                  </p>
                  <p className="text-[10px] text-[#94a3b8] mb-0.5">+{proj.growth_rate_pct.toFixed(1)}%/yr</p>
                  {(['year1', 'year2', 'year3'] as const).map((yr, i) => (
                    <div key={yr} className="mb-1.5">
                      <p className="text-[10px] text-[#94a3b8]">Year {i + 1}</p>
                      <p className="text-[13px] font-bold font-mono" style={{ color }}>
                        {formatCurrency(proj[yr])}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {a.recommendations.length > 0 && (
        <div className="bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
            <p className="text-[13px] font-bold text-[#0f172a]">Recommendations</p>
          </div>
          <div className="divide-y divide-[#f8fafc]">
            {a.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                  style={{ background: priorityDot(rec.priority) }}
                />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] mr-2">
                    {rec.priority} · {rec.category}
                  </span>
                  <p className="text-[13px] text-[#475569] mt-0.5">{rec.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
