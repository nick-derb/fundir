/**
 * <DraftViewer> — Phase 6 cont E.
 *
 * Renders a generated draft. Each {{cite:N}} marker becomes a
 * superscript citation chip linking to the source list at the bottom.
 * [TODO: ...] markers render with a distinct warning style so the user
 * can scan for what still needs confirmation.
 *
 * Section bodies are read-only — content + citations are service-role
 * writes from the generator (see phase6cont_drafts.sql). The status
 * pill is a client island; members can move drafting → review → final
 * → discarded (gated by the matching RLS policy).
 */

import { FileText, Sparkles, AlertCircle, ExternalLink } from 'lucide-react';
import { DraftStatusControl } from './draft-status-control';

interface DraftSource {
  id:           number;
  source_type:  'profile' | 'financial' | 'document' | 'tract' | string;
  source_key:   string;
  quote:        string;
  location:     string;
}

export interface DraftRecord {
  id:                string;
  content: {
    background:        string;
    need:              string;
    approach:          string;
    capacity:          string;
    budget_narrative:  string;
    impact:            string;
  };
  source_citations:  DraftSource[];
  status:            'drafting' | 'review' | 'final' | 'discarded';
  tokens_used:       number | null;
  generated_at:      string;
}

interface DraftViewerProps {
  draft:   DraftRecord | null;
  /** Used to revalidate after a status change so the server-rendered
   *  page reflects the new state on next navigation. */
  grantId: string;
}

const SECTIONS: Array<{ key: keyof DraftRecord['content']; label: string; hint: string }> = [
  { key: 'background',       label: 'Background',         hint: 'Org grounding + mission alignment.' },
  { key: 'need',             label: 'Statement of Need',  hint: 'The community / population problem.' },
  { key: 'approach',         label: 'Approach',           hint: 'How the funded work would be delivered.' },
  { key: 'capacity',         label: 'Capacity',           hint: 'Staff, sites, accreditations, track record.' },
  { key: 'budget_narrative', label: 'Budget Narrative',   hint: 'Financial fit, reserves, payment structure.' },
  { key: 'impact',           label: 'Impact',             hint: 'Outcomes the org would deliver.' },
];

const SOURCE_TYPE_LABEL: Record<string, string> = {
  profile:   'Profile',
  financial: '990 / Audit',
  document:  'Document',
  tract:     'CRA Tract',
};

const CITE_RE = /\{\{cite:(\d+)\}\}/g;
const TODO_RE = /(\[TODO:[^\]]*\])/g;

function renderSection(text: string): React.ReactNode {
  // Split on TODO markers first so we can style them; for each
  // non-TODO segment, render with citation superscripts.
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TODO_RE.lastIndex = 0;
  while ((m = TODO_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(...renderWithCitations(text.slice(last, m.index)));
    }
    out.push(
      <span
        key={`todo-${m.index}`}
        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-sm text-eyebrow font-semibold uppercase tracking-wider bg-signal-skip-soft text-signal-skip"
        title="Claude couldn't ground this claim. Confirm with the org before submission."
      >
        <AlertCircle className="w-3 h-3" />
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(...renderWithCitations(text.slice(last)));
  }
  return out;
}

function renderWithCitations(segment: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITE_RE.lastIndex = 0;
  while ((m = CITE_RE.exec(segment)) !== null) {
    if (m.index > last) out.push(segment.slice(last, m.index));
    const id = m[1];
    out.push(
      <a
        key={`cite-${m.index}`}
        href={`#draft-source-${id}`}
        className="inline-flex items-baseline align-super mx-0.5 px-1.5 rounded-sm text-eyebrow font-semibold tabular-nums bg-action-soft text-action no-underline hover:bg-action hover:text-canvas-1 transition-colors"
        title="Jump to source"
      >
        {id}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < segment.length) out.push(segment.slice(last));
  return out;
}

export function DraftViewer({ draft, grantId }: DraftViewerProps) {
  if (!draft) {
    return (
      <div className="bg-canvas-1 rounded-lg shadow-flat p-6">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-action-soft text-action shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-h2 font-semibold text-ink-0">No draft yet</h3>
            <p className="text-body text-ink-1 mt-1 max-w-prose">
              Generate a ~70%-complete first draft anchored on this org&apos;s 990,
              self-reported profile, CRA tract, and any uploaded narratives.
              Every factual claim about the org cites a source; un-citable claims
              are flagged for you to confirm before submission.
            </p>
            <p className="text-caption text-ink-2 mt-3">
              Trigger:{' '}
              <code className="bg-canvas-2 px-1 py-0.5 rounded-sm text-caption">
                POST /api/admin/generate-draft &#123; org_code, grant_id &#125;
              </code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cited = new Set<number>();
  for (const v of Object.values(draft.content)) {
    let m: RegExpExecArray | null;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(v)) !== null) cited.add(Number(m[1]));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-action-soft text-action shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">
                Generated draft
              </p>
              <p className="text-h2 font-semibold text-ink-0 mt-0.5">
                {SECTIONS.length}-section first pass
              </p>
              <p className="text-caption text-ink-2 mt-0.5">
                Cites {cited.size} of {draft.source_citations.length} available sources
                {draft.tokens_used != null ? ` · ${draft.tokens_used.toLocaleString()} tokens used` : ''}
              </p>
            </div>
          </div>
          <DraftStatusControl
            draftId={draft.id}
            grantId={grantId}
            status={draft.status}
          />
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(s => (
        <section key={s.key} className="bg-canvas-1 rounded-lg shadow-flat p-5">
          <header className="mb-3">
            <h3 className="text-h2 font-semibold text-ink-0">{s.label}</h3>
            <p className="text-caption text-ink-2 mt-0.5">{s.hint}</p>
          </header>
          <div className="prose-draft text-body text-ink-0 whitespace-pre-wrap leading-relaxed">
            {renderSection(draft.content[s.key])}
          </div>
        </section>
      ))}

      {/* Source citations */}
      <section className="bg-canvas-1 rounded-lg shadow-flat p-5">
        <h3 className="text-h2 font-semibold text-ink-0 mb-3">Source citations</h3>
        <ol className="space-y-2">
          {draft.source_citations.map(s => (
            <li id={`draft-source-${s.id}`} key={s.id} className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-sm bg-action-soft text-action text-eyebrow font-semibold tabular-nums">
                {s.id}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-eyebrow font-semibold uppercase text-ink-2">
                    {SOURCE_TYPE_LABEL[s.source_type] ?? s.source_type}
                  </span>
                  <span className="text-caption text-ink-2">·</span>
                  <span className="text-caption text-ink-1">{s.location}</span>
                </div>
                <p className="text-body text-ink-0 mt-0.5">{s.quote}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="text-caption text-ink-2 flex items-center gap-1">
        <ExternalLink className="w-3 h-3" />
        <span>
          Draft is a starting point. Review every &#123;&#123;cite:N&#125;&#125; ref and resolve
          [TODO: ...] markers before submission.
        </span>
      </div>
    </div>
  );
}
