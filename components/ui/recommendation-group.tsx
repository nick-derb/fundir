/**
 * <RecommendationGroup> — the win-triage primitive.
 *
 * Three sections (Pursue, Maybe, Skip), each with a quiet eyebrow header
 * (uppercase + semantic dot + mono count) and a stack of GrantCards. Skip
 * is collapsed by default — and when expanded, each card surfaces the
 * reason it's a skip. Saying no is a feature.
 *
 * Phase 2 redesign: quiet section headers (per brief), mono count, no
 * h1-weight title that risked clipping at the top of the panel.
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
    <div className="space-y-6">
      {pursue.count > 0 && (
        <section>
          <SectionHeading variant="pursue" label="Pursue" count={pursue.count} />
          <div className="mt-2 grid gap-2">{pursue.children}</div>
        </section>
      )}

      {maybe.count > 0 && (
        <section>
          <SectionHeading variant="maybe" label="Maybe" count={maybe.count} />
          <div className="mt-2 grid gap-2">{maybe.children}</div>
        </section>
      )}

      {skip.count > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setSkipOpen(v => !v)}
            aria-expanded={skipOpen}
            className="flex items-center gap-2 group"
          >
            <SectionHeading variant="skip" label="Skip" count={skip.count} />
            <span className="text-tertiary group-hover:text-primary transition-colors">
              {skipOpen
                ? <ChevronDown  className="w-3.5 h-3.5" aria-hidden />
                : <ChevronRight className="w-3.5 h-3.5" aria-hidden />}
            </span>
          </button>
          {skipOpen && <div className="mt-2 grid gap-2">{skip.children}</div>}
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  variant, label, count,
}: { variant: 'pursue' | 'maybe' | 'skip'; label: string; count: number }) {
  const dotCls =
    variant === 'pursue' ? 'bg-success'
  : variant === 'maybe'  ? 'bg-warning'
                         : 'bg-critical';
  return (
    <div className="flex items-baseline gap-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} aria-hidden />
      <span className="text-eyebrow uppercase text-primary font-semibold">{label}</span>
      <span className="font-mono text-caption text-secondary tabular-nums">{count}</span>
    </div>
  );
}
