import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { AdminHeader, Card, Pill, Empty, timeAgo } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

// View-as (impersonation) audit trail — every time an admin started or stopped
// viewing the app as another user. Append-only, read-only, newest first.

type Row = { id: string; admin_email: string | null; target_email: string | null; target_user_id: string; action: 'start' | 'stop'; created_at: string };

export default async function ImpersonationAuditPage() {
  const db = createServerClient();
  const [auditRes, profilesRes] = await Promise.all([
    db.from('impersonation_audit').select('id, admin_email, target_email, target_user_id, action, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('profiles').select('user_id, display_name, first_name, last_name'),
  ]);

  // A missing table is a deployment problem, not "no activity": say so.
  const tableMissing = !!auditRes.error && /does not exist|relation|schema cache/i.test(auditRes.error.message);
  const rows = (auditRes.data ?? []) as Row[];
  const nameById = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim()]));
  const starts = rows.filter(r => r.action === 'start').length;
  const distinctTargets = new Set(rows.map(r => r.target_user_id)).size;

  return (
    <div className="adm-page" style={{ maxWidth: 1000 }}>
      <AdminHeader
        title="View-as Log"
        summary={`${rows.length} event${rows.length === 1 ? '' : 's'} · ${starts} session${starts === 1 ? '' : 's'} started · ${distinctTargets} distinct ${distinctTargets === 1 ? 'person' : 'people'} viewed`}
        right={<Link href="/admin/people" className="adm-link">Start a view-as from People →</Link>}
      />

      <Card>
        {tableMissing ? (
          <Empty><span style={{ color: '#f87171' }}>The impersonation_audit table is missing in this database.</span><br />Apply supabase/migrations/20260827_impersonation_audit.sql; until then, view-as sessions are not being recorded.</Empty>
        ) : rows.length === 0 ? (
          <Empty>No view-as activity yet.</Empty>
        ) : (
          <table className="adm-table">
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Viewed as</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const started = r.action === 'start';
                return (
                  <tr key={r.id} className="adm-row">
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#e2e8f0' }}>{new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      <span style={{ color: '#475569', marginLeft: 8, fontSize: 11.5 }}>{timeAgo(r.created_at)}</span>
                    </td>
                    <td>{r.admin_email ?? '—'}</td>
                    <td><Pill tone={started ? 'bad' : 'neutral'}>{started ? 'Started' : 'Exited'}</Pill></td>
                    <td>
                      <div style={{ color: '#f1f5f9' }}>{nameById.get(r.target_user_id) || '—'}</div>
                      <div style={{ color: '#64748b', fontSize: 11.5 }}>{r.target_email ?? r.target_user_id}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p style={{ color: '#475569', fontSize: 11.5, margin: 0 }}>
        Append-only record. Every &ldquo;View as&rdquo; start and exit is logged with the admin, the person viewed, and the time. While viewing as someone, the session is read-only.
      </p>
    </div>
  );
}
