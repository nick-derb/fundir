'use client';

import { useState, useEffect } from 'react';
import { FoundationProfile } from '@/lib/foundation-intelligence';
import { FoundationFinancials } from '@/lib/foundation-990';
import {
  MapPin, ExternalLink, Calendar, Star, X, Loader2,
  TrendingUp, TrendingDown, Minus, FileText, BarChart3, AlertCircle,
} from 'lucide-react';

function formatCompact(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ── Card sub-components ───────────────────────────────────────────────────────

function FitBar({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#64748b';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-8 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

function DeadlineBadge({ pattern }: { pattern: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    rolling:         { label: 'Rolling',       bg: '#f0fdf4', text: '#16a34a' },
    'annual-spring': { label: 'Spring Cycle',  bg: '#eff6ff', text: '#2563eb' },
    'annual-fall':   { label: 'Fall Cycle',    bg: '#faf5ff', text: '#7c3aed' },
    cycle:           { label: 'Grant Cycle',   bg: '#fff7ed', text: '#c2410c' },
    unknown:         { label: 'Unknown',       bg: '#f1f5f9', text: '#64748b' },
  };
  const s = map[pattern] || map.unknown;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: s.bg, color: s.text }}>
      <Calendar className="w-2.5 h-2.5" />
      {s.label}
    </span>
  );
}

function FoundationCard({ f, rank, onOpen }: { f: FoundationProfile; rank: number; onOpen: () => void }) {
  const isTopMatch = f.fitScore >= 70;
  const isLocal    = f.geographicFocus.some(g => g.toLowerCase().includes('chicago') || g.toLowerCase().includes('illinois'));

  return (
    <button
      onClick={onOpen}
      className={`text-left bg-white rounded-xl border shadow-card overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 ${
        isTopMatch ? 'border-[#0d9488]/30' : 'border-[#e2e8f0]'
      }`}
    >
      {isTopMatch && <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #0d9488, #0891b2)' }} />}
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 ${
            isTopMatch ? 'bg-gradient-to-br from-[#0d9488] to-[#0891b2]' : 'bg-[#f1f5f9] text-[#64748b]'
          }`}>
            {isTopMatch ? <Star className="w-4 h-4" /> : <span>#{rank}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[14px] font-bold text-[#0f172a] leading-snug">{f.name}</h3>
              {isLocal && (
                <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#0d9488]/10 text-[#0d9488] border border-[#0d9488]/20">
                  LOCAL
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3 h-3 text-[#94a3b8]" />
              <span className="text-[11px] text-[#64748b]">{f.city}, {f.state}</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Mission Fit</span>
          <div className="mt-1"><FitBar score={f.fitScore} /></div>
          <p className="text-[10px] text-[#94a3b8] mt-1">{f.fitReason}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#f8fafc] rounded-[6px] p-2 text-center">
            <p className="text-[10px] text-[#94a3b8] mb-0.5">Assets</p>
            <p className="text-[12px] font-bold text-[#0f172a]">{formatCompact(f.assets)}</p>
          </div>
          <div className="bg-[#f8fafc] rounded-[6px] p-2 text-center">
            <p className="text-[10px] text-[#94a3b8] mb-0.5">Avg Grant</p>
            <p className="text-[12px] font-bold text-[#0f172a]">{formatCompact(f.avgGrantAmount)}</p>
          </div>
          <div className="bg-[#f8fafc] rounded-[6px] p-2 text-center">
            <p className="text-[10px] text-[#94a3b8] mb-0.5">Giving/yr</p>
            <p className="text-[12px] font-bold text-[#0f172a]">{formatCompact(f.totalGrantsGiven)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {f.focusAreas.slice(0, 4).map(area => (
            <span key={area} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]">
              {area}
            </span>
          ))}
          {f.focusAreas.length > 4 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f1f5f9] text-[#94a3b8]">
              +{f.focusAreas.length - 4} more
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#f1f5f9]">
          <DeadlineBadge pattern={f.deadlinePattern} />
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#0d9488]">
            <BarChart3 className="w-3 h-3" />
            View 990 history
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function trendMeta(trend: FoundationFinancials['assetTrend']) {
  if (trend === 'growing')   return { Icon: TrendingUp,   color: '#16a34a', label: 'Growing asset base' };
  if (trend === 'declining') return { Icon: TrendingDown, color: '#dc2626', label: 'Declining asset base' };
  return { Icon: Minus, color: '#64748b', label: 'Stable asset base' };
}

function DeploymentChart({ history }: { history: FoundationFinancials['history'] }) {
  const recent = history.slice(-10);
  const max = Math.max(...recent.map(y => y.expenses), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5 h-32">
        {recent.map(y => {
          const pct = Math.max(3, (y.expenses / max) * 100);
          return (
            <div key={y.year} className="flex-1 flex flex-col items-center justify-end gap-1 group">
              <span className="text-[9px] font-semibold text-[#0d9488] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {formatCompact(y.expenses)}
              </span>
              <div className="w-full rounded-t transition-all"
                style={{ height: `${pct}%`, background: 'linear-gradient(180deg, #0d9488, #0891b2)' }} />
              <span className="text-[9px] text-[#94a3b8]">{`'${String(y.year).slice(2)}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FoundationDetailPanel({ f, onClose }: { f: FoundationProfile; onClose: () => void }) {
  const [data,    setData]    = useState<FoundationFinancials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/foundations/detail', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name: f.name, state: f.state, ein: f.ein }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error || 'Could not load filing data.');
        else         setData(json as FoundationFinancials);
      } catch {
        if (!cancelled) setError('Network error loading filing data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [f]);

  const trend = data ? trendMeta(data.assetTrend) : null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-4 flex items-start gap-3"
          style={{ background: 'linear-gradient(135deg, #0f172a, #1a2236)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-[#0d9488] uppercase tracking-widest mb-1">Foundation 990 Report</p>
            <h2 className="text-[16px] font-bold text-white leading-snug">{f.name}</h2>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">{f.city}, {f.state}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-[12px] text-[#64748b] py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#0d9488]" />
              Pulling IRS filing history from ProPublica…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#fef2f2] border border-[#fecaca]">
              <AlertCircle className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-[#991b1b]">{error}</p>
                <p className="text-[11px] text-[#b91c1c] mt-0.5">
                  This foundation may file a 990-N postcard or not yet have an indexed e-filing.
                </p>
              </div>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Live data badge */}
              <div className="flex items-center gap-2 text-[11px] px-3 py-2 rounded-lg bg-[#f0fdfa] border border-[#ccfbf1]">
                <FileText className="w-3.5 h-3.5 text-[#0d9488]" />
                <span className="text-[#0f766e] font-medium">
                  Live IRS data · most recent filing FY{data.latestYear} · {data.yearsOfData} years on record
                </span>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Total Assets',       value: formatCompact(data.totalAssets) },
                  { label: `Deployed FY${String(data.latestYear).slice(2)}`, value: formatCompact(data.latestExpenses) },
                  { label: `Revenue FY${String(data.latestYear).slice(2)}`,  value: formatCompact(data.latestRevenue) },
                  { label: 'NTEE Code',          value: data.nteeCode || '—' },
                ].map(s => (
                  <div key={s.label} className="bg-[#f8fafc] rounded-lg p-3 border border-[#f1f5f9]">
                    <p className="text-[10px] text-[#94a3b8] mb-1">{s.label}</p>
                    <p className="text-[15px] font-bold text-[#0f172a]">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Deployment history */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[12px] font-bold text-[#0f172a]">Annual Deployment</h3>
                  <span className="text-[10px] text-[#94a3b8]">grants + operations, per IRS filings</span>
                </div>
                <DeploymentChart history={data.history} />
                {data.deploymentCagr !== 0 && (
                  <p className="text-[11px] text-[#64748b] mt-2">
                    {data.deploymentCagr > 0 ? 'Up' : 'Down'}{' '}
                    <span className="font-semibold" style={{ color: data.deploymentCagr > 0 ? '#16a34a' : '#dc2626' }}>
                      {Math.abs(data.deploymentCagr * 100).toFixed(1)}%/yr
                    </span>{' '}
                    over the recorded window.
                  </p>
                )}
              </div>

              {/* Asset trend */}
              {trend && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#f8fafc] border border-[#f1f5f9]">
                  <trend.Icon className="w-4 h-4 flex-shrink-0" style={{ color: trend.color }} />
                  <span className="text-[12px] font-medium text-[#475569]">{trend.label}</span>
                </div>
              )}

              {/* Fit + focus (from Fundir scoring) */}
              <div>
                <h3 className="text-[12px] font-bold text-[#0f172a] mb-1.5">Why Fundir matched this funder</h3>
                <div className="mb-2"><FitBar score={f.fitScore} /></div>
                <p className="text-[11px] text-[#64748b] mb-2.5">{f.fitReason}</p>
                <div className="flex flex-wrap gap-1">
                  {f.focusAreas.map(area => (
                    <span key={area} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]">
                      {area}
                    </span>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className="flex flex-wrap gap-2 pt-1">
                {data.pdfUrl && (
                  <a href={data.pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg"
                    style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                    <FileText className="w-3 h-3" /> Full 990 PDF
                  </a>
                )}
                <a href={data.proPublicaUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475569] px-3 py-1.5 rounded-lg border border-[#e2e8f0] hover:border-[#0d9488]">
                  ProPublica <ExternalLink className="w-3 h-3" />
                </a>
                {f.applicationUrl && (
                  <a href={f.applicationUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475569] px-3 py-1.5 rounded-lg border border-[#e2e8f0] hover:border-[#0d9488]">
                    Apply <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────

export function FoundationsGrid({ foundations }: { foundations: FoundationProfile[] }) {
  const [selected, setSelected] = useState<FoundationProfile | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {foundations.map((f, i) => (
          <FoundationCard key={f.ein + f.name} f={f} rank={i + 1} onOpen={() => setSelected(f)} />
        ))}
      </div>
      {selected && <FoundationDetailPanel f={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
