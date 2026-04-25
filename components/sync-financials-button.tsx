'use client';

import { useState, useTransition } from 'react';
import { syncFinancials } from '@/actions/financials';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface SyncFinancialsButtonProps {
  orgCode: string;
  disabled?: boolean;
}

export function SyncFinancialsButton({ orgCode, disabled }: SyncFinancialsButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const router = useRouter();

  function handleSync() {
    setStatus('idle');
    setMessage('');
    startTransition(async () => {
      const result = await syncFinancials(orgCode);
      if (result.success) {
        setStatus('done');
        setMessage(
          `Loaded FY${result.filingYear} · ${formatCurrency(result.totalRevenue ?? 0)} revenue`
        );
        router.refresh(); // reload page data
      } else {
        setStatus('error');
        setMessage(result.error || 'Unknown error');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <button
        onClick={handleSync}
        disabled={disabled || isPending}
        className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#0f766e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Syncing 990…' : 'Sync from 990'}
      </button>
      {status === 'done' && (
        <div className="flex items-center gap-1.5 text-[12px] text-[#16a34a]">
          <CheckCircle className="w-3.5 h-3.5" />
          {message}
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-1.5 text-[12px] text-red-500 max-w-xs text-right">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {message}
        </div>
      )}
    </div>
  );
}
