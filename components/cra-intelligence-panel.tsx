/**
 * <CraIntelligencePanel> — Workstream A surface.
 *
 * Renders the bank prospects + existing relationships derived from the
 * Phase 4 CRA layer + the Phase 7 org_funder_relationships table. Each
 * row is one bank whose CRA assessment area covers the org's primary
 * tract. Existing relationships render with a "Deepen" verb; prospects
 * with a peer-funding signal render with "Open"; cold prospects render
 * with "Monitor" and are de-emphasized.
 *
 * Reframe discipline: we never say "legally obligated to invest in your
 * neighborhood." CRA obligation runs to the bank's whole assessment
 * area, not to any one nonprofit. We say "AA covers your tract" and
 * "credible peer-anchored ask" — which is the honest framing per the
 * project brief.
 *
 * No Claude calls. No client-side fetches. Pure render of the helper's
 * output. Server component.
 */

import Link from 'next/link';
import {
  Landmark, ArrowUpRight, ShieldCheck, ExternalLink, Sparkles,
  Eye, AlertCircle,
} from 'lucide-react';
import type { BankIntelligenceRow, SuggestedAction } from '@/lib/cra/intelligence';

interface Props {
  rows:           BankIntelligenceRow[];
  /** Org's tract community label, surfaced in the empty-state copy. */
  community?:     string | null;
}

const ACTION_STYLE: Record<SuggestedAction, { label: string; cls: string; icon: typeof Sparkles }> = {
  deepen:  { label: 'Deepen',  cls: 'bg-signal-pursue-soft text-signal-pursue ring-signal-pursue/20', icon: ShieldCheck },
  open:    { label: 'Open',    cls: 'bg-action-soft        text-action       ring-action/20',         icon: Sparkles    },
  monitor: { label: 'Monitor', cls: 'bg-canvas-2           text-ink-2        ring-canvas-3',          icon: Eye         },
};

const RELATIONSHIP_LABEL: Record<BankIntelligenceRow['relationship'], string> = {
  existing:  'Existing',
  prospect:  'Prospect',
  declined:  'Declined',
  dormant:   'Dormant',
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function CraIntelligencePanel({ rows, community }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-canvas-1 rounded-lg shadow-flat p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-action-soft text-action">
            <Landmark className="w-3.5 h-3.5" />
          </div>
          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">
            CRA bank intelligence
          </p>
        </div>
        <p className="text-body text-ink-1 mt-1">
          No CRA bank funders detected for your tract. If your primary address has
          changed, confirm it in <Link href="/settings" className="text-action hover:text-action-hover underline font-medium">Settings</Link> and re-run the CRA refresh.
        </p>
      </div>
    );
  }

  const prospectsWithSignal = rows.filter(r => r.relationship === 'prospect' && r.peer_signal_count > 0).length;
  const existingCount       = rows.filter(r => r.relationship === 'existing').length;
  const totalPeerFunding    = rows.reduce((s, r) => s + r.peer_total_amount, 0);

  return (
    <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-canvas-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <div className="w-6 h-6 rounded-sm flex items-center justify-center bg-action-soft text-action shrink-0 mt-0.5">
              <Landmark className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">
                CRA bank intelligence
              </p>
              <p className="text-h2 font-semibold text-ink-0 mt-0.5">
                {rows.length} bank{rows.length === 1 ? '' : 's'} with CRA reach into your {community ?? 'service area'}
              </p>
            </div>
          </div>
        </div>

        {/* Inline metric strip — same label:value rhythm as the rest of the dashboard */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 mt-3 text-caption text-ink-2">
          <span>
            Existing
            <strong className="text-body font-semibold text-ink-0 tabular-nums ml-1">{existingCount}</strong>
          </span>
          <span>
            Warm prospects
            <strong className="text-body font-semibold text-signal-pursue tabular-nums ml-1">{prospectsWithSignal}</strong>
            <span className="text-eyebrow ml-1">· peer-funded</span>
          </span>
          {totalPeerFunding > 0 && (
            <span>
              Peer funding scanned
              <strong className="text-body font-semibold text-ink-0 tabular-nums ml-1">{fmtMoney(totalPeerFunding)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* ── Rows ───────────────────────────────────────────────── */}
      <ul className="divide-y divide-canvas-3">
        {rows.map(row => (
          <BankRow key={row.funder_id} row={row} />
        ))}
      </ul>

      {/* ── Footer disclaimer (the reframe) ───────────────────── */}
      <div className="px-5 py-3 border-t border-canvas-3 text-caption text-ink-2 leading-relaxed">
        CRA obligations run to a bank&apos;s whole assessment area, not to any one nonprofit. Rows here are
        ranked, justified prospects — not owed funding. Confidence-{'<'}50% rows are hidden.
      </div>
    </div>
  );
}

// ── One bank row ────────────────────────────────────────────────────────────

function BankRow({ row }: { row: BankIntelligenceRow }) {
  const actionMeta = ACTION_STYLE[row.action];
  const ActionIcon = actionMeta.icon;
  const detailsId  = `cra-bank-${row.funder_id}`;
  // Show the row at-rest with the action + rationale; full peer breakdown +
  // evidence links live inside the <details> expander.
  return (
    <li>
      <details className="group">
        <summary className="px-5 py-4 cursor-pointer list-none hover:bg-canvas-2/40 transition-colors">
          <div className="flex items-start gap-3">
            {/* Left: bank name + status badges */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-body font-semibold text-ink-0">{row.bank_name}</h3>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-eyebrow font-semibold uppercase tracking-wider ring-1 ${actionMeta.cls}`}>
                  <ActionIcon className="w-3 h-3" />
                  {actionMeta.label}
                </span>
                <span className="text-eyebrow font-semibold uppercase tracking-wider text-ink-2">
                  {RELATIONSHIP_LABEL[row.relationship]}
                </span>
                {!row.ein_verified && (
                  <span
                    className="inline-flex items-center gap-1 text-eyebrow font-medium text-signal-maybe"
                    title="EIN not yet verified against an authoritative source. Cross-source matching disabled for this row until confirmed."
                  >
                    <AlertCircle className="w-3 h-3" />
                    EIN verification pending
                  </span>
                )}
              </div>
              <p className="text-caption text-ink-1 leading-snug">{row.rationale}</p>

              {/* Quick peer-signal chips inline (collapsed view) */}
              {row.peer_signal_count > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {row.peer_signal.slice(0, 3).map(p => (
                    <span
                      key={p.recipient_id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-signal-pursue-soft text-signal-pursue text-eyebrow font-medium"
                    >
                      {p.name} <span className="opacity-70">· {fmtMoney(p.total_amount)}</span>
                    </span>
                  ))}
                  {row.peer_signal_count > 3 && (
                    <span className="text-eyebrow text-ink-2">+{row.peer_signal_count - 3} more</span>
                  )}
                </div>
              )}
            </div>

            {/* Right: confidence + expand affordance */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-eyebrow text-ink-2">
                Confidence <strong className="text-ink-0 tabular-nums ml-0.5">{Math.round(row.confidence * 100)}</strong>
              </span>
              <ArrowUpRight
                className="w-3.5 h-3.5 text-ink-2 transition-transform group-open:rotate-90"
                aria-label="Expand row"
              />
            </div>
          </div>
        </summary>

        {/* Expanded panel: full peer-edge table + evidence links + notes */}
        <div id={detailsId} className="px-5 pb-5 -mt-1 space-y-3">
          {row.peer_signal_count > 0 && (
            <div>
              <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-2">
                Disclosed funding to your peers
              </p>
              <ul className="divide-y divide-canvas-3 ring-1 ring-canvas-3 rounded-md">
                {row.peer_signal.map(p => (
                  <li key={p.recipient_id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-body text-ink-0 font-medium truncate">{p.name}</p>
                      <p className="text-eyebrow text-ink-2">
                        FY {p.most_recent_year}
                        {p.ein && <> · EIN {p.ein}</>}
                        <> · confidence {Math.round(p.max_confidence * 100)}%</>
                      </p>
                    </div>
                    <span className="text-body font-semibold text-ink-0 tabular-nums shrink-0">
                      {fmtMoney(p.total_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {row.notes && (
            <div>
              <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1">
                Internal note
              </p>
              <p className="text-body text-ink-1">{row.notes}</p>
            </div>
          )}

          <div>
            <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1">
              Evidence
            </p>
            <ul className="flex flex-col gap-1.5">
              {row.evidence_links.map(l => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-body text-action hover:text-action-hover font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </li>
  );
}
