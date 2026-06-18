/**
 * <FunderIntelligencePanel> — Workstream B8 surface.
 *
 * Ranked prospect list: funders most likely to fund the org based on
 * peer-overlap signal (B5 prospect_score). Each row expands to show the
 * cited brief (when generated) + peer-funding rollup + status track.
 *
 * Visual rhythm mirrors CRA + Concentration panels: eyebrow + h2 stat +
 * banded list with status chips + expandable detail. Server component;
 * brief load is server-side via the parent page.
 */

import { Compass, FileText, AlertCircle, ExternalLink, TrendingUp, Sparkles, ChevronDown } from 'lucide-react';
import type { FunderIntelRow } from '@/lib/funder-intel/repo';

interface BriefShape {
  sections?: {
    background?:               string;
    who_they_fund_like_you?:   string;
    typical_grant_size?:       string;
    cadence?:                  string;
    entry_point?:              string;
    red_flags?:                string;
    suggested_ask_range?:      string;
  };
  citations?: Array<{ id: number; grants_made_id: string; label: string; source_url: string }>;
  todo_count?: number;
}

interface Props {
  rows: FunderIntelRow[];
  org_name: string;
}

// Type narrower for the unknown brief jsonb the repo returns. Any field
// can be absent; defensive at render time.
function asBrief(b: unknown): BriefShape | null {
  return (b && typeof b === 'object') ? b as BriefShape : null;
}

// Section labels + ordering used inside the expanded brief.
const BRIEF_SECTIONS: Array<{ key: keyof Required<BriefShape>['sections']; label: string }> = [
  { key: 'background',             label: 'Background' },
  { key: 'who_they_fund_like_you', label: 'Peers they fund' },
  { key: 'typical_grant_size',     label: 'Typical grant size' },
  { key: 'cadence',                label: 'Cadence' },
  { key: 'entry_point',            label: 'Entry point' },
  { key: 'suggested_ask_range',    label: 'Suggested ask range' },
  { key: 'red_flags',              label: 'Red flags' },
];

const CITE_RE = /\{\{cite:(\d+)\}\}/g;
const TODO_RE = /(\[TODO:[^\]]*\])/g;

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtScore(n: number): string {
  return Math.round(n * 100).toString();
}

function scoreCls(s: number): string {
  if (s >= 0.65) return 'text-signal-pursue';
  if (s >= 0.40) return 'text-signal-maybe';
  return 'text-ink-2';
}

const FUNDER_TYPE_LABEL: Record<string, string> = {
  private_foundation:   'Foundation',
  community_foundation: 'Comm. foundation',
  corporate:            'Corporate',
  bank:                 'Bank',
  federal_agency:       'Federal',
  state_local:          'State/Local',
};

// Render section text: {{cite:N}} → superscript chip, [TODO: ...] → warning chip.
function renderSection(text: string, citations: BriefShape['citations']): React.ReactNode {
  const citeById = new Map((citations ?? []).map(c => [c.id, c]));
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TODO_RE.lastIndex = 0;
  while ((m = TODO_RE.exec(text)) !== null) {
    if (m.index > last) out.push(...renderWithCites(text.slice(last, m.index), citeById));
    out.push(
      <span
        key={`todo-${m.index}`}
        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-sm text-eyebrow font-semibold uppercase tracking-wider bg-signal-skip-soft text-signal-skip"
        title="Claude couldn't ground this claim. Confirm before sharing externally."
      >
        <AlertCircle className="w-3 h-3" />
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderWithCites(text.slice(last), citeById));
  return out;
}

function renderWithCites(segment: string, citeById: Map<number, NonNullable<BriefShape['citations']>[number]>): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITE_RE.lastIndex = 0;
  while ((m = CITE_RE.exec(segment)) !== null) {
    if (m.index > last) out.push(segment.slice(last, m.index));
    const id = Number(m[1]);
    const cite = citeById.get(id);
    out.push(
      cite ? (
        <a
          key={`cite-${m.index}`}
          href={cite.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-baseline align-super mx-0.5 px-1.5 rounded-sm text-eyebrow font-semibold tabular-nums bg-action-soft text-action no-underline hover:bg-action hover:text-canvas-1 transition-colors"
          title={cite.label}
        >
          {id}
        </a>
      ) : (
        <span key={`cite-${m.index}`} className="inline-flex items-baseline align-super mx-0.5 px-1.5 rounded-sm text-eyebrow font-semibold tabular-nums bg-canvas-2 text-ink-2">
          {id}
        </span>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < segment.length) out.push(segment.slice(last));
  return out;
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function FunderIntelligencePanel({ rows, org_name }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg shadow-flat p-4 bg-canvas-1 flex items-center justify-between gap-3">
        <div>
          <div className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1">
            Funder prospects
          </div>
          <p className="text-body text-ink-1">
            No prospect signals yet. Run the 990 ingest + scorer to surface funders who back peers like you.
          </p>
        </div>
        <span className="text-caption text-ink-2 font-mono">
          POST /api/admin/ingest-990-pilot → /score-funder-intel
        </span>
      </div>
    );
  }

  const withPeerSignal   = rows.filter(r => r.peer_overlap_count > 0).length;
  const totalDisclosed   = rows.reduce((s, r) => s + r.total_peer_amount, 0);
  const briefsAvailable  = rows.filter(r => r.has_brief).length;

  return (
    <div className="rounded-lg shadow-flat bg-canvas-1 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-canvas-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-sm bg-action-soft text-action flex items-center justify-center">
                <Compass className="w-3.5 h-3.5" />
              </div>
              <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">
                Funder prospects
              </p>
            </div>
            <p className="text-h2 font-semibold text-ink-0">
              {rows.length} funder{rows.length === 1 ? '' : 's'} backing peers like {org_name}
            </p>
            <p className="text-caption text-ink-2 mt-0.5">
              <strong className="text-signal-pursue">{withPeerSignal}</strong> with peer signal · {fmtMoney(totalDisclosed)} disclosed · {briefsAvailable} brief{briefsAvailable === 1 ? '' : 's'} ready
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-caption text-ink-2">
            <TrendingUp className="w-3.5 h-3.5 text-action" />
            Ranked by peer-anchored fit
          </div>
        </div>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-canvas-3">
        {rows.map(row => (
          <li key={row.funder_id}>
            <details className="group">
              <summary className="px-5 py-3.5 hover:bg-canvas-2/50 cursor-pointer list-none flex items-start gap-3">
                {/* Score */}
                <span className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-sm bg-canvas-2 text-body font-semibold tabular-nums ${scoreCls(row.prospect_score)}`}>
                  {fmtScore(row.prospect_score)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-body font-semibold text-ink-0 truncate">
                      {row.funder_name}
                    </span>
                    {row.funder_type && (
                      <span className="text-eyebrow text-ink-2 uppercase tracking-wider">
                        {FUNDER_TYPE_LABEL[row.funder_type] ?? row.funder_type}
                      </span>
                    )}
                    {row.tracked_status && (
                      <span className="inline-flex items-center text-eyebrow font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-action-soft text-action">
                        {row.tracked_status}
                      </span>
                    )}
                  </div>
                  {row.peer_overlap_count > 0 && (
                    <p className="text-caption text-ink-1 mt-0.5 flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3 text-signal-pursue shrink-0" />
                      {row.peer_overlap_count} peer{row.peer_overlap_count === 1 ? '' : 's'} funded · {fmtMoney(row.total_peer_amount)} disclosed
                      {row.most_recent_fy != null && <> · FY{row.most_recent_fy}</>}
                      {row.top_peers.length > 0 && (
                        <span className="text-ink-2 truncate"> · {row.top_peers.slice(0, 2).join(', ')}{row.top_peers.length > 2 ? ` +${row.top_peers.length - 2}` : ''}</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2 mt-0.5">
                  {row.has_brief ? (
                    <span className="inline-flex items-center gap-1 text-eyebrow font-semibold text-action">
                      <FileText className="w-3 h-3" /> Brief
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-eyebrow text-ink-2">
                      <Sparkles className="w-3 h-3" /> No brief
                    </span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-ink-2 transition-transform group-open:rotate-180" />
                </div>
              </summary>

              {/* Expanded detail — the brief + citations */}
              <BriefDetail
                funderId={row.funder_id}
                hasBrief={row.has_brief}
                brief={asBrief(row.brief)}
              />
            </details>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-canvas-3 bg-canvas-0">
        <p className="text-caption text-ink-2">
          Ranked by prospect score (peer-overlap × recency × region × size). Briefs cite real{' '}
          <code className="text-caption">grants_made</code>{' '}
          rows; unsupported claims are marked [TODO: ...] rather than fabricated.
        </p>
      </div>
    </div>
  );
}

// ── Inner brief renderer (extracted for narrower typing) ──────────────────

function BriefDetail({
  funderId, hasBrief, brief,
}: {
  funderId: string;
  hasBrief: boolean;
  brief:    BriefShape | null;
}) {
  return (
    <div className="px-5 pb-4 pl-[3.75rem] space-y-3 bg-canvas-0">
      {hasBrief && brief?.sections ? (
        <div className="space-y-3">
          {BRIEF_SECTIONS.map(s => {
            const text = brief.sections?.[s.key];
            if (!text) return null;
            return (
              <div key={s.key}>
                <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-body text-ink-0 leading-relaxed">
                  {renderSection(text, brief.citations)}
                </p>
              </div>
            );
          })}

          {brief.citations && brief.citations.length > 0 && (
            <div className="pt-2 mt-2 border-t border-canvas-3">
              <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1.5">Sources</p>
              <ol className="space-y-1">
                {brief.citations.map(c => (
                  <li key={c.id} id={`fbrief-source-${funderId}-${c.id}`} className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-sm bg-action-soft text-action text-eyebrow font-semibold tabular-nums">
                      {c.id}
                    </span>
                    <a
                      href={c.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-caption text-action hover:text-action-hover font-medium inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {c.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {brief.todo_count != null && brief.todo_count > 0 && (
            <p className="text-caption text-signal-maybe pt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {brief.todo_count} TODO marker{brief.todo_count === 1 ? '' : 's'} need review before sharing.
            </p>
          )}
        </div>
      ) : (
        <p className="text-caption text-ink-2">
          Brief not generated yet. Run{' '}
          <code className="bg-canvas-2 px-1 py-0.5 rounded-sm">POST /api/admin/generate-funder-brief</code>{' '}
          for this funder.
        </p>
      )}
    </div>
  );
}

