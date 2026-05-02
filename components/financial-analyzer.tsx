'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload, Loader2, Sparkles, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  FileSpreadsheet, ChevronDown, ChevronUp, CloudUpload,
  FileText, File, RefreshCw,
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
    total_revenue:      number;
    prior_year_revenue: number | null;
    revenue_categories: Array<{ name: string; amount: number; pct: number }>;
    total_expenses:     number;
    expense_categories: Array<{ name: string; amount: number; pct: number }>;
    net_income:         number;
    change_vs_prior_pct: number | null;
  };
  balance_sheet: {
    total_assets:             number;
    total_liabilities:        number;
    net_assets:               number;
    unrestricted_net_assets:  number | null;
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
  orgCode:            string;
  googleConnected:    boolean;
  microsoftConnected: boolean;
}

type Phase =
  | 'idle'
  | 'picking_google'
  | 'picking_microsoft'
  | 'uploading'
  | 'extracting'
  | 'analyzing'
  | 'done'
  | 'error';

function flagColor(s: 'critical' | 'warning' | 'info') {
  return s === 'critical'
    ? { bg: 'rgba(239,68,68,0.08)',  text: '#f87171', border: 'rgba(239,68,68,0.2)'  }
    : s === 'warning'
    ? { bg: 'rgba(251,191,36,0.08)', text: '#fbbf24', border: 'rgba(251,191,36,0.2)' }
    : { bg: 'rgba(56,189,248,0.08)', text: '#38bdf8', border: 'rgba(56,189,248,0.2)' };
}
function priorityColor(p: 'high' | 'medium' | 'low') {
  return p === 'high' ? '#f87171' : p === 'medium' ? '#fbbf24' : '#475569';
}

function GaugeArc({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  const r = 38, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-24 h-24">
      <svg viewBox="0 0 100 100" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none font-mono" style={{ color }}>{score}</span>
        <span className="text-[10px] text-slate-500 font-medium">/100</span>
      </div>
    </div>
  );
}

function FileIcon({ ext }: { ext: string }) {
  const isSheet = ['xlsx', 'xls', 'csv'].includes(ext);
  return isSheet
    ? <FileSpreadsheet className="w-5 h-5 text-green-400" />
    : ext === 'docx' ? <FileText className="w-5 h-5 text-blue-400" />
    : <File className="w-5 h-5 text-slate-400" />;
}

export function FinancialAnalyzer({
  orgCode,
  googleConnected,
  microsoftConnected,
}: FinancialAnalyzerProps) {
  const [phase,      setPhase]      = useState<Phase>('idle');
  const [status,     setStatus]     = useState('');
  const [analysis,   setAnalysis]   = useState<AnalysisResult | null>(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [showIncome, setShowIncome] = useState(true);
  const [dragging,   setDragging]   = useState(false);
  const [fileName,   setFileName]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runAnalysis = useCallback(async (content: string, name: string) => {
    setPhase('analyzing');
    setStatus(`Building financial model for "${name}" with Fundir AI…`);
    try {
      const res  = await fetch('/api/integrations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, fileName: name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis as AnalysisResult);
      setPhase('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('error');
    }
  }, []);

  // ── Direct file upload (no OAuth needed) ───────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setPhase('uploading');
    setStatus(`Uploading "${file.name}"…`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/integrations/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPhase('extracting');
      setStatus(`Extracted ${(data.chars / 1000).toFixed(0)}K characters — analyzing…`);
      await runAnalysis(data.content as string, data.name as string);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setPhase('error');
    }
  }, [runAnalysis]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Cloud storage file selected ────────────────────────────────────────────
  async function handleCloudFile(
    file: { id: string; name: string; mimeType?: string },
    provider: 'google' | 'microsoft',
  ) {
    setFileName(file.name);
    setPhase('extracting');
    setStatus(`Reading "${file.name}" from ${provider === 'google' ? 'Google Drive' : 'OneDrive'}…`);
    try {
      const extractRes = await fetch('/api/integrations/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, orgCode, fileId: file.id, mimeType: file.mimeType, fileName: file.name }),
      });
      const extractData = await extractRes.json();
      if (extractData.error) throw new Error(extractData.error);
      await runAnalysis(extractData.content as string, file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Extraction failed');
      setPhase('error');
    }
  }

  // ── File picker ───────────────────────────────────────────────────────────
  if (phase === 'picking_google' || phase === 'picking_microsoft') {
    const provider = phase === 'picking_google' ? 'google' : 'microsoft';
    return (
      <FilePicker
        provider={provider}
        orgCode={orgCode}
        onSelect={f => handleCloudFile(f, provider)}
        onClose={() => setPhase('idle')}
      />
    );
  }

  // ── Loading states ────────────────────────────────────────────────────────
  if (phase === 'uploading' || phase === 'extracting' || phase === 'analyzing') {
    const isAnalyzing = phase === 'analyzing';
    return (
      <div className="flex flex-col items-center gap-5 py-10">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: isAnalyzing ? 'rgba(99,102,241,0.15)' : 'rgba(13,148,136,0.15)' }}>
            {isAnalyzing
              ? <Sparkles className="w-6 h-6 text-indigo-400" />
              : <FileSpreadsheet className="w-6 h-6 text-teal-400" />}
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: isAnalyzing ? 'rgba(99,102,241,0.2)' : 'rgba(13,148,136,0.2)' }}>
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: isAnalyzing ? '#818cf8' : '#0d9488' }} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-slate-100">
            {phase === 'uploading' ? 'Uploading file…'
              : phase === 'extracting' ? 'Extracting financial data…'
              : 'Building financial model with AI…'}
          </p>
          <p className="text-[12px] text-slate-500 mt-1 max-w-xs">{status}</p>
          {isAnalyzing && (
            <div className="flex items-center justify-center gap-3 mt-3">
              {['Parsing figures', 'Calculating ratios', 'Building projections'].map((s, i) => (
                <span key={s} className="flex items-center gap-1 text-[10px] text-slate-600">
                  <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        {fileName && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] text-slate-400"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
            <FileIcon ext={fileName.split('.').pop()?.toLowerCase() ?? ''} />
            {fileName}
          </div>
        )}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-slate-100">Analysis failed</p>
          <p className="text-[12px] text-slate-500 mt-1 max-w-sm">{errorMsg}</p>
        </div>
        <button onClick={() => { setPhase('idle'); setErrorMsg(''); }}
          className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold text-slate-300 border border-white/10 hover:border-white/20 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (phase === 'done' && analysis) {
    const a = analysis;
    const netPos = a.income_statement.net_income >= 0;
    const yr = a.fiscal_year ? `FY${a.fiscal_year}` : 'Fiscal Year';

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-teal-500 uppercase tracking-widest mb-0.5">Fundir AI · Financial Model</p>
            <h3 className="text-[18px] font-bold text-slate-100">{a.org_name ?? a.file_name}</h3>
            <p className="text-[11px] text-slate-500">
              {yr} · {a.data_quality === 'complete' ? '● Complete data' : a.data_quality === 'partial' ? '◐ Partial data' : '○ Minimal data'}
            </p>
          </div>
          <button onClick={() => { setAnalysis(null); setPhase('idle'); setFileName(''); }}
            className="text-[11px] text-slate-600 hover:text-teal-400 transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> New import
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 rounded-[10px] text-[12px] text-slate-400 leading-relaxed border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
          {a.summary}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Revenue', value: formatCurrency(a.income_statement.total_revenue), icon: DollarSign, color: '#0d9488' },
            { label: 'Net Income',    value: formatCurrency(a.income_statement.net_income),    icon: netPos ? TrendingUp : TrendingDown, color: netPos ? '#22c55e' : '#f87171' },
            { label: 'Net Assets',    value: formatCurrency(a.balance_sheet.net_assets),       icon: BarChart3, color: '#818cf8' },
            { label: 'Months Reserves', value: a.liquidity.months_of_reserves != null ? `${a.liquidity.months_of_reserves.toFixed(1)} mo` : '—', icon: CheckCircle, color: (a.liquidity.months_of_reserves ?? 0) >= 3 ? '#22c55e' : '#f59e0b' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="p-4 rounded-[10px] border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <p className="text-[18px] font-bold font-mono leading-none" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Grant Readiness */}
        <div className="rounded-[10px] border p-5 flex items-start gap-5"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <GaugeArc score={a.grant_readiness.score} />
          <div className="flex-1">
            <p className="text-[12px] font-bold text-slate-200 mb-2.5">Grant Readiness Score</p>
            <div className="space-y-1.5">
              {a.grant_readiness.flags.slice(0, 4).map((flag, i) => {
                const c = flagColor(flag.severity);
                return (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-[6px] border"
                    style={{ background: c.bg, borderColor: c.border }}>
                    <span className="text-[10px] font-bold leading-4 flex-shrink-0" style={{ color: c.text }}>{flag.label}</span>
                    <span className="text-[10px] text-slate-500 leading-snug">{flag.detail}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Income Statement */}
        <div className="rounded-[10px] border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <button onClick={() => setShowIncome(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 border-b hover:bg-white/[0.02] transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-[13px] font-bold text-slate-200">Statement of Activities</span>
            {showIncome ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          {showIncome && (
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Revenue</p>
                <div className="space-y-1.5">
                  {a.income_statement.revenue_categories.map((cat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12px] text-slate-400">{cat.name}</span>
                          <span className="text-[12px] font-semibold font-mono text-slate-200">{formatCurrency(cat.amount)}</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(cat.pct, 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-600 w-7 text-right">{cat.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span className="text-[13px] font-bold text-slate-200">Total Revenue</span>
                    <span className="text-[13px] font-bold font-mono text-teal-400">{formatCurrency(a.income_statement.total_revenue)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-[8px] border"
                style={{ background: netPos ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderColor: netPos ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }}>
                <span className="text-[13px] font-bold" style={{ color: netPos ? '#22c55e' : '#f87171' }}>
                  {netPos ? 'Net Surplus' : 'Net Deficit'}
                </span>
                <span className="text-[15px] font-bold font-mono" style={{ color: netPos ? '#22c55e' : '#f87171' }}>
                  {netPos ? '+' : ''}{formatCurrency(a.income_statement.net_income)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Projections */}
        <div className="rounded-[10px] border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="px-5 py-3.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-[13px] font-bold text-slate-200">3-Year Revenue Projections</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{a.projections.assumptions}</p>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            {([
              { key: 'conservative', label: 'Conservative', color: '#64748b' },
              { key: 'moderate',     label: 'Moderate',     color: '#0d9488' },
              { key: 'optimistic',   label: 'Optimistic',   color: '#22c55e' },
            ] as const).map(({ key, label, color }) => {
              const proj = a.projections[key];
              return (
                <div key={key} className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
                  <p className="text-[10px] text-slate-600 mb-2">+{proj.growth_rate_pct.toFixed(1)}%/yr</p>
                  {(['year1', 'year2', 'year3'] as const).map((y, i) => (
                    <div key={y} className="mb-1.5">
                      <p className="text-[9px] text-slate-600">Year {i + 1}</p>
                      <p className="text-[13px] font-bold font-mono" style={{ color }}>{formatCurrency(proj[y])}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommendations */}
        {a.recommendations.length > 0 && (
          <div className="rounded-[10px] border overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="px-5 py-3.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[13px] font-bold text-slate-200">Recommendations</p>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {a.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: priorityColor(rec.priority) }} />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {rec.priority} · {rec.category}
                    </p>
                    <p className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">{rec.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Idle: Upload zone (primary) + cloud storage (optional) ────────────────
  const anyConnected = googleConnected || microsoftConnected;
  const ACCEPT = '.xlsx,.xls,.csv,.docx,.txt';

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {/* ── Primary: drag-and-drop upload ── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative flex flex-col items-center justify-center gap-4 py-10 px-6 rounded-xl border-2 border-dashed cursor-pointer transition-all"
        style={{
          borderColor: dragging ? '#0d9488' : 'rgba(255,255,255,0.12)',
          background: dragging ? 'rgba(13,148,136,0.06)' : 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
          style={{ background: dragging ? 'rgba(13,148,136,0.2)' : 'rgba(255,255,255,0.05)' }}>
          <CloudUpload className="w-7 h-7 transition-colors" style={{ color: dragging ? '#0d9488' : '#475569' }} />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-bold text-slate-200">
            {dragging ? 'Drop to analyze' : 'Drop your financial file here'}
          </p>
          <p className="text-[12px] text-slate-500 mt-1">
            or <span className="text-teal-400 font-semibold">click to browse</span> your computer
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {['Excel .xlsx', 'CSV .csv', 'Word .docx', 'Text .txt'].map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-mono text-slate-500 border"
              style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              {t}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-slate-700 text-center max-w-xs">
          Fundir AI extracts all financial figures and builds a complete model with income statement, balance sheet, and 3-year projections — in under 60 seconds.
        </p>
      </div>

      {/* ── Optional: cloud storage ── */}
      {anyConnected && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-widest">or import from cloud</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="flex gap-3">
            {googleConnected && (
              <button onClick={() => setPhase('picking_google')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] border text-[12px] font-semibold text-slate-300 hover:border-blue-400/30 hover:text-white transition-all"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google Drive
              </button>
            )}
            {microsoftConnected && (
              <button onClick={() => setPhase('picking_microsoft')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] border text-[12px] font-semibold text-slate-300 hover:border-sky-400/30 hover:text-white transition-all"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
                  <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
                  <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
                  <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                </svg>
                OneDrive
              </button>
            )}
          </div>
        </div>
      )}

      {!anyConnected && (
        <p className="text-center text-[11px] text-slate-700">
          Connect Google Drive or Microsoft 365 above to also import directly from cloud storage.
        </p>
      )}
    </div>
  );
}
