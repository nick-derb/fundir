import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { ViewAsButton } from '@/components/admin/view-as-button';

export const dynamic = 'force-dynamic';

// Founder "People" roster — every account with profile, onboarding + calendar
// status, and last login, so the owner can confirm everyone's set up. Read-only.

function ago(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function AdminPeoplePage() {
  const ctx = await getAuthContext();
  // The real admin, even if they happen to be mid-impersonation.
  const meId = ctx?.realAdmin?.id ?? ctx?.userId;
  const db = createServerClient();
  const [authRes, profilesRes, membersRes, integRes] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 200 }),
    db.from('profiles').select('user_id, first_name, last_name, display_name, role, onboarded_at, avatar_url'),
    db.from('user_organizations').select('user_id, role, organizations(name, org_code)'),
    db.from('user_integrations').select('user_id').eq('provider', 'microsoft'),
  ]);

  const users = authRes.data?.users ?? [];
  const profileById = new Map((profilesRes.data ?? []).map(p => [p.user_id, p]));
  const memberById = new Map((membersRes.data ?? []).map(m => [m.user_id, m]));
  const calSet = new Set((integRes.data ?? []).map(i => i.user_id));

  const rows = users.map(u => {
    const p = profileById.get(u.id);
    const m = memberById.get(u.id) as { role?: string; organizations?: { name?: string; org_code?: string } | null } | undefined;
    const org = m?.organizations ?? null;
    const name = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
    return {
      id: u.id,
      email: u.email ?? '—',
      name: name || '—',
      avatar: p?.avatar_url ?? null,
      org: org?.name ?? '—',
      role: p?.role || m?.role || '—',
      onboarded: !!p?.onboarded_at,
      calendar: calSet.has(u.id),
      lastSignIn: u.last_sign_in_at,
    };
  }).sort((a, b) => (b.lastSignIn ?? '').localeCompare(a.lastSignIn ?? ''));

  const onboardedCount = rows.filter(r => r.onboarded).length;
  const calCount = rows.filter(r => r.calendar).length;

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };
  const pill = (on: boolean, yes: string, no: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
    color: on ? '#34d399' : '#64748b',
  });

  return (
    <div style={{ padding: '32px 36px', color: '#e2e8f0' }}>
      <div style={{ marginBottom: 6, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>People</div>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 22px' }}>
        {rows.length} account{rows.length === 1 ? '' : 's'} · {onboardedCount} onboarded · {calCount} calendar-connected
      </p>

      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Person</th>
              <th style={th}>Organization</th>
              <th style={th}>Role</th>
              <th style={th}>Onboarded</th>
              <th style={th}>Calendar</th>
              <th style={th}>Last login</th>
              <th style={{ ...th, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td style={{ ...td, color: '#64748b' }} colSpan={7}>No accounts found.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {r.avatar
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
                      : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', flex: 'none' }}>{(r.name[0] || r.email[0] || '?').toUpperCase()}</div>}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{r.name}</div>
                      <div style={{ color: '#64748b', fontSize: 11.5 }}>{r.email}</div>
                    </div>
                  </div>
                </td>
                <td style={td}>{r.org}</td>
                <td style={td}>{r.role}</td>
                <td style={td}><span style={pill(r.onboarded, '', '')}>{r.onboarded ? '● Complete' : '○ Pending'}</span></td>
                <td style={td}><span style={pill(r.calendar, '', '')}>{r.calendar ? '● Connected' : '○ Not connected'}</span></td>
                <td style={{ ...td, color: '#94a3b8', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{ago(r.lastSignIn)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {r.id === meId
                    ? <span style={{ fontSize: 11, color: '#475569' }}>You</span>
                    : <ViewAsButton userId={r.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: '#475569', fontSize: 11.5, marginTop: 14 }}>
        &ldquo;View as&rdquo; opens the app exactly as that person sees it. A banner stays pinned while
        you&rsquo;re viewing, and every session is recorded in the impersonation audit log.
      </p>
    </div>
  );
}
