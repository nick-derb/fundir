'use client';

import { useState, useTransition } from 'react';
import { reExtractFinancialRequirements } from '@/actions/discovery';
import { Sparkles, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface BatchResult {
  totalRemaining: number;
  scanned:        number;
  updated:        number;
  errors:         string[];
}

export function RefreshExtractionButton() {
  const [isPending, startTransition] = useTransition();
  const [result,    setResult]       = useState<BatchResult | null>(null);
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const r = await reExtractFinancialRequirements();
      setResult(r);
      router.refresh();
    });
  }

  const remainingAfter = result ? Math.max(0, result.totalRemaining - result.updated) : null;
  const allDone        = result != null && result.totalRemaining === 0;
  const moreLeft       = remainingAfter != null && remainingAfter > 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={run}
        disabled={isPending || allDone}
        className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#0f766e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        {isPending
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
          : moreLeft
            ? <><Sparkles className="w-3.5 h-3.5" /> Continue ({remainingAfter} left)</>
            : <><Sparkles className="w-3.5 h-3.5" /> Re-analyze existing grants</>
        }
      </button>

      {result && !isPending && (
        <div className="text-[12px] text-right max-w-xs">
          {result.updated > 0 && (
            <div className="flex items-center gap-1.5 text-[#16a34a] justify-end">
              <CheckCircle className="w-3.5 h-3.5" />
              {result.updated} grant{result.updated === 1 ? '' : 's'} upgraded
              {moreLeft && ` · ${remainingAfter} remaining`}
            </div>
          )}
          {allDone && (
            <div className="flex items-center gap-1.5 text-[#16a34a] justify-end">
              <CheckCircle className="w-3.5 h-3.5" />
              All grants already have the latest financial analysis.
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="flex items-start gap-1.5 text-amber-600 mt-1 justify-end">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {result.errors.length} skipped — re-click to retry
            </div>
          )}
        </div>
      )}
    </div>
  );
}
