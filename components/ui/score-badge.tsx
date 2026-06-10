/**
 * <ScoreBadge> — composite score, scannable.
 *
 * DESIGN_SYSTEM.md §2.2. Rounded-square (4px) badge, 28px or 40px on a
 * side, color-coded by recommendation. Never shows decimals. Sub-70
 * scores switch to caption-weight to de-emphasize.
 */

import * as React from 'react';
import clsx from 'clsx';

export type ScoreVariant = 'pursue' | 'maybe' | 'skip';
export type ScoreSize    = 'sm' | 'lg';

export interface ScoreBadgeProps {
  score:    number;
  variant?: ScoreVariant;          // explicit override; otherwise derived from score
  size?:    ScoreSize;
  /** Visually screen-readers announce "<score> out of 100, recommendation <variant>" */
  ariaPrefix?: string;
}

function variantFor(score: number): ScoreVariant {
  if (score >= 70) return 'pursue';
  if (score >= 50) return 'maybe';
  return 'skip';
}

const VARIANT_CLASSES: Record<ScoreVariant, string> = {
  pursue: 'bg-signal-pursue-soft text-signal-pursue',
  maybe:  'bg-signal-maybe-soft  text-signal-maybe',
  skip:   'bg-signal-skip-soft   text-signal-skip',
};

const SIZE_CLASSES: Record<ScoreSize, string> = {
  sm: 'w-7 h-7 text-[13px]',
  lg: 'w-10 h-10 text-[18px]',
};

function ScoreBadgeRoot({ score, variant, size = 'sm', ariaPrefix }: ScoreBadgeProps) {
  const v = variant ?? variantFor(score);
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const isWeak = rounded < 70;
  return (
    <div
      aria-label={`${ariaPrefix ?? 'Match score'} ${rounded} out of 100, recommendation ${v}`}
      className={clsx(
        'inline-flex items-center justify-center rounded-sm font-semibold tabular-nums',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[v],
        isWeak && 'font-medium',
      )}
    >
      {rounded}
    </div>
  );
}

/**
 * Composite badge + caption line underneath, used when matchedProgram is known.
 *   [ 82 ]
 *   Teen Leadership
 */
function ScoreBadgeStack({
  score, variant, size = 'lg', caption,
}: ScoreBadgeProps & { caption?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <ScoreBadgeRoot score={score} variant={variant} size={size} />
      {caption && (
        <span className="text-caption text-ink-2 max-w-[88px] text-center truncate">
          {caption}
        </span>
      )}
    </div>
  );
}

export const ScoreBadge = Object.assign(ScoreBadgeRoot, { Stack: ScoreBadgeStack });
