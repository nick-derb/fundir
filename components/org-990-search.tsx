'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { searchOrgAction } from '@/actions/search-org';
import { syncFinancialsByEin } from '@/actions/financials';
import { OrgSearchResult } from '@/lib/propublica';
import { formatCurrency } from '@/lib/utils';
import {
  Search, Loader2, CheckCircle, AlertCircle, Building2,
  MapPin, FileText, DollarSign, X,
} from 'lucide-react';

interface Org990SearchProps {
  orgCode: string;
}

function nteeLabel(code: string): string {
  if (!code) return '';
  const group = code.charAt(0).toUpperCase();
  const labels: Record<string, string> = {
    A: 'Arts & Culture', B: 'Education', C: 'Environment', D: 'Animal Welfare',
    E: 'Health', F: 'Mental Health', G: 'Disease & Disorders', H: 'Medical Research',
    I: 'Crime & Legal', J: 'Employment', K: 'Food & Agriculture', L: 'Housing',
    M: 'Public Safety', N: 'Recreation', O: 'Youth Development', P: 'Human Services',
    Q: 'International', R: 'Civil Rights', S: 'Community Development', T: 'Philanthropy',
    U: 'Science & Tech', W: 'Public Policy',
  };
  return labels[group] ? `${labels[group]} (${code})` : code;
}

export function Org990Search({ orgCode }: Org990SearchProps) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<OrgSearchResult[]>([]);
  const [selected, setSelected]     = useState<OrgSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen]         = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchOrgAction(q);
        setResults(res);
        setIsOpen(res.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setSelected(null);
    setSyncStatus('idle');
    runSearch(v);
  }

  function handleSelect(org: OrgSearchResult) {
    setSelected(org);
    setQuery(org.name);
    setIsOpen(false);
    setSyncStatus('idle');
    setSyncMessage('');
  }

  function handleClear() {
    setQuery('');
    setSelected(null);
    setResults([]);
    setIsOpen(false);
    setSyncStatus('idle');
    setSyncMessage('');
    inputRef.current?.focus();
  }

  function handleSync() {
    if (!selected) return;
    setSyncStatus('syncing');
    setSyncMessage('');
    startTransition(async () => {
      // Use the EIN from the search result directly — bypasses whatever is in DB
      const result = await syncFinancialsByEin(orgCode, selected.ein);
      if (result.success) {
        setSyncStatus('done');
        setSyncMessage(`Loaded FY${result.filingYear} · ${formatCurrency(result.totalRevenue ?? 0)} total revenue`);
        router.refresh();
      } else {
        setSyncStatus('error');
        setSyncMessage(result.error || 'Sync failed.');
      }
    });
  }

  const isBusy = isSearching || isPending || syncStatus === 'syncing';

  return (
    <div>
      <p className="text-[12px] font-semibold text-[#0f172a] mb-2">Search by Organization Name</p>
      <p className="text-[11px] text-[#64748b] mb-3">
        Search the ProPublica Nonprofit Explorer database — covers 1.8M+ IRS-registered nonprofits.
        Select your organization, then click Sync.
      </p>

      <div ref={containerRef} className="relative">
        {/* Input */}
        <div className="relative flex items-center">
          <div className="absolute left-3 flex items-center pointer-events-none">
            {isSearching
              ? <Loader2 className="w-4 h-4 text-[#94a3b8] animate-spin" />
              : <Search className="w-4 h-4 text-[#94a3b8]" />
            }
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInput}
            onFocus={() => { if (results.length > 0) setIsOpen(true); }}
            placeholder="e.g. Chicago Youth Centers…"
            className="w-full pl-9 pr-8 py-2.5 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all bg-white"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-3 text-[#94a3b8] hover:text-[#475569] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {isOpen && results.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e2e8f0] rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <p className="text-[11px] text-[#94a3b8]">{results.length} results · click to select</p>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#f8fafc]">
              {results.map((org) => (
                <button
                  key={org.ein}
                  onClick={() => handleSelect(org)}
                  className="w-full text-left px-4 py-3 hover:bg-[#f0fdfa] transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#0f172a] group-hover:text-[#0d9488] transition-colors truncate">
                        {org.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {org.city && (
                          <span className="flex items-center gap-1 text-[11px] text-[#64748b]">
                            <MapPin className="w-3 h-3" />
                            {org.city}, {org.state}
                          </span>
                        )}
                        {org.ntee_code && (
                          <span className="flex items-center gap-1 text-[11px] text-[#64748b]">
                            <FileText className="w-3 h-3" />
                            {nteeLabel(org.ntee_code)}
                          </span>
                        )}
                        {org.revenue_amount > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-[#64748b]">
                            <DollarSign className="w-3 h-3" />
                            {formatCurrency(org.revenue_amount)} revenue
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-[#94a3b8] flex-shrink-0 mt-0.5">
                      EIN {org.ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selected org card + sync button */}
      {selected && (
        <div className="mt-3 p-4 bg-[#f0fdfa] border border-[#99f6e4] rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#0d9488] flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#0f172a] truncate">{selected.name}</p>
                <p className="text-[11px] text-[#64748b] mt-0.5">
                  EIN {selected.ein.replace(/(\d{2})(\d{7})/, '$1-$2')} ·{' '}
                  {selected.city}, {selected.state}
                  {selected.ntee_code ? ` · ${nteeLabel(selected.ntee_code)}` : ''}
                </p>
                {selected.revenue_amount > 0 && (
                  <p className="text-[11px] text-[#0d9488] font-medium mt-0.5">
                    {formatCurrency(selected.revenue_amount)} reported revenue
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={isBusy}
              className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-lg text-[13px] font-semibold hover:bg-[#0f766e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex-shrink-0"
            >
              {syncStatus === 'syncing'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing…</>
                : <><FileText className="w-3.5 h-3.5" /> Sync 990</>
              }
            </button>
          </div>

          {/* Status messages */}
          {syncStatus === 'done' && (
            <div className="flex items-center gap-2 mt-3 text-[12px] text-[#16a34a] font-medium">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {syncMessage}
            </div>
          )}
          {syncStatus === 'error' && (
            <div className="flex items-start gap-2 mt-3 text-[12px] text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{syncMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {isOpen === false && query.trim().length >= 2 && !isSearching && !selected && results.length === 0 && (
        <p className="mt-2 text-[12px] text-[#94a3b8]">
          No results for &ldquo;{query}&rdquo; — try a shorter name or check spelling.
        </p>
      )}
    </div>
  );
}
