export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Activity, CheckCircle, AlertCircle, Clock } from 'lucide-react';

async function getSystemData() {
  const db = createServerClient();
  const [runsRes, matchesRes] = await Promise.all([
    db.from('pipeline_runs')
      .select('id, started_at, grants_discovered, grants_new, high_matches, medium_matches, duration_seconds, error_message')
      .order('started_at', { ascending: false })
      .limit(20),
    db.from('match_results').select('id, composite_score, pipeline_stage, matched_at').order('matched_at', { ascending: false }).limit(5),
  ]);

  // Check Supabase connectivity
  const supabaseOk = !runsRes.error;

  return {
    runs: runsRes.data ?? [],
    recentMatches: matchesRes.data ?? [],
    supabaseOk,
  };
}

function formatDuration(s: number | null): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
};

export default async function AdminSystemPage() {
  const { runs, recentMatches, supabaseOk } = await getSystemData();

  const checks = [
    { label: 'Supabase DB',       ok: supabaseOk,  note: supabaseOk ? 'Connected' : 'Connection error' },
    { label: 'Anthropic API',     ok: !!process.env.ANTHROPIC_API_KEY, note: process.env.ANTHROPIC_API_KEY ? 'Key configured' : 'Missing key' },
    { label: 'OpenAI API',        ok: !!process.env.OPENAI_API_KEY,    note: process.env.OPENAI_API_KEY    ? 'Key configured' : 'Missing key' },
    { label: 'Google OAuth',      ok: !!process.env.GOOGLE_CLIENT_ID,  note: process.env.GOOGLE_CLIENT_ID  ? 'Configured' : 'Not configured' },
    { label: 'Microsoft OAuth',   ok: !!process.env.MICROSOFT_CLIENT_ID, note: process.env.MICROSOFT_CLIENT_ID ? 'Configured' : 'Not configured' },
    { label: 'Invite Codes',      ok: (process.env.FUNDIR_INVITE_CODES ?? '').length > 0, note: `${(process.env.FUNDIR_INVITE_CODES ?? '').split(',').filter(Boolean).length} env codes` },
    { label: 'Admin Guard',       ok: !!process.env.ADMIN_EMAIL, note: process.env.ADMIN_EMAIL ? `${process.env.ADMIN_EMAIL}` : 'Not set — anyone can access /admin!' },
  ];

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Admin Console
        </p>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
          System
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
          Infrastructure health and pipeline run history.
        </p>
      </div>

      {/* Health checks */}
      <div style={{ ...CARD, padding: '20px 24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={14} color="#0d9488" />
          Configuration Health
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {checks.map(({ label, ok, note }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px',
              background: ok ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
              border: `1px solid ${ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
              borderRadius: '8px',
            }}>
              {ok
                ? <CheckCircle size={14} color="#22c55e" />
                : <AlertCircle size={14} color="#f87171" />
              }
              <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{label}</p>
                <p style={{ fontSize: '11px', color: ok ? '#4ade80' : '#f87171', margin: '1px 0 0', wordBreak: 'break-all' }}>{note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline run log */}
      <div style={CARD}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} color="#0d9488" />
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
            Pipeline Run Log — Last {runs.length} Runs
          </h2>
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
            No pipeline runs recorded yet. Run grant discovery from the Discover page.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Timestamp', 'Discovered', 'New', 'High', 'Medium', 'Duration', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#334155', letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.id} style={{
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(run.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>{run.grants_discovered}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#0d9488' }}>{run.grants_new}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>{run.high_matches}</td>
                    <td style={{ padding: '11px 16px', fontSize: '13px', fontWeight: 700, color: '#fbbf24' }}>{run.medium_matches}</td>
                    <td style={{ padding: '11px 16px', fontSize: '12px', color: '#64748b' }}>{formatDuration(run.duration_seconds)}</td>
                    <td style={{ padding: '11px 16px' }}>
                      {run.error_message ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '5px', fontSize: '10px', fontWeight: 600, color: '#f87171' }}>
                          Error
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '5px', fontSize: '10px', fontWeight: 600, color: '#22c55e' }}>
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
