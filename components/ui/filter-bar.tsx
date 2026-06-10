/**
 * <FilterBar> — chip row, not facet sidebar.
 *
 * DESIGN_SYSTEM.md §2.6. Each chip is one dimension (Amount, Deadline,
 * Source, Funder type, State). Active chips render filled; inactive
 * outlined. "Clear all" appears when ≥2 are active.
 *
 * If a filter doesn't earn a chip, it doesn't ship. That's the rule.
 */

import * as React from 'react';
import clsx from 'clsx';

export interface FilterChip {
  /** Dimension key, e.g. "amount". */
  key:   string;
  /** Always-visible label, e.g. "Amount". */
  label: string;
  /** Active value description when set, e.g. "< $250K". null when inactive. */
  value: string | null;
  /** Called when the chip is clicked. */
  onClick: () => void;
}

interface FilterBarProps {
  chips:     FilterChip[];
  onClearAll?: () => void;
}

export function FilterBar({ chips, onClearAll }: FilterBarProps) {
  const activeCount = chips.filter(c => c.value != null).length;

  return (
    <div className="flex items-center flex-wrap gap-2">
      {chips.map(c => {
        const active = c.value != null;
        return (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            className={clsx(
              'inline-flex items-center h-8 px-3 rounded-sm text-body font-medium transition-colors duration-fast',
              active
                ? 'bg-action text-canvas-1 border border-action'
                : 'bg-canvas-1 text-ink-0 border border-canvas-3 hover:bg-canvas-2',
            )}
          >
            <span className={active ? 'text-canvas-1' : 'text-ink-1'}>{c.label}</span>
            {active && (
              <>
                <span aria-hidden className="mx-1.5 opacity-60">·</span>
                <span>{c.value}</span>
              </>
            )}
          </button>
        );
      })}
      {activeCount >= 2 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-1 text-caption text-ink-2 underline hover:text-ink-0 transition-colors duration-fast"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
