/**
 * <GrantCard> — atomic unit of the discover and triage surfaces.
 *
 * DESIGN_SYSTEM.md §2.5. Eyebrow with award/source/ALN, two-line title,
 * funder line, evidence list, footer with deadline + score badge.
 * Whole card is the link to detail.
 */

import Link from 'next/link';
import clsx from 'clsx';
import { ScoreBadge } from './score-badge';
import { RecommendationPill, type Recommendation } from './recommendation-pill';
import { EvidenceList, type EvidenceItem } from './evidence-list';

interface GrantCardProps {
  href:           string;
  title:          string;
  funder:         string;
  /** Top-label slot — e.g. "UP TO $250K · FEDERAL · ALN 84.287". */
  eyebrow:        string;
  /** Composite score 0-100. */
  score:          number;
  recommendation: Recommendation;
  /** Optional matched-program tag rendered under the score. */
  matchedProgram?: string | null;
  /** Per-factor evidence bullets. */
  evidence?:      EvidenceItem[];
  /** Days until close; negative = closed. Renders as caption row. */
  deadlineDays?:  number | null;
  deadlineDate?:  string | null;
  /** Optional one-liner reason on the recommendation pill. */
  reason?:        string;
  /** Phase 6: short rationale rendered inline below the funder. Always
   *  visible, no hover required — the win-triage "saying no is a feature"
   *  pattern. Truncated by the card; pass ~180 chars max. */
  rationale?:     string;
}

function formatDeadline(days: number | null | undefined, date: string | null | undefined): string {
  if (days == null && !date) return 'Rolling';
  if (days != null && days < 0) return 'Closed';
  if (days != null && days === 0) return 'Closes today';
  if (days != null && days <= 14) return `${days} days left`;
  if (days != null) return `${days} days`;
  return date ?? '';
}

export function GrantCard({
  href, title, funder, eyebrow, score, recommendation, matchedProgram,
  evidence = [], deadlineDays, deadlineDate, reason, rationale,
}: GrantCardProps) {
  return (
    <Link
      href={href}
      className={clsx(
        'group block bg-canvas-1 rounded-lg p-5 shadow-flat transition-shadow duration-fast',
        'hover:shadow-lift focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 focus:ring-offset-canvas-0',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-eyebrow uppercase font-semibold text-ink-2 tracking-wider">
          {eyebrow}
        </div>
        <RecommendationPill recommendation={recommendation} reason={reason} />
      </div>

      <div className="mb-1">
        <div className="text-h2 font-semibold text-ink-0 leading-snug line-clamp-2">
          {title}
        </div>
        <div className="text-caption text-ink-1 mt-0.5">{funder}</div>
      </div>

      {/* Inline rationale (Phase 6B): a single short line beneath the funder,
          visible at-a-glance. Surfaces the matcher's recommendation for
          Pursue/Maybe AND the reason-to-skip for Skip — the "saying no is
          a feature" pattern. line-clamp-2 caps growth on dense cards. */}
      {rationale && (
        <p className="mt-2 text-body text-ink-1 leading-snug line-clamp-2">
          {rationale}
        </p>
      )}

      {evidence.length > 0 && (
        <div className="mt-3">
          <EvidenceList items={evidence} collapseAfter={3} />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-canvas-3 flex items-center justify-between gap-3">
        <div className="text-caption text-ink-1">
          {formatDeadline(deadlineDays, deadlineDate)}
        </div>
        <ScoreBadge.Stack
          score={score}
          variant={recommendation}
          size="lg"
          caption={matchedProgram}
        />
      </div>
    </Link>
  );
}
