export const dynamic = 'force-dynamic';

import { AppShell } from '@/components/app-shell';
import { getScoredFoundations, FoundationProfile } from '@/lib/foundation-intelligence';
import Link from 'next/link';
import {
  Building2, DollarSign, MapPin, Target, ExternalLink,
  Sparkles, TrendingUp, Calendar, ChevronRight, Info, Star,
  Search, Globe, CheckCircle,
} from 'lucide-react';

function formatCompact(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function FitBar({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#64748b';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-8 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function DeadlineBadge({ pattern }: { pattern: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    rolling:       { label: 'Rolling',       bg: '#f0fdf4', text: '#16a34a' },
    'annual-spring': { label: 'Spring Cycle', bg: '#eff6ff', text: '#2563eb' },
    'annual-fall':   { label: 'Fall Cycle',   bg: '#faf5ff', text: '#7c3aed' },
    cycle:         { label: 'Grant Cycle',   bg: '#fff7ed', text: '#c2410c' },
    unknown:       { label: 'Unknown',       bg: '#f1f5f9', text: '#64748b' },
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

function FoundationCard({ f, rank }: { f: FoundationProfile; rank: number }) {
  const isTopMatch = f.fitScore >= 70;
  const isChicago  = f.state === 'IL';

  return (
    <div className={`bg-white rounded-xl border shadow-card overflow-hidden transition-all hover:shadow-md ${
      isTopMatch ? 'border-[#0d9488]/30' : 'border-[#e2e8f0]'
    }`}>
      {/* Top accent bar for high-fit foundations */}
      {isTopMatch && (
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #0d9488, #0891b2)' }} />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 ${
            isTopMatch
              ? 'bg-gradient-to-br from-[#0d9488] to-[#0891b2]'
              : 'bg-[#f1f5f9] text-[#64748b]'
          }`}
          style={!isTopMatch ? {} : {}}>
            {isTopMatch
              ? <Star className="w-4 h-4" />
              : <span>#{rank}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[14px] font-bold text-[#0f172a] leading-snug">{f.name}</h3>
              {isChicago && (
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

        {/* Fit score */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Mission Fit</span>
          </div>
          <FitBar score={f.fitScore} />
          <p className="text-[10px] text-[#94a3b8] mt-1">{f.fitReason}</p>
        </div>

        {/* Key metrics */}
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

        {/* Grant range */}
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-3.5 h-3.5 text-[#94a3b8] flex-shrink-0" />
          <span className="text-[11px] text-[#64748b]">
            Grant range: <strong className="text-[#0f172a]">
              {formatCompact(f.grantRange.min)} – {formatCompact(f.grantRange.max)}
            </strong>
          </span>
        </div>

        {/* Focus areas */}
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

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#f1f5f9]">
          <DeadlineBadge pattern={f.deadlinePattern} />
          <div className="flex items-center gap-2">
            <a href={f.proPublicaUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[#94a3b8] hover:text-[#0d9488] transition-colors">
              990-PF <ExternalLink className="w-2.5 h-2.5" />
            </a>
            {f.applicationUrl && (
              <a href={f.applicationUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-semibold text-white px-2.5 py-1 rounded-[5px] transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                Apply <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center" style={{ background: color + '18' }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <p className="text-[24px] font-bold text-[#0f172a] leading-none">{value}</p>
      <p className="text-[11px] text-[#64748b] mt-1.5">{sub}</p>
    </div>
  );
}

export default function FoundationsPage() {
  const foundations  = getScoredFoundations();
  const topMatches   = foundations.filter(f => f.fitScore >= 70);
  const localFunders = foundations.filter(f => f.state === 'IL');
  const rolling      = foundations.filter(f => f.deadlinePattern === 'rolling');
  const totalPotential = foundations.slice(0, 10).reduce((s, f) => s + f.avgGrantAmount, 0);

  return (
    <AppShell>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-[#1e293b]"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a2236 60%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="absolute top-0 right-1/4 w-96 h-48 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />

        <div className="relative px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-[6px] flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-[#0d9488] text-[11px] font-bold tracking-widest uppercase">
                  Fundir Exclusive · Foundation Intelligence
                </span>
              </div>
              <h1 className="text-[26px] font-bold text-white leading-tight mb-2">
                Private Foundation Funding Map
              </h1>
              <p className="text-[#94a3b8] text-[14px] max-w-2xl leading-relaxed">
                {foundations.length} foundations scored against Chicago Youth Centers' mission and financials —
                surfacing funders that never appear on Grants.gov. Sourced from IRS Form 990-PF filings via ProPublica.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6">
            {[
              { label: 'Foundations Mapped',   value: `${foundations.length}`, sub: 'scored vs CYC profile',       color: '#0d9488' },
              { label: 'Strong Fits ≥70',       value: `${topMatches.length}`,  sub: 'high mission alignment',      color: '#16a34a' },
              { label: 'Chicago/IL Funders',    value: `${localFunders.length}`, sub: 'local funding geography',    color: '#6366f1' },
              { label: 'Total Grant Potential', value: formatCompact(totalPotential), sub: 'avg grants, top 10',   color: '#d97706' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="rounded-[10px] border border-white/10 p-4"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-2">{label}</p>
                <p className="text-[24px] font-bold leading-none" style={{ color }}>{value}</p>
                <p className="text-[10px] text-[#475569] mt-1">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-7xl mx-auto space-y-6">

        {/* ── How this works ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <Info className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#0f172a] mb-1">
                Why this beats every other grant platform
              </h2>
              <p className="text-[13px] text-[#475569] leading-relaxed mb-3">
                Grants.gov only lists federal grants. The majority of nonprofit funding — especially for community-based orgs like CYC —
                comes from <strong>private foundations</strong> that publish zero RFPs and are invisible to conventional grant searches.
                Fundir reads IRS Form 990-PF filings directly to reverse-engineer which foundations are actively funding
                missions like yours, what they typically award, and how to reach them.
              </p>
              <div className="flex flex-wrap gap-4 text-[12px]">
                {[
                  { icon: CheckCircle, label: 'Free data — IRS 990-PF via ProPublica', color: '#16a34a' },
                  { icon: CheckCircle, label: 'No grants.gov listing required',         color: '#16a34a' },
                  { icon: CheckCircle, label: 'Scored against your org\'s 990 profile', color: '#16a34a' },
                  { icon: CheckCircle, label: 'Local funders you\'ve never heard of',   color: '#16a34a' },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                    <span className="text-[#475569]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Top Matches ────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-[#0f172a]">Strongest Foundation Fits</h2>
              <p className="text-[12px] text-[#64748b] mt-0.5">
                Ranked by mission alignment score against CYC's programs and geography
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#94a3b8]">
              <Globe className="w-3.5 h-3.5" />
              Data: IRS 990-PF · ProPublica Nonprofit Explorer
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {foundations.slice(0, 12).map((f, i) => (
              <FoundationCard key={f.ein + f.name} f={f} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* ── Intelligence note ──────────────────────────────── */}
        <div className="rounded-xl border border-[#6366f1]/20 p-5"
          style={{ background: 'linear-gradient(135deg, #faf5ff, #f5f3ff)' }}>
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#6366f1] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-[13px] font-bold text-[#0f172a] mb-1">Coming Next: Automated 990-PF Grant Schedule Extraction</h3>
              <p className="text-[12px] text-[#6b21a8] leading-relaxed">
                Fundir will automatically pull the actual grant schedules from 990-PF Part XV to surface
                foundations that have granted to peer organizations like YMCA of Metropolitan Chicago,
                After School Matters, Youth Guidance, and Chicago CRED — then alert you when they're
                likely to make similar grants to CYC. This requires no API key and runs on the same
                free ProPublica infrastructure.
              </p>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
