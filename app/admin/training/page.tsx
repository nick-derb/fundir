import { getAuthContext } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase';
import { FEATURE_SPEC_VERSION } from '@/lib/training/feature-export';
import { fetchFunderWinRateSummary } from '@/lib/funder-win-rates';
import { TrainingActions } from '@/components/admin/training-actions';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Guideline: a learned win-probability model isn't worth training until there's
// a meaningful, two-class label set. Below this, the transparent heuristic stays
// the source of truth (see docs/model-development-plan.md §4-5).
const MIN_LABELS = 40;

export default async function TrainingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isAdmin) redirect('/dashboard');

  const db = createServerClient();
  const [snapsRes, examplesRes] = await Promise.all([
    db.from('training_snapshots')
      .select('id, taken_at, row_count', { count: 'exact' })
      .eq('org_id', ctx.orgId)
      .order('taken_at', { ascending: false })
      .limit(1),
    db.from('training_examples')
      .select('label')
      .eq('org_id', ctx.orgId)
      .eq('feature_spec_version', FEATURE_SPEC_VERSION),
  ]);

  const track = await fetchFunderWinRateSummary(ctx.orgId);

  const ex = examplesRes.data ?? [];
  const awarded = ex.filter(e => e.label === 'awarded').length;
  const rejected = ex.filter(e => e.label === 'rejected').length;
  const total = ex.length;
  const snapCount = snapsRes.count ?? 0;
  const latestSnap = snapsRes.data?.[0] ?? null;

  const bothClasses = awarded > 0 && rejected > 0;
  const ready = total >= MIN_LABELS && bothClasses;
  const pct = Math.min(100, Math.round((total / MIN_LABELS) * 100));

  const card: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
    background: 'rgba(255,255,255,0.02)', padding: '18px 20px',
  };
  const stat: React.CSSProperties = { ...card, flex: 1, minWidth: 150 };
  const statNum: React.CSSProperties = { fontSize: 28, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 };
  const statLbl: React.CSSProperties = { fontSize: 11, color: '#64748b', marginTop: 7, letterSpacing: '0.04em', textTransform: 'uppercase' };

  return (
    <div style={{ padding: '32px 36px', color: '#e2e8f0', maxWidth: 900 }}>
      <div style={{ marginBottom: 6, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Model Training</div>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>
        Phase 1 — turning CYC&rsquo;s outcome history and Data Hub metrics into a versioned, trainable
        dataset. Nothing here changes live scores; the transparent heuristic remains the source of truth.
      </p>

      {/* readiness */}
      <div style={{ ...card, marginBottom: 20, borderColor: ready ? 'rgba(52,211,153,0.35)' : 'rgba(251,191,36,0.30)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ready ? '#34d399' : '#fbbf24' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: ready ? '#6ee7b7' : '#fcd34d' }}>
            {ready ? 'Ready to train a learned model' : 'Collecting labeled outcomes'}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.6 }}>
          {ready
            ? `You have ${total} labeled examples across both outcomes — enough to train and evaluate a calibrated win-probability model in shadow mode.`
            : `A learned model needs roughly ${MIN_LABELS} labeled examples with both awarded and rejected outcomes before it can be trained responsibly. Until then, marking grant outcomes in the pipeline (awarded / rejected) is what grows this dataset.`}
        </p>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: ready ? '#34d399' : '#fbbf24', borderRadius: 999 }} />
        </div>
        <p style={{ fontSize: 11, color: '#64748b', margin: '7px 0 0' }}>{total} / {MIN_LABELS} labeled examples{!bothClasses && total > 0 ? ' · need both outcome types' : ''}</p>
      </div>

      {/* stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={stat}><div style={statNum}>{total}</div><div style={statLbl}>Labeled examples</div></div>
        <div style={stat}><div style={statNum}>{awarded}</div><div style={statLbl}>Awarded</div></div>
        <div style={stat}><div style={statNum}>{rejected}</div><div style={statLbl}>Rejected</div></div>
        <div style={stat}>
          <div style={statNum}>{snapCount}</div>
          <div style={statLbl}>Data Hub snapshots</div>
          {latestSnap && (
            <div style={{ fontSize: 10.5, color: '#475569', marginTop: 6 }}>
              last {new Date(latestSnap.taken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {latestSnap.row_count} rows
            </div>
          )}
        </div>
      </div>

      {/* real grant track record (lever #2) */}
      {track.total > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Real grant track record</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {track.overall.wins} of {track.total} decided applications won
              ({Math.round(track.overall.rawRate * 100)}%) · scoring uses a smoothed {Math.round(track.foundationRate * 100)}% foundation win-rate
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px', lineHeight: 1.6 }}>
            From CYC&rsquo;s real submission history. This replaces the old 0.35 default in the historical
            factor for foundation matches (takes effect on the next discovery / rescore).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {track.byFunder.slice(0, 10).map(f => (
              <div key={f.funder} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ color: '#cbd5e1', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.funder}</span>
                <span style={{ color: f.wins > f.losses ? '#34d399' : f.losses > f.wins ? '#f87171' : '#94a3b8', fontWeight: 600 }}>
                  {f.wins}W/{f.losses}L
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* actions */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Pipeline actions</div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px', lineHeight: 1.6 }}>
          <strong>Snapshot Data Hub</strong> saves a versioned copy of the OneDrive workbook for reproducibility.
          <strong> Rebuild training examples</strong> re-materializes features + labels from recorded grant outcomes.
        </p>
        <TrainingActions />
      </div>

      <p style={{ color: '#475569', fontSize: 11.5 }}>
        Feature spec <code>{FEATURE_SPEC_VERSION}</code>. Full approach in <code>docs/model-development-plan.md</code>.
        All training data is service-role-only and scoped to this organization.
      </p>
    </div>
  );
}
