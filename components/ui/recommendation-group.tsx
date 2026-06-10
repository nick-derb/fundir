/**
 * <RecommendationGroup> — the win-triage primitive.
 *
 * DESIGN_SYSTEM.md §2.9. Three sections (Pursue, Maybe, Skip), each with
 * heading + count + GrantCards. Skip is collapsed by default and, when
 * expanded, each card surfaces the reason it's a skip.
 *
 * Saying no is a feature — the directories literally can't ship this
 * because their data layer has no notion of "why not."
 */

'use client';

import * as React from 'react';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface GroupProps {
  pursue: { count: number; children: React.ReactNode };
  maybe:  { count: number; children: React.ReactNode };
  skip:   { count: number; children: React.ReactNode };
}

export function RecommendationGroup({ pursue, maybe, skip }: GroupProps) {
  const [skipOpen, setSkipOpen] = useState(false);

  return (
    <div className="space-y-8">
      {pursue.count > 0 && (
        <section>
          <SectionHeading variant="pursue" label="Pursue" count={pursue.count} />
          <div className="mt-3 grid gap-3">{pursue.children}</div>
        </section>
      )}

      {maybe.count > 0 && (
        <section>
          <SectionHeading variant="maybe" label="Maybe" count={maybe.count} />
          <div className="mt-3 grid gap-3">{maybe.children}</div>
        </section>
      )}

      {skip.count > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setSkipOpen(v => !v)}
            className="flex items-center gap-2 group"
            aria-expanded={skipOpen}
          >
            <SectionHeading variant="skip" label="Skip" count={skip.count} />
            <span className="text-ink-2 group-hover:text-ink-0 transition-colors">
              {skipOpen
                ? <ChevronDown  className="w-4 h-4" aria-hidden />
                : <ChevronRight className="w-4 h-4" aria-hidden />}
            </span>
          </button>
          {skipOpen && <div className="mt-3 grid gap-3">{skip.children}</div>}
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  variant, label, count,
}: { variant: 'pursue' | 'maybe' | 'skip'; label: string; count: number }) {
  const color =
    variant === 'pursue' ? 'text-signal-pursue'
  : variant === 'maybe'  ? 'text-signal-maybe'
                         : 'text-signal-skip';
  return (
    <h2 className="flex items-center gap-2 text-h1 font-semibold">
      <span className={color}>{label}</span>
      <span className="text-ink-2 font-medium">· {count}</span>
    </h2>
  );
}
