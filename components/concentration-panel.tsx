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

// Severity reads from the row's 3px LEFT BORDER + uppercase tag, never as a
// full-fill card. Drops the harsh maroon for elevated; uses the desaturated
// semantic ramp.
const SEVERITY_STYLE: Record<ConcentrationRiskFlag['severity'], { borderCls: string; tagCls: string; label: string }> = {
  critical: { borderCls: 'border-l-critical', tagCls: 'text-critical', label: 'Critical' },
  elevated: { borderCls: 'border-l-warning',  tagCls: 'text-warning',  label: 'Elevated' },
  moderate: { borderCls: 'border-l-info',     tagCls: 'text-info',     label: 'Moderate' },
};

// One accent + neutrals across the funding-mix stacked bar. The government
// share previously carried the most-saturated color — flipped: accent reads
// for the org's largest controllable source (private), and ink steps fill
// out the rest so the bar reads as a precision instrument, not a heatmap.
const STREAM_LABELS: Record<keyof Omit<ConcentrationSnapshot['revenue_breakdown'], 'total_revenue'>, { label: string; color: string }> = {
  govt_grants_pct:     { label: 'Government', color: 'var(--ink-500)' },
  private_grants_pct:  { label: 'Private',    color: 'var(--accent)'  },
  program_revenue_pct: { label: 'Program',    color: 'var(--ink-300)' },
  other_pct:           { label: 'Other',      color: 'var(--ink-200)' },
};

export function ConcentrationPanel({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-sm border border-hairline bg-surface p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-eyebrow uppercase text-secondary mb-1">Funding concentration</div>
          <p className="text-body text-muted">
            No concentration snapshot yet. Run the analysis to see your government dependency and risk flags.
          </p>
        </div>
        <span className="font-mono text-caption text-tertiary">
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
  const hhi   = Math.round(snapshot.concentration_index * 100);

  // Concentration band label — same buckets, quieter copy.
  const band = snapshot.concentration_index >= 0.50 ? 'concentrated'
             : snapshot.concentration_index >= 0.30 ? 'moderate'
                                                    : 'diversified';

  return (
    <div className="rounded-sm border border-hairline bg-surface p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-eyebrow uppercase text-secondary mb-1">
            Funding concentration
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-kpi text-primary">{hhi}</span>
            <span className="font-mono text-caption text-tertiary">/ 100</span>
            <span className="text-caption text-secondary ml-1">· {band}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-caption">
          {flags.length === 0
            ? <span className="inline-flex items-center gap-1 text-success"><ShieldCheck className="w-3.5 h-3.5" /> No flags</span>
            : <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="w-3.5 h-3.5" /> {flags.length} flag{flags.length === 1 ? '' : 's'}</span>}
        </div>
      </div>

      {/* Precision HHI scale — thin baseline + a single tick at the value.
          Anchors 0 / 30 / 50 / 100 so the band thresholds read at a glance. */}
      <div>
        <div className="relative h-2">
          <div className="absolute inset-y-0 left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-hairline" />
          {/* Thresholds */}
          <div className="absolute top-1/2 left-[30%] -translate-y-1/2 w-px h-2 bg-hairline" />
          <div className="absolute top-1/2 left-[50%] -translate-y-1/2 w-px h-2 bg-hairline" />
          {/* HHI marker */}
          <div
            aria-label={`HHI ${hhi}/100`}
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-accent"
            style={{ left: `calc(${Math.max(0, Math.min(100, hhi))}% - 1px)` }}
          />
        </div>
        <div className="flex justify-between font-mono text-eyebrow text-tertiary mt-1.5">
          <span>0</span>
          <span style={{ marginLeft: '30%' }}>30</span>
          <span style={{ marginLeft: '20%' }}>50</span>
          <span style={{ marginLeft: 'auto' }}>100</span>
        </div>
      </div>

      {/* Stacked funding-mix bar — thin baseline, no gradient/shadow */}
      <div>
        <div className="flex h-2 overflow-hidden bg-elevated">
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {segments.map(({ key, pct }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STREAM_LABELS[key].color }} />
              <span className="text-caption text-secondary">
                {STREAM_LABELS[key].label}{' '}
                <span className="font-mono text-primary tabular-nums">{Math.round(pct * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk flags — severity reads only as a 3px left border + uppercase tag.
          No fill, no border around the whole row. Operations-console pattern. */}
      {flags.length > 0 && (
        <ul className="space-y-2 pt-3 border-t border-hairline">
          {flags.map((f, i) => {
            const s = SEVERITY_STYLE[f.severity];
            return (
              <li key={i} className={`flex items-start gap-3 pl-3 border-l-[3px] ${s.borderCls}`}>
                <span className={`text-eyebrow font-semibold uppercase tracking-wider shrink-0 mt-0.5 ${s.tagCls}`}>
                  {s.label}
                </span>
                <div className="min-w-0">
                  <div className="text-body-strong text-primary">{f.metric}</div>
                  <div className="text-caption text-secondary mt-0.5">{f.remediation}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {flags.length === 0 && (
        <p className="text-caption text-secondary pt-3 border-t border-hairline">
          Diversification within healthy bands. Re-run after the next 990 or self-reported financial update.
        </p>
      )}
    </div>
  );
}

// Re-export for places that just need the icon set without the component.
export { ExternalLink as ConcentrationPanelLinkIcon };
