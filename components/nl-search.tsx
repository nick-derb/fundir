'use client';

/**
 * Natural-language grant search bar (Tier 2D).
 *
 * Replaces the "keyword + 4 category chips" controls UX with a single
 * freeform input. Drives /api/search end-to-end: parse -> embed ->
 * pgvector corpus retrieve -> structured post-filter -> ranked feed.
 *
 * Phase 1E: result list migrated onto the design system — every row
 * renders as a <GrantCard> with score/recommendation/evidence in the
 * primitives shipped in components/ui/.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Search, Sparkles, Loader2, X, Calendar,
  DollarSign, Tag, MapPin, AlertCircle, Landmark, Building2,
} from 'lucide-react';
import { GrantCard } from '@/components/ui/grant-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import type { EvidenceItem, FactorKey } from '@/components/ui/evidence-list';
import type { Recommendation } from '@/components/ui/recommendation-pill';

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

// Region/segment-neutral examples that demonstrate the input shapes the
// parser handles. Per the architecture rule we don't reference a specific
// city or program area here — the prompt is the same for every tenant.
const SUGGESTED = [
  'unrestricted operating grants under $250K closing in 60 days',
  'federal funding for nonprofits in our segment',
  'foundation grants for community programs',
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

function recommendationFor(compositeScore: number | null | undefined, similarity: number): Recommendation {
  // Prefer the stored composite score when present (it reflects all
  // factors). Fall back to similarity-only for fresh hits.
  const s = compositeScore != null ? compositeScore : similarity * 100;
  if (s >= 70) return 'pursue';
  if (s >= 50) return 'maybe';
  return 'skip';
}

/**
 * Parse the per-row "reason" string the search API returns into the
 * EvidenceItem shape the design-system list consumes. The reason is a
 * dot-separated chain like:
 *   "78% semantic · stored score 65 · 55% prior at HHS-ACF (n=12) · Rolling deadline · avg grant $80K"
 * Each fragment is classified into a FactorKey by simple substring match
 * so the dot color and the right-aligned factor tag render correctly.
 */
function parseEvidence(reason: string): EvidenceItem[] {
  if (!reason) return [];
  return reason.split('·').map(s => s.trim()).filter(Boolean).map(text => {
    const lower = text.toLowerCase();
    let factor: FactorKey;
    if      (lower.includes('semantic') || lower.includes('mission') || lower.includes('program'))   factor = 'semantic';
    else if (lower.includes('prior') || lower.includes('won') || lower.includes('rate'))             factor = 'historical';
    else if (lower.includes('peer') || lower.includes('funder') || lower.includes('foundation'))     factor = 'funder_affinity';
    else if (lower.includes('deadline') || lower.includes('avg grant') || lower.includes('award'))   factor = 'strategic';
    else if (lower.includes('990') || lower.includes('budget') || lower.includes('reserves'))        factor = 'financial_990';
    else if (lower.includes('eligible') || lower.includes('cra') || lower.includes('tract'))         factor = 'eligibility';
    else                                                                                              factor = 'semantic';
    return { text, factor };
  });
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
    <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
      {/* Search bar */}
      <div className="px-4 py-3 border-b border-canvas-3 flex items-center gap-2 bg-canvas-0">
        <Sparkles className="w-4 h-4 text-action flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runSearch(query); }}
          placeholder="Describe what you're looking for in plain English…"
          className="flex-1 bg-transparent text-body text-ink-0 placeholder:text-ink-3 outline-none"
        />
        {query && !loading && (
          <button
            onClick={clear}
            className="text-ink-3 hover:text-ink-1 transition-colors duration-fast"
            aria-label="Clear">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <Button
          size="sm"
          onClick={() => runSearch(query)}
          disabled={!query.trim() || loading}>
          {loading
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Searching</>
            : <><Search className="w-3 h-3" /> Search</>}
        </Button>
      </div>

      {/* Suggested prompts */}
      {!response && !loading && !error && (
        <div className="px-4 py-3 border-b border-canvas-3">
          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-2">Try</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); runSearch(s); }}
                className="text-caption text-ink-1 px-2.5 py-1 rounded-sm border border-canvas-3 hover:border-action hover:text-action transition-colors duration-fast">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Parsed chips */}
      {response && (
        <div className="px-4 py-2.5 border-b border-canvas-3 bg-canvas-0 flex flex-wrap gap-1.5 items-center text-caption">
          <span className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mr-1">Parsed</span>
          {response.parsed.program_areas?.map(p => (
            <span key={`p-${p}`} className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1 flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />{p}
            </span>
          ))}
          {response.parsed.funding_use?.map(u => (
            <span key={`u-${u}`} className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1">{u}</span>
          ))}
          {response.parsed.geographic_states.map(s => (
            <span key={`s-${s}`} className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1 flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" />{s}
            </span>
          ))}
          {response.parsed.max_award != null && (
            <span className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1 flex items-center gap-1">
              <DollarSign className="w-2.5 h-2.5" />≤ {money(response.parsed.max_award)}
            </span>
          )}
          {response.parsed.min_award != null && (
            <span className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1 flex items-center gap-1">
              <DollarSign className="w-2.5 h-2.5" />≥ {money(response.parsed.min_award)}
            </span>
          )}
          {response.parsed.deadline_days != null && (
            <span className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1 flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />≤ {response.parsed.deadline_days}d
            </span>
          )}
          {response.parsed.funder_types?.map(f => (
            <span key={`f-${f}`} className="px-2 py-0.5 rounded-sm bg-canvas-1 border border-canvas-3 text-ink-1">{f}</span>
          ))}

          {/* Source toggle pills — narrow to one funder type without
              re-typing the query. */}
          <span className="mx-1 text-canvas-3">·</span>
          {([
            { id: 'all',         label: 'All sources', Icon: Sparkles  },
            { id: 'grants_gov',  label: 'Federal',     Icon: Building2 },
            { id: 'foundation',  label: 'Foundations', Icon: Landmark  },
          ] as const).map(({ id, label, Icon }) => {
            const active = sourceFilter === id;
            return (
              <button
                key={id}
                onClick={() => setSourceFilter(id)}
                className={`px-2 py-0.5 rounded-sm flex items-center gap-1 border transition-colors duration-fast ${
                  active
                    ? 'bg-action text-canvas-1 border-action'
                    : 'bg-canvas-1 text-ink-1 border-canvas-3 hover:border-action hover:text-action'
                }`}>
                <Icon className="w-2.5 h-2.5" />{label}
              </button>
            );
          })}

          <span className="ml-auto text-caption text-ink-2">
            {response.results.filter(r => sourceFilter === 'all' || r.source === sourceFilter).length} of {response.candidates} candidates after filter
          </span>
        </div>
      )}

      {/* Results */}
      {error && (
        <div className="px-4 py-6 flex items-center gap-2 text-body text-alert bg-signal-skip-soft">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {response && response.results.length === 0 && !error && (
        <EmptyState
          variant="filtered-out"
          title="No grants pass these filters"
          body="The structured constraints (amount, deadline, geography) ruled everything out. Loosen one and try again."
        />
      )}

      {response && response.results.length > 0 && (
        <div className="p-4 grid gap-3">
          {response.results
            .filter(r => sourceFilter === 'all' || r.source === sourceFilter)
            .map(r => {
              const days = daysUntil(r.close_date);
              const award = r.extracted_fields.award_ceiling ?? r.extracted_fields.award_floor;
              const isFoundation = r.source === 'foundation';
              // Foundations have a synthetic id "foundation:<ein>" that is
              // not a route — link to the funder page instead of /grant/[id].
              const href = isFoundation ? '/foundations' : `/grant/${r.id}`;

              // Eyebrow: "UP TO $250K · FEDERAL · ALN 84.287" (federal)
              //          "UP TO $250K · FOUNDATION"            (foundation)
              const eyebrowParts: string[] = [];
              if (award != null) eyebrowParts.push(`Up to ${money(award)}`);
              eyebrowParts.push(isFoundation ? 'Foundation' : 'Federal');
              if (!isFoundation && r.aln_codes?.length) eyebrowParts.push(`ALN ${r.aln_codes[0]}`);

              return (
                <GrantCard
                  key={r.id}
                  href={href}
                  title={r.title}
                  funder={r.agency_name}
                  eyebrow={eyebrowParts.join(' · ')}
                  score={r.composite_score ?? r.similarity * 100}
                  recommendation={recommendationFor(r.composite_score, r.similarity)}
                  evidence={parseEvidence(r.reason)}
                  deadlineDays={days}
                  deadlineDate={r.close_date}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
