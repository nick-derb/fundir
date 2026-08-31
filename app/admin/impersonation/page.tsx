import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// View-as (impersonation) audit trail — every time an admin started or stopped
// viewing the app as another user. Append-only, read-only, newest first.

function when(iso: string): { abs: string; rel: string } {
  const d = new Date(iso);
  const abs = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  let rel = 'just now';
  if (min >= 1 && min < 60) rel = `${min}m ago`;
  else if (min >= 60 && min < 1440) rel = `${Math.floor(min / 60)}h ago`;
  else if (min >= 1440) rel = `${Math.floor(min / 1440)}d ago`;
  return { abs, rel };
}

type Row = {
  id: string;
  admin_email: string | null;
  target_email: string | null;
  target_user_id: string;
  action: 'start' | 'stop';
  created_at: string;
};

export default async function ImpersonationAuditPage() {
  const db = createServerClient();
  const [auditRes, profilesRes] = await Promise.all([
    db.from('impersonation_audit')
      .select('id, admin_email, target_email, target_user_id, action, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    db.from('profiles').select('user_id, display_name, first_name, last_name'),
  ]);

  const rows = (auditRes.data ?? []) as Row[];
  const nameById = new Map(
    (profilesRes.data ?? []).map(p => [
      p.user_id,
      p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim(),
    ]),
  );

  const starts = rows.filter(r => r.action === 'start').length;
  const distinctTargets = new Set(rows.map(r => r.target_user_id)).size;

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };

  return (
    <div style={{ padding: '32px 36px', color: '#e2e8f0' }}>
      <div style={{ marginBottom: 6, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>View-as Log</div>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 22px' }}>
        {rows.length} event{rows.length === 1 ? '' : 's'} · {starts} session{starts === 1 ? '' : 's'} started · {distinctTargets} distinct {distinctTargets === 1 ? 'person' : 'people'} viewed
      </p>

      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>When</th>
              <th style={th}>Admin</th>
              <th style={th}>Action</th>
              <th style={th}>Viewed as</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td style={{ ...td, color: '#64748b' }} colSpan={4}>No view-as activity yet.</td></tr>
            ) : rows.map(r => {
              const t = when(r.created_at);
              const started = r.action === 'start';
              const targetName = nameById.get(r.target_user_id);
              return (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#e2e8f0' }}>{t.abs}</span>
                    <span style={{ color: '#475569', marginLeft: 8, fontSize: 11.5 }}>{t.rel}</span>
                  </td>
                  <td style={td}>{r.admin_email ?? '—'}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
                      padding: '3px 9px', borderRadius: 999,
                      color: started ? '#fca5a5' : '#94a3b8',
                      background: started ? 'rgba(239,68,68,0.10)' : 'rgba(148,163,184,0.10)',
                      border: `1px solid ${started ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.20)'}`,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: started ? '#f87171' : '#64748b' }} />
                      {started ? 'Started' : 'Exited'}
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ color: '#f1f5f9' }}>{targetName || '—'}</div>
                    <div style={{ color: '#64748b', fontSize: 11.5 }}>{r.target_email ?? r.target_user_id}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ color: '#475569', fontSize: 11.5, marginTop: 14 }}>
        Append-only record. Every &ldquo;View as&rdquo; start and exit is logged here with the admin, the
        person viewed, and the time. While viewing as someone, the session is read-only — changes are blocked.
      </p>
    </div>
  );
}
