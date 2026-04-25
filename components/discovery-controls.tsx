'use client';
import { useState, useTransition } from 'react';
import { runDiscovery } from '@/actions/discovery';
import { Search, Play, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface DiscoveryResult {
  discovered: number;
  newGrants: number;
  highMatches: number;
  mediumMatches: number;
  errors: string[];
}

export function DiscoveryControls({ onComplete }: { onComplete?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [keyword, setKeyword] = useState('youth afterschool');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['ED', 'HL']);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const categories = [
    { code: 'ED', label: 'Education' },
    { code: 'HL', label: 'Health' },
    { code: 'IS', label: 'Income Security' },
    { code: 'CD', label: 'Community Dev' },
  ];

  function toggleCategory(code: string) {
    setSelectedCategories(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  function handleRun() {
    setStatus('running');
    setResult(null);
    startTransition(async () => {
      try {
        const res = await runDiscovery({ keyword: keyword || 'youth afterschool', rows: 25 });
        setResult(res);
        setStatus(res.errors.length > 0 ? 'error' : 'done');
        onComplete?.();
      } catch (e) {
        setStatus('error');
        setResult({ discovered: 0, newGrants: 0, highMatches: 0, mediumMatches: 0, errors: [String(e)] });
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e8f0]">
        <h2 className="font-semibold text-[#0f172a] text-[15px]">Run Discovery</h2>
        <p className="text-[12px] text-[#64748b] mt-0.5">Search Grants.gov and score results</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Keyword */}
        <div>
          <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
            Keyword
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. afterschool youth workforce"
              className="w-full pl-9 pr-4 py-2 border border-[#e2e8f0] rounded-[6px] text-[13px] text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
            />
          </div>
        </div>

        {/* Categories */}
        <div>
          <label className="block text-[12px] font-semibold text-[#475569] mb-1.5 uppercase tracking-wide">
            Funding Categories
          </label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(cat => (
              <button
                key={cat.code}
                onClick={() => toggleCategory(cat.code)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors border ${
                  selectedCategories.includes(cat.code)
                    ? 'bg-[#0d9488] text-white border-[#0d9488]'
                    : 'bg-white text-[#64748b] border-[#e2e8f0] hover:border-[#0d9488] hover:text-[#0d9488]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d9488] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
            : <><Play className="w-3.5 h-3.5" /> Run Discovery</>}
        </button>

        {/* Result */}
        {status === 'done' && result && (
          <div className="p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[6px]">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-[#16a34a]" />
              <span className="font-semibold text-[#15803d] text-[13px]">Discovery Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Found', value: result.discovered },
                { label: 'New', value: result.newGrants },
                { label: 'High matches', value: result.highMatches },
                { label: 'Medium matches', value: result.mediumMatches },
              ].map(s => (
                <div key={s.label} className="bg-white rounded border border-[#bbf7d0] px-3 py-2">
                  <div className="text-[18px] font-bold text-[#15803d]">{s.value}</div>
                  <div className="text-[11px] text-[#64748b]">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result?.errors && result.errors.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-[6px]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[12px] font-semibold text-red-700">Warnings</span>
            </div>
            {result.errors.slice(0, 3).map((e, i) => (
              <p key={i} className="text-[12px] text-red-600">• {e}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
