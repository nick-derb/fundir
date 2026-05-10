'use client';

import { useState, useEffect } from 'react';
import { FinancialAnalyzer } from './financial-analyzer';
import { IntegrationConnector } from './integration-connector';
import {
  BarChart3, Brain, CheckCircle, ChevronDown, FileText, Loader2,
  Lightbulb, BookOpen, Library, Wand2, ArrowRight, AlertTriangle,
} from 'lucide-react';

// ── Shared helpers (exported so CYC shell can import them) ────────────────────
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
      {children}
    </div>
  );
}

export function CardHeader({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="px-4 py-3 border-b flex items-center justify-between"
      style={{ borderColor: 'rgba(255,255,255,0.06)', background: accent ?? 'rgba(255,255,255,0.02)' }}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-bold text-slate-100">{title}</h2>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── TAB: AI Analyzer ──────────────────────────────────────────────────────────
export function AITab({ orgCode, orgId, orgName, googleConnected, microsoftConnected }: {
  orgCode: string; orgId?: string; orgName?: string;
  googleConnected: boolean; microsoftConnected: boolean;
}) {
  const anyConnected = googleConnected || microsoftConnected;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-3"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="w-7 h-7 rounded-[6px] flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.15)' }}>
            <Brain className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-slate-100">AI Document Analyzer</h2>
            <p className="text-[11px] text-slate-500">
              Upload any organizational document — financials, strategic plans, grant applications — and get AI-driven intelligence in under 60 seconds
            </p>
          </div>
          {anyConnected && (
            <span className="ml-auto text-[11px] font-bold text-green-400 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-400/20 flex-shrink-0"
              style={{ background: 'rgba(34,197,94,0.08)' }}>
              <CheckCircle className="w-3 h-3" /> Storage connected
            </span>
          )}
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-5">
            {['Connect cloud storage', 'Select document type', 'AI analyzes & saves'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${(i === 0 && anyConnected) ? 'bg-green-500 text-white' : i === 0 ? 'bg-teal-500 text-white' : ''}`}
                  style={i > 0 ? { background: 'rgba(255,255,255,0.08)', color: '#64748b' } : {}}>
                  {i === 0 && anyConnected ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-[12px] whitespace-nowrap ${i === 0 ? 'text-slate-300' : 'text-slate-600'}`}>{step}</span>
                {i < 2 && <div className="w-6 h-px mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />}
              </div>
            ))}
          </div>
        </div>
        <div className="mx-5 mb-5 rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cloud Storage — Step 1</p>
          </div>
          <IntegrationConnector
            orgCode={orgCode}
            returnPath="/financials"
            status={{
              google:    { connected: googleConnected },
              microsoft: { connected: microsoftConnected },
            }}
          />
        </div>
        <div className="px-5 pb-5">
          <FinancialAnalyzer
            orgCode={orgCode}
            orgId={orgId}
            orgName={orgName}
            googleConnected={googleConnected}
            microsoftConnected={microsoftConnected}
          />
        </div>
      </Card>
    </div>
  );
}

// ── TAB: Document Library ─────────────────────────────────────────────────────
interface PastDoc {
  id: string; file_name: string; provider: string;
  doc_type: string; summary: string; analyzed_at: string;
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export const DOC_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  financial:         { bg: 'rgba(13,148,136,0.15)',  text: '#2dd4bf', label: 'Financial'      },
  strategic_plan:    { bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', label: 'Strategic Plan' },
  grant_application: { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa', label: 'Grant App'      },
  program_report:    { bg: 'rgba(34,197,94,0.15)',   text: '#4ade80', label: 'Program Report' },
  board_minutes:     { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24', label: 'Board Minutes'  },
  general:           { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8', label: 'General'        },
};

function AnalysisExpandView({ analysis }: { analysis: Record<string, unknown> }) {
  const docType = analysis.doc_type as string;
  const summary = analysis.summary as string ?? '';

  if (docType === 'financial') {
    const inc = (analysis.income_statement as Record<string, unknown>) ?? {};
    const bal = (analysis.balance_sheet as Record<string, unknown>) ?? {};
    const gr  = (analysis.grant_readiness as Record<string, unknown>) ?? {};
    const liq = (analysis.liquidity as Record<string, unknown>) ?? {};
    const rev  = (inc.total_revenue as number) ?? 0;
    const net  = (inc.net_income as number) ?? 0;
    const assets = (bal.net_assets as number) ?? 0;
    const score  = (gr.score as number) ?? 0;
    const months = liq.months_of_reserves as number | null;
    return (
      <div className="space-y-3">
        <p className="text-[12px] text-slate-400 leading-relaxed">{summary}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Total Revenue',   value: rev >= 1_000_000 ? `$${(rev/1_000_000).toFixed(2)}M` : `$${(rev/1000).toFixed(0)}K`,       color: '#0d9488' },
            { label: 'Net Income',      value: `${net >= 0 ? '+' : ''}$${Math.abs(net/1000).toFixed(0)}K`,  color: net >= 0 ? '#22c55e' : '#f87171' },
            { label: 'Net Assets',      value: assets >= 1_000_000 ? `$${(assets/1_000_000).toFixed(2)}M` : `$${(assets/1000).toFixed(0)}K`, color: '#818cf8' },
            { label: 'Grant Readiness', value: `${score}/100`,                                                color: score >= 70 ? '#22c55e' : '#f59e0b' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 rounded-[8px] border"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-[15px] font-bold font-mono" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
        {months != null && (
          <p className="text-[11px] text-slate-600">{months} months of cash reserves</p>
        )}
      </div>
    );
  }

  const sections = (analysis.sections as Array<{ title: string; items: Array<{ label: string; value: string }> }>) ?? [];
  const grantAlignment = (analysis.grant_alignment as Array<{ area: string; potential: string }>) ?? [];
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-slate-400 leading-relaxed">{summary}</p>
      {sections.slice(0, 2).map((s, i) => (
        <div key={i}>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">{s.title}</p>
          <div className="space-y-1">
            {s.items.slice(0, 3).map((item, j) => (
              <div key={j} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0 bg-teal-500" />
                <p className="text-[11px] text-slate-400">
                  <strong className="text-slate-300">{item.label}:</strong> {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {grantAlignment.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Grant Alignment</p>
          {grantAlignment.slice(0, 2).map((g, i) => {
            const c = g.potential === 'high' ? { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' } : { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' };
            return (
              <div key={i} className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.text }}>
                  {g.potential?.toUpperCase()}
                </span>
                <p className="text-[11px] text-slate-400 font-semibold">{g.area}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DocumentLibraryTab({
  orgCode, orgId, orgName, googleConnected, microsoftConnected, onSwitchToAnalyzer,
}: {
  orgCode: string; orgId?: string; orgName?: string;
  googleConnected: boolean; microsoftConnected: boolean;
  onSwitchToAnalyzer: () => void;
}) {
  const [docs,     setDocs]     = useState<PastDoc[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullAna,  setFullAna]  = useState<Record<string, unknown> | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    fetch(`/api/integrations/analyses?orgCode=${encodeURIComponent(orgCode)}`)
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setDocs(d as PastDoc[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgCode]);

  async function handleExpand(id: string) {
    if (expanded === id) { setExpanded(null); setFullAna(null); return; }
    setExpanded(id); setFullAna(null); setFetching(true);
    try {
      const res  = await fetch(`/api/integrations/analyses?orgCode=${encodeURIComponent(orgCode)}&id=${id}`);
      const data = await res.json() as { analysis?: Record<string, unknown> };
      setFullAna(data?.analysis ?? null);
    } finally { setFetching(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-slate-100">Document Library</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            AI-analyzed documents for {orgName ?? orgCode} — click any row to expand
          </p>
        </div>
        <button onClick={onSwitchToAnalyzer}
          className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-bold text-white"
          style={{ background: '#0d9488' }}>
          <BookOpen className="w-3.5 h-3.5" /> Analyze New Doc
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Library className="w-7 h-7 text-slate-600" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-slate-400">No documents analyzed yet</p>
            <p className="text-[12px] text-slate-600 mt-1 max-w-xs">
              Upload your financial statements, strategic plans, or any organizational document to build your intelligence library.
            </p>
          </div>
          <button onClick={onSwitchToAnalyzer}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[12px] font-bold text-white"
            style={{ background: '#0d9488' }}>
            <BookOpen className="w-3.5 h-3.5" /> Analyze Your First Document
          </button>
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className="space-y-2">
          {docs.map(doc => {
            const badge  = DOC_BADGE[doc.doc_type] ?? DOC_BADGE.general;
            const isOpen = expanded === doc.id;
            return (
              <div key={doc.id} className="rounded-[10px] border overflow-hidden transition-all"
                style={{ borderColor: isOpen ? 'rgba(13,148,136,0.3)' : 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <button onClick={() => handleExpand(doc.id)}
                  className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="w-8 h-8 rounded-[6px] flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: badge.bg }}>
                    <FileText className="w-4 h-4" style={{ color: badge.text }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-slate-200 truncate">{doc.file_name}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
                      {doc.provider !== 'upload' && (
                        <span className="text-[9px] text-slate-600 flex-shrink-0">
                          {doc.provider === 'google' ? 'Google Drive' : 'OneDrive'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{doc.summary}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-slate-600">{timeAgo(doc.analyzed_at)}</span>
                    <ChevronDown className="w-4 h-4 text-slate-600 transition-transform"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {fetching ? (
                      <div className="flex items-center gap-2 py-4 text-slate-600 text-[12px]">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading full analysis…
                      </div>
                    ) : fullAna ? (
                      <div className="pt-4"><AnalysisExpandView analysis={fullAna} /></div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TAB: Strategy Brief ────────────────────────────────────────────────────────
interface StrategyBrief {
  org_name:                string;
  analysis_count:          number;
  generated_at:            string;
  executive_summary:       string;
  organizational_strengths: string[];
  critical_gaps:           Array<{ gap: string; impact: string; urgency: 'high' | 'medium' | 'low' }>;
  funding_strategy:        string;
  top_funding_priorities:  Array<{ rank: number; focus_area: string; rationale: string; target_amount: string | null; timeline: string; readiness: 'high' | 'medium' | 'low' }>;
  grant_opportunities:     Array<{ type: string; focus_area: string; rationale: string; estimated_range: string | null; readiness: 'high' | 'medium' | 'low' }>;
  revenue_diversification: string;
  risk_mitigation:         string[];
  quarterly_action_plan:   Array<{ quarter: string; actions: string[] }>;
}

function readinessBadge(r: 'high' | 'medium' | 'low') {
  return r === 'high' ? '#22c55e' : r === 'medium' ? '#f59e0b' : '#ef4444';
}
function urgencyBadge(u: 'high' | 'medium' | 'low') {
  return u === 'high' ? '#f87171' : u === 'medium' ? '#fbbf24' : '#64748b';
}

export function StrategyBriefTab({ orgCode, orgName }: { orgCode: string; orgName?: string }) {
  const [brief,   setBrief]   = useState<StrategyBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function generate() {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/integrations/strategy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgCode, orgName }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error as string);
      setBrief(data.brief as StrategyBrief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate strategy brief');
    } finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-5 py-16">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Wand2 className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.2)' }}>
            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-slate-100">Synthesizing strategy brief…</p>
          <p className="text-[12px] text-slate-500 mt-1">Analyzing your documents and building your funding roadmap</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            {['Reading documents', 'Identifying patterns', 'Building strategy'].map((s, i) => (
              <span key={s} className="flex items-center gap-1 text-[10px] text-slate-600">
                <span className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }} />
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.12)' }}>
          <Wand2 className="w-8 h-8 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-[17px] font-bold text-slate-100">AI Strategy Brief</h2>
          <p className="text-[12px] text-slate-500 mt-2 max-w-md">
            Synthesizes all your uploaded documents into a comprehensive funding strategy — priorities, grant opportunities, and a quarterly action plan tailored to your organization.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-[8px] border max-w-md"
            style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}
        <button onClick={generate}
          className="flex items-center gap-2 px-6 py-3 rounded-[10px] text-[13px] font-bold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          <Wand2 className="w-4 h-4" /> Generate Strategy Brief
        </button>
        <p className="text-[11px] text-slate-700">Analyzes all documents in your library · ~30 seconds</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-0.5">AI · Strategy Brief</p>
          <h2 className="text-[20px] font-bold text-slate-100">{brief.org_name} Funding Strategy</h2>
          <p className="text-[11px] text-slate-500">
            Synthesized from {brief.analysis_count} document{brief.analysis_count !== 1 ? 's' : ''} · {new Date(brief.generated_at).toLocaleDateString()}
          </p>
        </div>
        <button onClick={() => setBrief(null)}
          className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-indigo-400 transition-colors">
          <Wand2 className="w-3 h-3" /> Regenerate
        </button>
      </div>

      <div className="p-5 rounded-xl border"
        style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)' }}>
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Executive Summary</p>
        <p className="text-[13px] text-slate-300 leading-relaxed">{brief.executive_summary}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-[11px] font-bold text-green-400 uppercase tracking-widest mb-3">Organizational Strengths</p>
          <div className="space-y-2">
            {brief.organizational_strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-slate-400">{s}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-bold text-red-400 uppercase tracking-widest mb-3">Critical Gaps</p>
          <div className="space-y-2.5">
            {brief.critical_gaps.map((g, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                  style={{ background: `${urgencyBadge(g.urgency)}22`, color: urgencyBadge(g.urgency) }}>
                  {g.urgency.toUpperCase()}
                </span>
                <div>
                  <p className="text-[12px] text-slate-300 font-semibold">{g.gap}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{g.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-indigo-400" />
          <p className="text-[13px] font-bold text-slate-100">Funding Strategy</p>
        </div>
        <p className="text-[12px] text-slate-400 leading-relaxed whitespace-pre-line">{brief.funding_strategy}</p>
      </Card>

      <div>
        <SectionTitle title="Top Funding Priorities" sub="Ranked by strategic impact and organizational readiness" />
        <div className="space-y-3">
          {brief.top_funding_priorities.map(p => (
            <Card key={p.rank} className="p-4">
              <div className="flex items-start gap-4">
                <span className="text-[20px] font-bold text-slate-600 w-6 flex-shrink-0">#{p.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-bold text-slate-100">{p.focus_area}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${readinessBadge(p.readiness)}22`, color: readinessBadge(p.readiness) }}>
                      {p.readiness.toUpperCase()} READINESS
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-400 mb-2">{p.rationale}</p>
                  <div className="flex items-center gap-4 text-[11px] text-slate-600">
                    {p.target_amount && <span>Target: <strong className="text-slate-300">{p.target_amount}</strong></span>}
                    <span>Timeline: <strong className="text-slate-300">{p.timeline}</strong></span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Grant Opportunities" sub="Funding sources aligned with your programs and financial profile" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {brief.grant_opportunities.map((g, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[13px] font-bold text-slate-100">{g.focus_area}</p>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{g.type}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `${readinessBadge(g.readiness)}22`, color: readinessBadge(g.readiness) }}>
                  {g.readiness.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-2">{g.rationale}</p>
              {g.estimated_range && <p className="text-[11px] font-bold text-teal-400">{g.estimated_range}</p>}
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Quarterly Action Plan" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {brief.quarterly_action_plan.map(q => (
            <Card key={q.quarter} className="p-4">
              <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-3">{q.quarter}</p>
              <div className="space-y-2">
                {q.actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-snug">{action}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <p className="text-[11px] font-bold text-teal-400 uppercase tracking-widest mb-2">Revenue Diversification</p>
        <p className="text-[12px] text-slate-400 leading-relaxed">{brief.revenue_diversification}</p>
      </Card>

      {brief.risk_mitigation.length > 0 && (
        <Card className="p-5">
          <p className="text-[11px] font-bold text-amber-400 uppercase tracking-widest mb-3">Risk Mitigation</p>
          <div className="space-y-2">
            {brief.risk_mitigation.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-slate-400">{r}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab definitions (exported for CYC shell) ──────────────────────────────────
export const COMMON_TABS = [
  { id: 'ai',       label: 'AI Analyzer',    icon: Brain   },
  { id: 'docs',     label: 'Documents',      icon: Library },
  { id: 'strategy', label: 'Strategy Brief', icon: Wand2   },
] as const;

export type CommonTab = typeof COMMON_TABS[number]['id'];

// ── Generic Financials Shell — non-CYC orgs only ──────────────────────────────
export function FinancialsShell({
  orgCode, orgId, orgName,
  googleConnected, microsoftConnected,
}: {
  orgCode:            string;
  orgId?:             string;
  orgName?:           string;
  googleConnected:    boolean;
  microsoftConnected: boolean;
}) {
  const [tab, setTab] = useState<CommonTab>('ai');

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
        <div className="relative px-8 py-7 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-teal-500" />
            <span className="text-[10px] font-bold text-teal-500 uppercase tracking-widest">Org Intelligence · Financials</span>
          </div>
          <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--fin-heading)' }}>{orgName ?? 'My Organization'}</h1>
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
          {COMMON_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id as CommonTab)}
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
        {tab === 'ai' && (
          <AITab orgCode={orgCode} orgId={orgId} orgName={orgName}
            googleConnected={googleConnected} microsoftConnected={microsoftConnected} />
        )}
        {tab === 'docs' && (
          <DocumentLibraryTab orgCode={orgCode} orgId={orgId} orgName={orgName}
            googleConnected={googleConnected} microsoftConnected={microsoftConnected}
            onSwitchToAnalyzer={() => setTab('ai')} />
        )}
        {tab === 'strategy' && (
          <StrategyBriefTab orgCode={orgCode} orgName={orgName} />
        )}
      </div>
    </div>
  );
}
