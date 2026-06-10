/**
 * <RecommendationPill> — the win-triage primitive.
 *
 * DESIGN_SYSTEM.md §2.3. Eyebrow type, soft fill, dark text. Lives on
 * every grant row in the win-triage and discover surfaces. Hover surfaces
 * the one-line `reason` if provided.
 */

import * as React from 'react';
import clsx from 'clsx';

export type Recommendation = 'pursue' | 'maybe' | 'skip';

interface RecommendationPillProps {
  recommendation: Recommendation;
  /** Optional one-liner shown on hover via title attribute. */
  reason?: string;
  /** Override the default label (Pursue / Maybe / Skip). */
  label?:  string;
}

const VARIANT_CLASSES: Record<Recommendation, string> = {
  pursue: 'bg-signal-pursue-soft text-signal-pursue',
  maybe:  'bg-signal-maybe-soft  text-signal-maybe',
  skip:   'bg-signal-skip-soft   text-signal-skip',
};

const DEFAULT_LABEL: Record<Recommendation, string> = {
  pursue: 'Pursue',
  maybe:  'Maybe',
  skip:   'Skip',
};

export function RecommendationPill({ recommendation, reason, label }: RecommendationPillProps) {
  return (
    <span
      title={reason}
      className={clsx(
        'inline-flex items-center h-6 px-2.5 rounded-sm font-semibold uppercase tracking-wider text-eyebrow',
        VARIANT_CLASSES[recommendation],
      )}
    >
      {label ?? DEFAULT_LABEL[recommendation]}
    </span>
  );
}
