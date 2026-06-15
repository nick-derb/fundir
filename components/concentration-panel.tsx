/**
 * <ConcentrationPanel> — Phase 6 funding-concentration surface.
 *
 * Renders the latest concentration_snapshots row for an org:
 *   - Per-stream % breakdown (govt / private / program / other) as a
 *     four-segment stacked bar
 *   - Concentration index (HHI, normalized)
 *   - Risk flags + remediation hints — the actionable surface
 *
 * When the org has no snapshot yet (computed_at null), the panel is a
 * skinny empty-state with a CTA. When the latest snapshot has zero
 * flags, the panel collapses to a clean status line ("Diversification
 * healthy — 24% govt, 18% private, 35% program, 23% other").
 */

import { AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react';
import type {
  ConcentrationSnapshot, ConcentrationRiskFlag,
} from '@/lib/discovery/concentration';

interface Props {
  snapshot?: ConcentrationSnapshot | null;
}

const SEVERITY_STYLE: Record<ConcentrationRiskFlag['severity'], { text: string; bg: string; border: string; label: string }> = {
  critical: { text: '#7A1E2E', bg: '#F4E3E5', border: '#E7C4C9', label: 'Critical' },
  elevated: { text: '#9A6B00', bg: '#FBF1DC', border: '#EBD9B0', label: 'Elevated' },
  moderate: { text: '#3A3D44', bg: '#F2F1EC', border: '#E5E4DE', label: 'Moderate' },
};

const STREAM_LABELS: Record<keyof Omit<ConcentrationSnapshot['revenue_breakdown'], 'total_revenue'>, { label: string; color: string }> = {
  govt_grants_pct:    { label: 'Government',   color: '#7A1E2E' },
  private_grants_pct: { label: 'Private',      color: '#0A4D3C' },
  program_revenue_pct:{ label: 'Program',      color: '#0891b2' },
  other_pct:          { label: 'Other',        color: '#94a3b8' },
};

export function ConcentrationPanel({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-lg shadow-flat p-4 bg-canvas-1 flex items-center justify-between gap-3">
        <div>
          <div className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1">Funding concentration</div>
          <p className="text-body text-ink-1">
            No concentration snapshot yet. Run the analysis to see your government dependency and risk flags.
          </p>
        </div>
        <span className="text-caption text-ink-2">
          POST /api/admin/compute-concentration
        </span>
      </div>
    );
  }

  const b = snapshot.revenue_breakdown;
  const segments: Array<{ key: keyof typeof STREAM_LABELS; pct: number }> = [
    { key: 'govt_grants_pct',     pct: b.govt_grants_pct },
    { key: 'private_grants_pct',  pct: b.private_grants_pct },
    { key: 'program_revenue_pct', pct: b.program_revenue_pct },
    { key: 'other_pct',           pct: b.other_pct },
  ];
  const flags = snapshot.risk_flags ?? [];

  return (
    <div className="rounded-lg shadow-flat p-5 bg-canvas-1 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider mb-1">
            Funding concentration
          </div>
          <div className="text-h2 font-semibold text-ink-0">
            HHI {(snapshot.concentration_index * 100).toFixed(0)} / 100
            <span className="text-body font-normal text-ink-2 ml-2">
              ({snapshot.concentration_index >= 0.50 ? 'concentrated' :
                 snapshot.concentration_index >= 0.30 ? 'moderate'    : 'diversified'})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-caption text-ink-2">
          {flags.length === 0
            ? <><ShieldCheck className="w-3.5 h-3.5 text-signal-pursue" /> No flags</>
            : <><AlertTriangle className="w-3.5 h-3.5 text-signal-skip" /> {flags.length} flag{flags.length === 1 ? '' : 's'}</>}
        </div>
      </div>

      {/* Stacked bar */}
      <div>
        <div className="flex h-2.5 rounded-sm overflow-hidden bg-canvas-3">
          {segments.map(({ key, pct }) => (
            pct > 0 ? (
              <div
                key={key}
                aria-label={`${STREAM_LABELS[key].label}: ${(pct * 100).toFixed(0)}%`}
                style={{ width: `${pct * 100}%`, backgroundColor: STREAM_LABELS[key].color }}
              />
            ) : null
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-2">
          {segments.map(({ key, pct }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: STREAM_LABELS[key].color }} />
              <span className="text-caption text-ink-1">
                {STREAM_LABELS[key].label}{' '}
                <strong className="text-ink-0 tabular-nums">{Math.round(pct * 100)}%</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk flags */}
      {flags.length > 0 && (
        <ul className="space-y-2 pt-2 border-t border-canvas-3">
          {flags.map((f, i) => {
            const s = SEVERITY_STYLE[f.severity];
            return (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="text-eyebrow font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm border shrink-0 mt-0.5"
                  style={{ color: s.text, background: s.bg, borderColor: s.border }}
                >
                  {s.label}
                </span>
                <div className="min-w-0">
                  <div className="text-body font-semibold text-ink-0">{f.metric}</div>
                  <div className="text-caption text-ink-1 mt-0.5">{f.remediation}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {flags.length === 0 && (
        <p className="text-caption text-ink-2 pt-2 border-t border-canvas-3">
          Diversification within healthy bands. Re-run after the next 990 or self-reported financial update.
        </p>
      )}
    </div>
  );
}

// Re-export for places that just need the icon set without the component.
export { ExternalLink as ConcentrationPanelLinkIcon };
