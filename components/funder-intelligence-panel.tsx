/**
 * <FunderIntelligencePanel> — Workstream B8 surface.
 *
 * Ranked prospect list: funders most likely to fund the org based on
 * peer-overlap signal (B5 prospect_score). Each row renders the
 * <FunderProspectRow> client component, which owns its own open state and
 * expands to the full <FunderBrief> dossier (animated gauge, ask band,
 * peer ledger, warm path, risk callout, sources).
 *
 * This server component is responsible only for: header copy + summary
 * stats + the row list. All interaction lives in the row + dossier.
 */

import { Compass, TrendingUp } from 'lucide-react';
import type { FunderIntelRow } from '@/lib/funder-intel/repo';
import { FunderProspectRow } from './funder-brief';

interface Props {
  rows:     FunderIntelRow[];
  org_name: string;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function FunderIntelligencePanel({ rows, org_name }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-sm border border-hairline p-4 bg-surface flex items-center justify-between gap-3">
        <div>
          <div className="text-eyebrow uppercase text-secondary mb-1">Funder prospects</div>
          <p className="text-body text-muted">
            No prospect signals yet. Run the 990 ingest + scorer to surface funders who back peers like you.
          </p>
        </div>
        <span className="font-mono text-caption text-tertiary">
          POST /api/admin/ingest-990-pilot → /score-funder-intel
        </span>
      </div>
    );
  }

  const withPeerSignal  = rows.filter(r => r.peer_overlap_count > 0).length;
  const totalDisclosed  = rows.reduce((s, r) => s + r.total_peer_amount, 0);
  const briefsAvailable = rows.filter(r => r.has_brief).length;

  return (
    <div className="rounded-sm border border-hairline bg-surface overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-hairline">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Compass className="w-3.5 h-3.5 text-accent" />
              <p className="text-eyebrow uppercase text-secondary">Funder prospects</p>
            </div>
            <p className="text-h2 text-primary">
              <span className="font-mono tabular-nums">{rows.length}</span>{' '}
              funder{rows.length === 1 ? '' : 's'} backing peers like {org_name}
            </p>
            <p className="text-caption text-secondary mt-0.5">
              <span className="font-mono text-success tabular-nums">{withPeerSignal}</span>{' '}with peer signal ·{' '}
              <span className="font-mono text-primary tabular-nums">{fmtMoney(totalDisclosed)}</span>{' '}disclosed ·{' '}
              <span className="font-mono text-primary tabular-nums">{briefsAvailable}</span>{' '}brief{briefsAvailable === 1 ? '' : 's'} ready
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-caption text-secondary">
            <TrendingUp className="w-3.5 h-3.5 text-accent" />
            Ranked by peer-anchored fit
          </div>
        </div>
      </div>

      {/* ── Rows ────────────────────────────────────────────────── */}
      <div className="px-5 py-4 bg-page">
        <ul className="list-none p-0 m-0">
          {rows.map(row => (
            <FunderProspectRow key={row.funder_id} row={row} orgName={org_name} />
          ))}
        </ul>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-t border-hairline">
        <p className="text-caption text-tertiary">
          Ranked by prospect score (peer-overlap × recency × region × size). Briefs cite real{' '}
          <code className="font-mono">grants_made</code>{' '}rows; unsupported claims are kept in the data and hidden behind the Show unverified toggle.
        </p>
      </div>
    </div>
  );
}
