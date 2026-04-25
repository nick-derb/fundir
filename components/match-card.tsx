import Link from 'next/link';
import { MatchResult } from '@/types';
import { getDaysUntil, formatCurrency } from '@/lib/utils';
import { Calendar, Building2, DollarSign, ArrowRight } from 'lucide-react';

interface MatchCardProps {
  match: MatchResult;
  compact?: boolean;
}

function ScoreBadge({ score }: { score: number }) {
  const config =
    score >= 70 ? { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', label: 'Strong' } :
    score >= 40 ? { bg: '#fffbeb', text: '#d97706', border: '#fde68a', label: 'Medium' } :
                  { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Low' };
  return (
    <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg border flex-shrink-0"
      style={{ background: config.bg, borderColor: config.border }}>
      <span className="text-[18px] font-bold leading-none" style={{ color: config.text }}>{score.toFixed(0)}</span>
      <span className="text-[9px] font-semibold mt-0.5" style={{ color: config.text }}>{config.label}</span>
    </div>
  );
}

export function MatchCard({ match, compact = false }: MatchCardProps) {
  const grant = match.grant;
  const days = getDaysUntil(grant?.close_date);
  const award = grant?.extracted_fields?.award_ceiling || grant?.extracted_fields?.award_floor;

  const deadlineColor =
    days === null ? 'text-[#94a3b8]' :
    days < 0 ? 'text-[#94a3b8]' :
    days < 14 ? 'text-red-600 font-semibold' :
    days < 30 ? 'text-amber-600' : 'text-[#475569]';

  return (
    <Link href={`/grant/${match.grant_id}`} className="block group">
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 hover:border-[#0d9488]/40 hover:shadow-card transition-all">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[#0f172a] text-[13px] leading-snug group-hover:text-[#0d9488] transition-colors line-clamp-2">
              {grant?.title || 'Unknown Grant'}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-[12px] text-[#64748b]">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{grant?.agency_name}</span>
            </div>
          </div>
          <ScoreBadge score={match.composite_score} />
        </div>

        {!compact && (
          <>
            {match.recommendation && (
              <p className="text-[12px] text-[#64748b] mt-2 line-clamp-2 leading-relaxed">{match.recommendation}</p>
            )}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#f1f5f9] text-[12px]">
              <span className={`flex items-center gap-1 ${deadlineColor}`}>
                <Calendar className="w-3 h-3" />
                {days === null ? 'No deadline' : days < 0 ? 'Closed' : `${days}d left`}
              </span>
              {award && (
                <span className="flex items-center gap-1 text-[#64748b]">
                  <DollarSign className="w-3 h-3" />
                  {formatCurrency(award)}
                </span>
              )}
              <span className="ml-auto px-2 py-0.5 bg-[#f1f5f9] text-[#475569] rounded-full text-[11px] font-medium capitalize">
                {match.pipeline_stage}
              </span>
            </div>
          </>
        )}

        {compact && (
          <div className="flex items-center justify-end mt-2">
            <ArrowRight className="w-3.5 h-3.5 text-[#cbd5e1] group-hover:text-[#0d9488] transition-colors" />
          </div>
        )}
      </div>
    </Link>
  );
}
