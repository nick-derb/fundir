'use client';

/**
 * <EvidenceList> — the signature surface.
 *
 * DESIGN_SYSTEM.md §2.4. Renders per-factor evidence as a tight scannable
 * list. Each item shows a colored leading dot, the bullet text, and a
 * right-aligned faded factor tag.
 *
 * This is the component the directories can't ship — they have no
 * per-factor evidence to show. Treat it as a first-class differentiator.
 *
 * Client component because the "show all evidence" expansion uses
 * useState. Importable from server components — Next.js boundary
 * handles the interop transparently.
 */

import { useState } from 'react';
import clsx from 'clsx';

export type FactorKey =
  | 'semantic'
  | 'eligibility'
  | 'financial_990'
  | 'funder_affinity'
  | 'strategic'
  | 'historical';

export interface EvidenceItem {
  text:   string;
  factor: FactorKey;
}

interface EvidenceListProps {
  items: EvidenceItem[];
  /** Items shown before collapsing the rest behind "Show all evidence". */
  collapseAfter?: number;
}

const FACTOR_DOT: Record<FactorKey, string> = {
  semantic:        'bg-action',
  eligibility:     'bg-signal-pursue',
  financial_990:   'bg-ink-1',
  funder_affinity: 'bg-signal-maybe',
  strategic:       'bg-ink-2',
  historical:      'bg-action',
};

const FACTOR_LABEL: Record<FactorKey, string> = {
  semantic:        'semantic',
  eligibility:     'eligibility',
  financial_990:   '990 fit',
  funder_affinity: 'funder',
  strategic:       'strategic',
  historical:      'historical',
};

export function EvidenceList({ items, collapseAfter = 6 }: EvidenceListProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, collapseAfter);
  const remaining = items.length - shown.length;

  return (
    <ul className="space-y-2">
      {shown.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            className={clsx('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', FACTOR_DOT[item.factor])}
            aria-hidden
          />
          <span className="text-body text-ink-0 flex-1 min-w-0">{item.text}</span>
          <span className="text-eyebrow text-ink-3 uppercase font-semibold shrink-0 pt-0.5">
            {FACTOR_LABEL[item.factor]}
          </span>
        </li>
      ))}
      {remaining > 0 && !expanded && (
        <li>
          <button
            type="button"
            className="text-caption text-action underline hover:text-action-hover transition-colors duration-fast"
            onClick={() => setExpanded(true)}
          >
            Show all evidence ({remaining} more)
          </button>
        </li>
      )}
    </ul>
  );
}
