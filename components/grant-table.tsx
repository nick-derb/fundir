'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { MatchResult } from '@/types';
import { getDaysUntil, formatCurrency, formatDate } from '@/lib/utils';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink,
  CheckCircle, XCircle, MinusCircle, Download, ChevronRight,
  HelpCircle, Sparkles,
} from 'lucide-react';
import type { EligibilitySignal } from '@/lib/990-screener';

type SortKey = 'composite_score' | 'close_date' | 'award' | 'pipeline_stage';
type SortDir = 'asc' | 'desc';

function ScoreArc({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const r = 14, cx = 16, cy = 16, circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative flex-shrink-0 w-8 h-8">
      <svg width="32" height="32" viewBox="0 0 32 32" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="3" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    discovered: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
    reviewing:  { bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
    preparing:  { bg: '#faf5ff', text: '#7c3aed', dot: '#7c3aed' },
    drafting:   { bg: '#fff7ed', text: '#c2410c', dot: '#d97706' },
    submitted:  { bg: '#f0fdf4', text: '#16a34a', dot: '#16a34a' },
    awarded:    { bg: '#f0fdf4', text: '#15803d', dot: '#15803d' },
    rejected:   { bg: '#fef2f2', text: '#dc2626', dot: '#dc2626' },
  };
  const style = map[stage] || { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{ background: style.bg, color: style.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
      {stage}
    </span>
  );
}

function SignalSummary({ signals }: { signals?: EligibilitySignal[] }) {
  if (!signals?.length) return null;
  const counts = { match: 0, likely: 0, mismatch: 0, unknown: 0 };
  for (const s of signals) {
    if (s.status === 'match') counts.match++;
    else if (s.status === 'mismatch') counts.mismatch++;
    else if (s.status === 'likely') counts.likely++;
    else counts.unknown++;
  }
  return (
    <div className="flex items-center gap-2 mt-1.5">
      {counts.match > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#16a34a]">
          <CheckCircle className="w-3 h-3" />{counts.match}
        </span>
      )}
      {counts.likely > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#d97706]">
          <MinusCircle className="w-3 h-3" />{counts.likely}
        </span>
      )}
      {counts.mismatch > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#dc2626]">
          <XCircle className="w-3 h-3" />{counts.mismatch}
        </span>
      )}
      {counts.unknown > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#94a3b8]">
          <HelpCircle className="w-3 h-3" />{counts.unknown}
        </span>
      )}
      <span className="text-[10px] text-[#94a3b8]">990 signals</span>
    </div>
  );
}

function DeadlineCell({ dateStr }: { dateStr?: string | null }) {
  const days = getDaysUntil(dateStr);
  if (days === null) return <span className="text-[#94a3b8] text-[12px]">—</span>;
  if (days < 0)  return <span className="text-[#94a3b8] text-[12px] line-through">{formatDate(dateStr)}</span>;
  return (
    <div>
      <p className="text-[12px] text-[#0f172a]">{formatDate(dateStr)}</p>
      <p className={`text-[10px] font-semibold mt-0.5 ${days <= 7 ? 'text-red-600' : days <= 14 ? 'text-orange-600' : days < 30 ? 'text-amber-600' : 'text-[#94a3b8]'}`}>
        {days === 0 ? 'Due today' : `${days}d left`}
      </p>
    </div>
  );
}

/* ── Expanded row ───────────────────────────────────────── */
function ExpandedRow({ match }: { match: MatchResult }) {
  const signals = match.financial_signals ?? [];
  const signalConfig: Record<string, { icon: typeof CheckCircle; color: string }> = {
    match:    { icon: CheckCircle, color: '#16a34a' },
    likely:   { icon: MinusCircle, color: '#d97706' },
    unknown:  { icon: HelpCircle,  color: '#94a3b8' },
    mismatch: { icon: XCircle,     color: '#dc2626' },
  };

  return (
    <tr className="bg-[#fafbff]">
      <td colSpan={7} className="px-4 py-0">
        <div className="py-4 grid grid-cols-2 gap-6 border-l-2 border-[#0d9488] pl-4 ml-2">

          {/* Recommendation */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-[#0d9488]" />
              <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest">Fundir Assessment</p>
            </div>
            {match.recommendation ? (
              <p className="text-[12px] text-[#475569] leading-relaxed">{match.recommendation}</p>
            ) : (
              <p className="text-[12px] text-[#94a3b8] italic">No assessment available</p>
            )}

            {match.eligibility_flags?.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-bold text-[#d97706] uppercase tracking-widest">Eligibility Flags</p>
                {(match.eligibility_flags as string[]).map((flag, i) => (
                  <p key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5">•</span>{flag}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 990 Signals */}
          <div>
            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-2">990 Eligibility Signals</p>
            {signals.length === 0 ? (
              <p className="text-[12px] text-[#94a3b8] italic">990 screening not available</p>
            ) : (
              <div className="space-y-1.5">
                {signals.slice(0, 5).map((s) => {
                  const cfg = signalConfig[s.status] || signalConfig.unknown;
                  const Icon = cfg.icon;
                  return (
                    <div key={s.factor} className="flex items-center gap-2">
                      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: cfg.color }} />
                      <span className="text-[11px] font-medium text-[#0f172a]">{s.factor}</span>
                      <span className="text-[10px] text-[#94a3b8] flex-1 truncate">{s.headline}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              href={`/grant/${match.grant_id}`}
              className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold text-[#0d9488] hover:text-[#0f766e] transition-colors"
            >
              Full analysis <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}

interface GrantTableProps {
  matches: MatchResult[];
  emptyMessage?: string;
}

function exportCSV(matches: MatchResult[]) {
  const headers = ['Title', 'Agency', 'ALN Codes', 'Deadline', 'Award Floor', 'Award Ceiling', 'Match Score', 'Financial Score', 'Stage', 'Recommendation'];
  const rows = matches.map(m => [
    m.grant?.title ?? '',
    m.grant?.agency_name ?? '',
    m.grant?.aln_codes?.join('; ') ?? '',
    m.grant?.close_date ?? '',
    m.grant?.extracted_fields?.award_floor ?? '',
    m.grant?.extracted_fields?.award_ceiling ?? '',
    m.composite_score.toFixed(1),
    (m.financial_score ?? 50).toFixed(1),
    m.pipeline_stage,
    m.recommendation ?? '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `fundir-grants-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GrantTable({ matches, emptyMessage = 'No grants found.' }: GrantTableProps) {
  const [sortKey, setSortKey]     = useState<SortKey>('composite_score');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [search, setSearch]       = useState('');
  const [expandedId, setExpandedId]  = useState<string | null>(null);
  const [scoreMin, setScoreMin]   = useState(0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const filtered = useMemo(() => {
    let list = [...matches];
    if (stageFilter !== 'all') list = list.filter(m => m.pipeline_stage === stageFilter);
    if (scoreMin > 0) list = list.filter(m => m.composite_score >= scoreMin);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.grant?.title?.toLowerCase().includes(q) ||
        m.grant?.agency_name?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortKey === 'composite_score') { va = a.composite_score; vb = b.composite_score; }
      else if (sortKey === 'close_date') {
        va = a.grant?.close_date || '9999'; vb = b.grant?.close_date || '9999';
      } else if (sortKey === 'award') {
        va = a.grant?.extracted_fields?.award_ceiling || 0;
        vb = b.grant?.extracted_fields?.award_ceiling || 0;
      } else if (sortKey === 'pipeline_stage') { va = a.pipeline_stage; vb = b.pipeline_stage; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [matches, sortKey, sortDir, stageFilter, search, scoreMin]);

  const stages = ['all', ...Array.from(new Set(matches.map(m => m.pipeline_stage)))];

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-[#cbd5e1]" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-[#0d9488]" />
      : <ChevronDown className="w-3 h-3 text-[#0d9488]" />;
  }

  const highCount = filtered.filter(m => m.composite_score >= 70).length;
  const totalAward = filtered.reduce((s, m) =>
    s + (m.grant?.extracted_fields?.award_ceiling || m.grant?.extracted_fields?.award_floor || 0), 0
  );

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden shadow-card">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or agency…"
            className="flex-1 min-w-[200px] max-w-xs px-3 py-1.5 bg-white border border-[#e2e8f0] rounded-[6px] text-[13px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
          />

          {/* Score filter chips */}
          <div className="flex items-center gap-1">
            {[
              { label: 'All',   min: 0   },
              { label: '≥40',   min: 40  },
              { label: '≥60',   min: 60  },
              { label: '≥70',   min: 70  },
            ].map(({ label, min }) => (
              <button key={min} onClick={() => setScoreMin(min)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  scoreMin === min
                    ? 'bg-[#0d9488] text-white'
                    : 'text-[#64748b] bg-white border border-[#e2e8f0] hover:border-[#0d9488]/30 hover:text-[#0f172a]'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-[#e2e8f0]" />

          {/* Stage filter */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {stages.map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap capitalize ${
                  stageFilter === s
                    ? 'bg-[#0f172a] text-white'
                    : 'text-[#64748b] bg-white border border-[#e2e8f0] hover:text-[#0f172a]'
                }`}>
                {s === 'all' ? `All stages` : s}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 text-[11px] text-[#94a3b8]">
              <span><strong className="text-[#0f172a]">{filtered.length}</strong> grants</span>
              {highCount > 0 && <span><strong className="text-[#16a34a]">{highCount}</strong> high-match</span>}
              {totalAward > 0 && (
                <span><strong className="text-[#0f172a]">
                  {totalAward >= 1_000_000 ? `$${(totalAward / 1_000_000).toFixed(1)}M` : `$${(totalAward / 1_000).toFixed(0)}K`}
                </strong> total potential</span>
              )}
            </div>
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[#e2e8f0] bg-white rounded-[6px] text-[11px] font-medium text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest w-[36%]">Grant</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">Agency</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest cursor-pointer select-none"
              onClick={() => toggleSort('close_date')}>
              <span className="flex items-center gap-1">Deadline <SortIcon col="close_date" /></span>
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest cursor-pointer select-none"
              onClick={() => toggleSort('award')}>
              <span className="flex items-center gap-1">Award <SortIcon col="award" /></span>
            </th>
            <th className="text-center px-4 py-2.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest cursor-pointer select-none"
              onClick={() => toggleSort('composite_score')}>
              <span className="flex items-center justify-center gap-1">Match <SortIcon col="composite_score" /></span>
            </th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest cursor-pointer select-none"
              onClick={() => toggleSort('pipeline_stage')}>
              <span className="flex items-center gap-1">Stage <SortIcon col="pipeline_stage" /></span>
            </th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-14 text-center text-[#94a3b8] text-[13px]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            filtered.map(match => {
              const award = match.grant?.extracted_fields?.award_ceiling ||
                            match.grant?.extracted_fields?.award_floor;
              const expanded = expandedId === match.id;
              const scoreColor = match.composite_score >= 70 ? '#16a34a' : match.composite_score >= 40 ? '#d97706' : '#dc2626';

              return (
                <>
                  <tr
                    key={match.id}
                    onClick={() => setExpandedId(expanded ? null : match.id)}
                    className={`border-b border-[#f1f5f9] last:border-0 cursor-pointer transition-colors group ${
                      expanded ? 'bg-[#fafbff]' : 'hover:bg-[#f8fafc]'
                    }`}
                    style={{ borderLeft: expanded ? `3px solid ${scoreColor}` : '3px solid transparent' }}
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[13px] text-[#0f172a] group-hover:text-[#0d9488] transition-colors line-clamp-2 leading-snug">
                        {match.grant?.title || 'Unknown Grant'}
                      </p>
                      <SignalSummary signals={match.financial_signals} />
                    </td>
                    <td className="px-4 py-3.5 text-[#64748b] max-w-[160px]">
                      <span className="text-[12px] line-clamp-2 leading-snug">{match.grant?.agency_name || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <DeadlineCell dateStr={match.grant?.close_date} />
                    </td>
                    <td className="px-4 py-3.5">
                      {award
                        ? <span className="text-[12px] font-semibold text-[#0f172a]">{formatCurrency(award)}</span>
                        : <span className="text-[#94a3b8] text-[12px]">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-center">
                        <ScoreArc score={match.composite_score} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StageBadge stage={match.pipeline_stage} />
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-[#cbd5e1] group-hover:text-[#0d9488] transition-all ${expanded ? 'rotate-180 text-[#0d9488]' : ''}`}
                        />
                        <Link
                          href={`/grant/${match.grant_id}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#cbd5e1] hover:text-[#0d9488] transition-colors" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {expanded && <ExpandedRow key={`${match.id}-expanded`} match={match} />}
                </>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
