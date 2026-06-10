/**
 * <EmptyState> — shipped on every list, table, and score chart that can
 * have no data. DESIGN_SYSTEM.md §2.8.
 *
 * Variants:
 *   no-data       — first-load state, CTA is the next action.
 *   filtered-out  — too-aggressive filters, CTA clears them.
 *   waiting       — background work in flight, shows ETA, no CTA.
 */

import * as React from 'react';
import clsx from 'clsx';

type Variant = 'no-data' | 'filtered-out' | 'waiting';

interface EmptyStateProps {
  /** A single lucide icon at 16x16, muted. */
  icon?:   React.ReactNode;
  variant?: Variant;
  title:   string;
  body?:   string;
  cta?:    React.ReactNode;
  /** Show 3 muted skeleton rows under the body — only for `waiting`. */
  skeleton?: boolean;
}

export function EmptyState({
  icon, variant = 'no-data', title, body, cta, skeleton,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center text-center py-12 px-4',
        variant === 'waiting' && 'text-ink-2',
      )}
      role={variant === 'waiting' ? 'status' : undefined}
      aria-live={variant === 'waiting' ? 'polite' : undefined}
    >
      {icon && <div className="text-ink-2 mb-3" aria-hidden>{icon}</div>}
      <div className="text-h2 font-semibold text-ink-0 mb-1">{title}</div>
      {body && <div className="text-body text-ink-1 max-w-md mb-4">{body}</div>}
      {cta}
      {skeleton && variant === 'waiting' && (
        <div className="w-full max-w-md mt-6 space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-3 rounded-sm bg-canvas-2 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
