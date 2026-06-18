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
  Landmark, ArrowUpRight, ExternalLink, AlertCircle,
} from 'lucide-react';
import type { BankIntelligenceRow, SuggestedAction } from '@/lib/cra/intelligence';

interface Props {
  rows:           BankIntelligenceRow[];
  /** Org's tract community label, surfaced in the empty-state copy. */
  community?:     string | null;
}

// Quiet uppercase tags — text-only, no fill, color reads from token.
const ACTION_STYLE: Record<SuggestedAction, { label: string; cls: string }> = {
  deepen:  { label: 'Deepen',  cls: 'text-success' },
  open:    { label: 'Open',    cls: 'text-accent'  },
  monitor: { label: 'Monitor', cls: 'text-tertiary' },
};

const RELATIONSHIP_STYLE: Record<BankIntelligenceRow['relationship'], { label: string; cls: string }> = {
  existing: { label: 'Existing', cls: 'text-primary'   },
  prospect: { label: 'Prospect', cls: 'text-secondary' },
  declined: { label: 'Declined', cls: 'text-tertiary'  },
  dormant:  { label: 'Dormant',  cls: 'text-tertiary'  },
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function CraIntelligencePanel({ rows, community }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-hairline rounded-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-3.5 h-3.5 text-accent" />
          <p className="text-eyebrow uppercase text-secondary">CRA bank intelligence</p>
        </div>
        <p className="text-body text-muted mt-1">
          No CRA bank funders detected for your tract. If your primary address has
          changed, confirm it in <Link href="/settings" className="text-accent hover:text-accent-hover underline font-medium">Settings</Link> and re-run the CRA refresh.
        </p>
      </div>
    );
  }

  const prospectsWithSignal = rows.filter(r => r.relationship === 'prospect' && r.peer_signal_count > 0).length;
  const existingCount       = rows.filter(r => r.relationship === 'existing').length;
  const totalPeerFunding    = rows.reduce((s, r) => s + r.peer_total_amount, 0);

  return (
    <div className="bg-surface border border-hairline rounded-sm overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-hairline">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-3.5 h-3.5 text-accent" />
          <p className="text-eyebrow uppercase text-secondary">CRA bank intelligence</p>
        </div>
        <p className="text-h2 text-primary">
          <span className="font-mono tabular-nums">{rows.length}</span> bank{rows.length === 1 ? '' : 's'} with CRA reach into your {community ?? 'service area'}
        </p>

        {/* Inline metric strip — mono counts, label:value rhythm */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-3 text-caption text-secondary">
          <span>
            Existing
            <span className="font-mono text-body-strong text-primary tabular-nums ml-1.5">{existingCount}</span>
          </span>
          <span>
            Warm prospects
            <span className="font-mono text-body-strong text-success tabular-nums ml-1.5">{prospectsWithSignal}</span>
            <span className="text-eyebrow uppercase text-tertiary ml-1">· peer-funded</span>
          </span>
          {totalPeerFunding > 0 && (
            <span>
              Peer funding scanned
              <span className="font-mono text-body-strong text-primary tabular-nums ml-1.5">{fmtMoney(totalPeerFunding)}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Header row — sticky table-style column labels ──────── */}
      <div className="px-5 py-2 grid grid-cols-[1fr_auto_auto] gap-4 text-eyebrow uppercase text-tertiary border-b border-hairline bg-elevated/40">
        <span>Bank · relationship · action</span>
        <span className="w-24 text-right">Confidence</span>
        <span className="w-3" aria-hidden />
      </div>

      {/* ── Rows ───────────────────────────────────────────────── */}
      <ul className="divide-y divide-hairline">
        {rows.map(row => (
          <BankRow key={row.funder_id} row={row} />
        ))}
      </ul>

      {/* ── Footer disclaimer (the reframe) ───────────────────── */}
      <div className="px-5 py-3 border-t border-hairline text-caption text-tertiary leading-relaxed">
        CRA obligations run to a bank&apos;s whole assessment area, not to any one nonprofit.
        Rows here are ranked, justified prospects — not owed funding. Confidence-{'<'}50% rows are hidden.
      </div>
    </div>
  );
}

// ── One bank row — table-style ─────────────────────────────────────────────

function BankRow({ row }: { row: BankIntelligenceRow }) {
  const actionMeta = ACTION_STYLE[row.action];
  const relMeta    = RELATIONSHIP_STYLE[row.relationship];
  const confPct    = Math.round(row.confidence * 100);

  return (
    <li>
      <details className="group">
        <summary className="px-5 py-3 cursor-pointer list-none grid grid-cols-[1fr_auto_auto] gap-4 items-center row-hover transition-colors">
          {/* Left: bank name + relationship + action — quiet uppercase tags */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-0.5">
              <span className="text-body-strong text-primary truncate">{row.bank_name}</span>
              <span className={`text-eyebrow uppercase tracking-wider ${relMeta.cls}`}>
                {relMeta.label}
              </span>
              <span className="text-tertiary">·</span>
              <span className={`text-eyebrow uppercase tracking-wider ${actionMeta.cls}`}>
                {actionMeta.label}
              </span>
              {!row.ein_verified && (
                <span
                  className="inline-flex items-center gap-1 text-eyebrow uppercase text-warning"
                  title="EIN not yet verified against an authoritative source."
                >
                  <AlertCircle className="w-3 h-3" />
                  EIN pending
                </span>
              )}
            </div>
            <p className="text-caption text-secondary leading-snug">{row.rationale}</p>

            {/* Subtle peer-signal chips */}
            {row.peer_signal_count > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {row.peer_signal.slice(0, 3).map(p => (
                  <span key={p.recipient_id} className="inline-flex items-baseline gap-1 text-eyebrow text-secondary">
                    <span className="w-1 h-1 rounded-full bg-accent" aria-hidden />
                    {p.name}
                    <span className="font-mono text-tertiary tabular-nums">{fmtMoney(p.total_amount)}</span>
                  </span>
                ))}
                {row.peer_signal_count > 3 && (
                  <span className="text-eyebrow text-tertiary">+{row.peer_signal_count - 3} more</span>
                )}
              </div>
            )}
          </div>

          {/* Confidence: mono number + thin 4px track bar (per brief) */}
          <div className="w-24 flex flex-col items-end gap-1">
            <span className="font-mono text-body-strong text-primary tabular-nums">{confPct}</span>
            <div className="h-1 w-20 bg-elevated">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.max(0, Math.min(100, confPct))}%` }}
                aria-label={`Confidence ${confPct}%`}
              />
            </div>
          </div>

          {/* Expand affordance */}
          <ArrowUpRight
            className="w-3.5 h-3.5 text-tertiary transition-transform group-open:rotate-90"
            aria-label="Expand row"
          />
        </summary>

        {/* Expanded panel: peer-edge table + notes + evidence */}
        <div className="px-5 pb-5 -mt-1 space-y-4">
          {row.peer_signal_count > 0 && (
            <div>
              <p className="text-eyebrow uppercase text-tertiary mb-2">
                Disclosed funding to your peers
              </p>
              <ul className="border border-hairline divide-y divide-hairline">
                {row.peer_signal.map(p => (
                  <li key={p.recipient_id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-body text-primary font-medium truncate">{p.name}</p>
                      <p className="font-mono text-eyebrow text-tertiary tabular-nums">
                        FY {p.most_recent_year}
                        {p.ein && <> · EIN {p.ein}</>}
                        {' '}· confidence {Math.round(p.max_confidence * 100)}%
                      </p>
                    </div>
                    <span className="font-mono text-body-strong text-primary tabular-nums shrink-0">
                      {fmtMoney(p.total_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {row.notes && (
            <div>
              <p className="text-eyebrow uppercase text-tertiary mb-1">
                Internal note
              </p>
              <p className="text-body text-muted">{row.notes}</p>
            </div>
          )}

          <div>
            <p className="text-eyebrow uppercase text-tertiary mb-1">Evidence</p>
            <ul className="flex flex-col gap-1.5">
              {row.evidence_links.map(l => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-body text-accent hover:text-accent-hover font-medium transition-colors"
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
