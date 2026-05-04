export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Users } from 'lucide-react';

async function getUsers() {
  const db = createServerClient();
  // list all auth users via service role
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error || !data) return [];
  const { users } = data;

  // fetch their org memberships
  const { data: memberships } = await db
    .from('user_organizations')
    .select('user_id, role, org:organizations(org_code, name)');

  const memMap: Record<string, { role: string; org_code: string; org_name: string }[]> = {};
  for (const m of memberships ?? []) {
    if (!memMap[m.user_id]) memMap[m.user_id] = [];
    const org = m.org as unknown as { org_code: string; name: string } | null;
    memMap[m.user_id].push({ role: m.role, org_code: org?.org_code ?? '—', org_name: org?.name ?? '—' });
  }

  return users.map(u => ({
    id: u.id,
    email: u.email ?? '—',
    created_at: u.created_at,
    last_sign_in: u.last_sign_in_at ?? null,
    orgs: memMap[u.id] ?? [],
  }));
}

function timeAgo(ts: string | null) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default async function AdminUsersPage() {
  const users = await getUsers();
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase();

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '28px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Admin Console
        </p>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
          Users
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
          {users.length} registered account{users.length !== 1 ? 's' : ''}.
        </p>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {users.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Users size={32} color="#1e293b" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', color: '#475569' }}>No users registered yet.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Email', 'Organizations', 'Role', 'Joined', 'Last Sign In', 'Tag'].map(h => (
                  <th key={h} style={{
                    padding: '11px 16px', textAlign: 'left',
                    fontSize: '10px', fontWeight: 700,
                    color: '#334155', letterSpacing: '0.07em', textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const isOwner = u.email.toLowerCase() === adminEmail;
                return (
                  <tr key={u.id} style={{
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: isOwner ? 600 : 400 }}>
                        {u.email}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {u.orgs.length === 0 ? (
                        <span style={{ fontSize: '12px', color: '#334155', fontStyle: 'italic' }}>No org</span>
                      ) : u.orgs.map((o, idx) => (
                        <span key={idx} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px', marginRight: '4px',
                          background: 'rgba(13,148,136,0.08)',
                          border: '1px solid rgba(13,148,136,0.15)',
                          borderRadius: '5px',
                          fontSize: '11px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#0d9488',
                        }}>
                          {o.org_code}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize' }}>
                        {u.orgs[0]?.role ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: '12px', color: '#475569' }}>
                      {timeAgo(u.created_at)}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: '12px', color: '#475569' }}>
                      {timeAgo(u.last_sign_in)}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {isOwner && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px',
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: '5px',
                          fontSize: '10px', fontWeight: 700, color: '#f87171',
                        }}>
                          Owner
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
