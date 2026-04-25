'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { MatchResult } from '@/types';
import { getDaysUntil, formatCurrency, formatDate } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, CheckCircle, XCircle, MinusCircle, Download } from 'lucide-react';
import type { EligibilitySignal } from '@/lib/990-screener';

type SortKey = 'composite_score' | 'close_date' | 'award' | 'pipeline_stage';
type SortDir = 'asc' | 'desc';

function ScoreBadge({ score }: { score: number }) {
  const config =
    score >= 70 ? { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' } :
    score >= 40 ? { bg: '#fffbeb', text: '#d97706', border: '#fde68a' } :
                  { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
  return (
    <span
      className="inline-flex items-center justify-center w-10 h-7 rounded-[4px] text-[12px] font-bold border"
      style={{ background: config.bg, color: config.text, borderColor: config.border }}
    >
      {score.toFixed(0)}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    discovered: { bg: '#f1f5f9', text: '#64748b' },
    reviewing:  { bg: '#eff6ff', text: '#2563eb' },
    preparing:  { bg: '#faf5ff', text: '#7c3aed' },
    drafting:   { bg: '#fff7ed', text: '#c2410c' },
    submitted:  { bg: '#f0fdf4', text: '#16a34a' },
    awarded:    { bg: '#f0fdf4', text: '#15803d' },
    rejected:   { bg: '#fef2f2', text: '#dc2626' },
  };
  const style = map[stage] || { bg: '#f1f5f9', text: '#64748b' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{ background: style.bg, color: style.text }}
    >
      {stage}
    </span>
  );
}

function FinancialSignalDots({ signals }: { signals?: EligibilitySignal[] }) {
  if (!signals?.length) return null;
  const counts = { match: 0, likely: 0, mismatch: 0 };
  for (const s of signals) {
    if (s.status === 'match') counts.match++;
    else if (s.status === 'mismatch') counts.mismatch++;
    else if (s.status === 'likely') counts.likely++;
  }
  return (
    <div className="flex items-center gap-1 mt-1">
      {counts.match > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#16a34a]">
          <CheckCircle className="w-3 h-3" />{counts.match}
        </span>
      )}
      {counts.likely > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#d97706]">
          <MinusCircle className="w-3 h-3" />{counts.likely}
        </span>
      )}
      {counts.mismatch > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#dc2626]">
          <XCircle className="w-3 h-3" />{counts.mismatch}
        </span>
      )}
      <span className="text-[10px] text-[#94a3b8] ml-0.5">990</span>
    </div>
  );
}

function DeadlineCell({ dateStr }: { dateStr?: string | null }) {
  const days = getDaysUntil(dateStr);
  if (days === null) return <span className="text-[#94a3b8]">—</span>;
  if (days < 0) return <span className="text-[#94a3b8] line-through">{formatDate(dateStr)}</span>;
  return (
    <div>
      <p className="text-[#0f172a]">{formatDate(dateStr)}</p>
      <p className={`text-[11px] font-medium mt-0.5 ${days < 14 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-[#64748b]'}`}>
        {days === 0 ? 'Due today' : `${days}d left`}
      </p>
    </div>
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
  const [sortKey, setSortKey] = useState<SortKey>('composite_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const filtered = useMemo(() => {
    let list = [...matches];
    if (stageFilter !== 'all') list = list.filter(m => m.pipeline_stage === stageFilter);
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
      }
      else if (sortKey === 'award') {
        va = a.grant?.extracted_fields?.award_ceiling || 0;
        vb = b.grant?.extracted_fields?.award_ceiling || 0;
      }
      else if (sortKey === 'pipeline_stage') { va = a.pipeline_stage; vb = b.pipeline_stage; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [matches, sortKey, sortDir, stageFilter, search]);

  const stages = ['all', ...Array.from(new Set(matches.map(m => m.pipeline_stage)))];

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-[#cbd5e1]" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-[#0d9488]" />
      : <ChevronDown className="w-3 h-3 text-[#0d9488]" />;
  }

  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] overflow-hidden shadow-card">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e2e8f0] bg-white">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search grants…"
          className="flex-1 max-w-xs px-3 py-1.5 border border-[#e2e8f0] rounded-[6px] text-[13px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
        />
        {/* Stage filter */}
        <div className="flex items-center gap-1">
          {stages.map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors capitalize ${
                stageFilter === s
                  ? 'bg-[#0d9488] text-white'
                  : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]'
              }`}
            >
              {s === 'all' ? `All (${matches.length})` : s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-[#94a3b8]">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-[#e2e8f0] rounded-lg text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide w-[40%]">
              Grant
            </th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide">
              Agency
            </th>
            <th
              className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide cursor-pointer select-none"
              onClick={() => toggleSort('close_date')}
            >
              <span className="flex items-center gap-1">Deadline <SortIcon col="close_date" /></span>
            </th>
            <th
              className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide cursor-pointer select-none"
              onClick={() => toggleSort('award')}
            >
              <span className="flex items-center gap-1">Award <SortIcon col="award" /></span>
            </th>
            <th
              className="text-center px-4 py-2.5 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide cursor-pointer select-none"
              onClick={() => toggleSort('composite_score')}
            >
              <span className="flex items-center justify-center gap-1">Match <SortIcon col="composite_score" /></span>
            </th>
            <th
              className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide cursor-pointer select-none"
              onClick={() => toggleSort('pipeline_stage')}
            >
              <span className="flex items-center gap-1">Stage <SortIcon col="pipeline_stage" /></span>
            </th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-[#94a3b8] text-[13px]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            filtered.map(match => {
              const award = match.grant?.extracted_fields?.award_ceiling ||
                            match.grant?.extracted_fields?.award_floor;
              return (
                <tr
                  key={match.id}
                  className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc] transition-colors group"
                >
                  <td className="px-4 py-3">
                    <Link href={`/grant/${match.grant_id}`} className="block">
                      <p className="font-medium text-[#0f172a] group-hover:text-[#0d9488] transition-colors line-clamp-2 leading-snug">
                        {match.grant?.title || 'Unknown Grant'}
                      </p>
                      {match.recommendation && (
                        <p className="text-[11px] text-[#94a3b8] mt-0.5 line-clamp-1">{match.recommendation}</p>
                      )}
                      <FinancialSignalDots signals={match.financial_signals} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#475569] max-w-[180px]">
                    <span className="line-clamp-2 leading-snug">{match.grant?.agency_name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <DeadlineCell dateStr={match.grant?.close_date} />
                  </td>
                  <td className="px-4 py-3 text-[#475569]">
                    {award ? formatCurrency(award) : <span className="text-[#94a3b8]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={match.composite_score} />
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={match.pipeline_stage} />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/grant/${match.grant_id}`}>
                      <ExternalLink className="w-3.5 h-3.5 text-[#cbd5e1] group-hover:text-[#0d9488] transition-colors" />
                    </Link>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
