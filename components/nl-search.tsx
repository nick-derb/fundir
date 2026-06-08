'use client';

/**
 * Natural-language grant search bar (Tier 2D).
 *
 * Replaces the "keyword + 4 category chips" controls UX with a single
 * freeform input. Drives /api/search end-to-end: parse -> embed ->
 * pgvector corpus retrieve -> structured post-filter -> ranked feed.
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Search, Sparkles, Loader2, ArrowRight, X, Calendar,
  DollarSign, Tag, MapPin, AlertCircle, Landmark, Building2,
} from 'lucide-react';

interface SearchResult {
  id:               string;
  title:            string;
  agency_name:      string;
  agency_code:      string;
  aln_codes:        string[] | null;
  close_date:       string | null;
  similarity:       number;
  composite_score?: number | null;
  pipeline_stage?:  string | null;
  match_id?:        string | null;
  source:           'grants_gov' | 'foundation';
  reason:           string;
  extracted_fields: {
    award_floor?:   number | null;
    award_ceiling?: number | null;
    program_areas?: string[];
    geographic_scope?: string | null;
    geographic_states?: string[];
  };
}

interface Parsed {
  cleaned_query:     string;
  program_areas:     string[] | null;
  funding_use:       string[] | null;
  min_award:         number | null;
  max_award:         number | null;
  geographic_states: string[];
  deadline_days:     number | null;
  funder_types:      string[] | null;
}

interface SearchResponse {
  parsed:     Parsed;
  results:    SearchResult[];
  candidates: number;
  error?:     string;
}

const SUGGESTED = [
  'unrestricted operating grants for IL youth orgs under $250K closing in 60 days',
  'Head Start federal funding',
  'foundation grants for afterschool programs in Chicago',
  'capital project grants for nonprofit facilities',
];

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(close: string | null): number | null {
  if (!close) return null;
  const t = new Date(close).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

type SourceFilter = 'all' | 'grants_gov' | 'foundation';

export function NLSearch() {
  const [query,    setQuery]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function runSearch(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch('/api/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q, k: 25 }),
      });
      const json = (await res.json()) as SearchResponse;
      if (!res.ok) throw new Error(json.error || 'Search failed');
      setResponse(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setQuery('');
    setResponse(null);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Search bar */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center gap-2"
        style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}>
        <Sparkles className="w-4 h-4 text-[#0d9488] flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runSearch(query); }}
          placeholder="Describe what you're looking for in plain English…"
          className="flex-1 bg-transparent text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
        />
        {query && !loading && (
          <button onClick={clear} className="text-[#94a3b8] hover:text-[#475569]" aria-label="Clear">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => runSearch(query)}
          disabled={!query.trim() || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
          {loading
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Searching</>
            : <><Search className="w-3 h-3" /> Search</>}
        </button>
      </div>

      {/* Suggested prompts */}
      {!response && !loading && !error && (
        <div className="px-4 py-3 border-b border-[#f1f5f9]">
          <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">Try</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); runSearch(s); }}
                className="text-[11px] text-[#475569] px-2.5 py-1 rounded-full border border-[#e2e8f0] hover:border-[#0d9488] hover:text-[#0d9488] transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Parsed chips */}
      {response && (
        <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-[#fafbff] flex flex-wrap gap-1.5 items-center text-[10px]">
          <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mr-1">Parsed</span>
          {response.parsed.program_areas?.map(p => (
            <span key={`p-${p}`} className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569] flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />{p}
            </span>
          ))}
          {response.parsed.funding_use?.map(u => (
            <span key={`u-${u}`} className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569]">{u}</span>
          ))}
          {response.parsed.geographic_states.map(s => (
            <span key={`s-${s}`} className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569] flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" />{s}
            </span>
          ))}
          {response.parsed.max_award != null && (
            <span className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569] flex items-center gap-1">
              <DollarSign className="w-2.5 h-2.5" />≤ {money(response.parsed.max_award)}
            </span>
          )}
          {response.parsed.min_award != null && (
            <span className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569] flex items-center gap-1">
              <DollarSign className="w-2.5 h-2.5" />≥ {money(response.parsed.min_award)}
            </span>
          )}
          {response.parsed.deadline_days != null && (
            <span className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569] flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />≤ {response.parsed.deadline_days}d
            </span>
          )}
          {response.parsed.funder_types?.map(f => (
            <span key={`f-${f}`} className="px-2 py-0.5 rounded-full bg-white border border-[#e2e8f0] text-[#475569]">{f}</span>
          ))}
          {/* Source toggle pills — let the user narrow to one funder type
              without re-typing the whole query. */}
          <span className="mx-1 text-[#cbd5e1]">·</span>
          {([
            { id: 'all',         label: 'All sources',        Icon: Sparkles  },
            { id: 'grants_gov',  label: 'Federal',            Icon: Building2 },
            { id: 'foundation',  label: 'Foundations',        Icon: Landmark  },
          ] as const).map(({ id, label, Icon }) => {
            const active = sourceFilter === id;
            return (
              <button
                key={id}
                onClick={() => setSourceFilter(id)}
                className={`px-2 py-0.5 rounded-full flex items-center gap-1 border transition-colors ${
                  active
                    ? 'bg-[#0d9488] text-white border-[#0d9488]'
                    : 'bg-white text-[#475569] border-[#e2e8f0] hover:border-[#0d9488] hover:text-[#0d9488]'
                }`}
              >
                <Icon className="w-2.5 h-2.5" />{label}
              </button>
            );
          })}

          <span className="ml-auto text-[10px] text-[#94a3b8]">
            {response.results.filter(r => sourceFilter === 'all' || r.source === sourceFilter).length} of {response.candidates} candidates after filter
          </span>
        </div>
      )}

      {/* Results */}
      {error && (
        <div className="px-4 py-6 flex items-center gap-2 text-[12px] text-[#dc2626] bg-[#fef2f2]">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {response && response.results.length === 0 && !error && (
        <div className="px-4 py-8 text-center text-[12px] text-[#94a3b8]">
          No grants matched after structured filtering. Try loosening the constraints.
        </div>
      )}

      {response && response.results.length > 0 && (
        <ul className="divide-y divide-[#f1f5f9]">
          {response.results
            .filter(r => sourceFilter === 'all' || r.source === sourceFilter)
            .map(r => {
            const days = daysUntil(r.close_date);
            const urgent = days != null && days >= 0 && days <= 14;
            const award = r.extracted_fields.award_ceiling ?? r.extracted_fields.award_floor;
            const isFoundation = r.source === 'foundation';
            // Foundations have a synthetic id "foundation:<ein>" that is not
            // a route — link to the funder page instead of /grant/[id].
            const href = isFoundation ? '/foundations' : `/grant/${r.id}`;
            return (
              <li key={r.id} className="hover:bg-[#f8fafc] transition-colors">
                <Link href={href} className="block px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-1 ${
                          isFoundation
                            ? 'bg-[#faf5ff] text-[#7c3aed] border border-[#ddd6fe]'
                            : 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]'
                        }`}>
                          {isFoundation ? <Landmark className="w-2.5 h-2.5" /> : <Building2 className="w-2.5 h-2.5" />}
                          {isFoundation ? 'Foundation' : 'Federal'}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold text-[#0f172a] truncate">{r.title}</p>
                      <p className="text-[11px] text-[#64748b] truncate">{r.agency_name}{r.aln_codes?.length ? ` · ALN ${r.aln_codes[0]}` : ''}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {r.composite_score != null && (
                        <span className="text-[11px] font-bold text-white px-1.5 py-0.5 rounded"
                          style={{ background: r.composite_score >= 70 ? '#16a34a' : r.composite_score >= 40 ? '#d97706' : '#64748b' }}>
                          {Math.round(r.composite_score)}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-[#0d9488]">
                        {Math.round(r.similarity * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#64748b]">
                    {r.close_date && (
                      <span className={urgent ? 'text-[#dc2626] font-semibold flex items-center gap-1' : 'flex items-center gap-1'}>
                        <Calendar className="w-3 h-3" />
                        {days != null ? `${days}d` : new Date(r.close_date).toLocaleDateString()}
                      </span>
                    )}
                    {award != null && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />{money(award)}
                      </span>
                    )}
                    {r.pipeline_stage && r.pipeline_stage !== 'discovered' && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] text-[10px] uppercase tracking-wide font-semibold">
                        {r.pipeline_stage}
                      </span>
                    )}
                    <span className="ml-auto text-[#94a3b8]">{r.reason}</span>
                    <ArrowRight className="w-3 h-3 text-[#94a3b8]" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
