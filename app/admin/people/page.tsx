import { createServerClient } from '@/lib/supabase';
import { getAuthContext } from '@/lib/auth-context';
import { isAdminEmail } from '@/lib/admin-emails';
import { ViewAsButton } from '@/components/admin/view-as-button';
import { AdminHeader, Card, Pill, Empty, MONO, timeAgo, fmtDate } from '@/components/admin/ui';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Every account on the platform: who they are, which workspace they belong
// to and with what role, whether they finished onboarding and connected a
// calendar, and when they last signed in. Read-only apart from "View as".

export default async function AdminPeoplePage() {
  const ctx = await getAuthContext();
  // The real admin, even if they happen to be mid-impersonation.
  const meId = ctx?.realAdmin?.id ?? ctx?.userId;
  const db = createServerClient();
  const [authRes, profilesRes, membersRes, integRes, allowRes] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 200 }),
    db.from('profiles').select('user_id, first_name, last_name, display_name, role, onboarded_at, avatar_url'),
    db.from('user_organizations').select('user_id, role, organizations(name, org_code)'),
    db.from('user_integrations').select('user_id').eq('provider', 'microsoft'),
    db.from('access_allowlist').select('email'),
  ]);

  const users = authRes.data?.users ?? [];
  const profileById = new Map((profilesRes.data ?? []).map(p => [p.user_id, p]));
  const membersById = new Map<string, Array<{ role: string; org_code: string; org_name: string }>>();
  for (const m of membersRes.data ?? []) {
    const org = m.organizations as unknown as { name?: string; org_code?: string } | null;
    const list = membersById.get(m.user_id) ?? [];
    list.push({ role: String(m.role ?? 'member'), org_code: org?.org_code ?? '—', org_name: org?.name ?? '—' });
    membersById.set(m.user_id, list);
  }
  const calSet = new Set((integRes.data ?? []).map(i => i.user_id));
  const allowlisted = new Set((allowRes.data ?? []).map(a => String(a.email).toLowerCase()));

  const rows = users.map(u => {
    const p = profileById.get(u.id);
    const name = p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
    const email = u.email ?? '—';
    return {
      id: u.id, email,
      name: name || '—',
      avatar: p?.avatar_url ?? null,
      title: p?.role || '',
      orgs: membersById.get(u.id) ?? [],
      platformAdmin: isAdminEmail(email),
      allowlisted: allowlisted.has(email.toLowerCase()),
      onboarded: !!p?.onboarded_at,
      calendar: calSet.has(u.id),
      provider: (u.app_metadata?.provider as string | undefined) ?? 'email',
      joined: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
    };
  }).sort((a, b) => (b.lastSignIn ?? '').localeCompare(a.lastSignIn ?? ''));

  const noOrg = rows.filter(r => r.orgs.length === 0).length;
  const onboardedCount = rows.filter(r => r.onboarded).length;
  const calCount = rows.filter(r => r.calendar).length;

  return (
    <div className="adm-page">
      <AdminHeader
        title="People"
        summary={<>{rows.length} account{rows.length === 1 ? '' : 's'} · {onboardedCount} onboarded · {calCount} calendar-connected{noOrg ? <> · <span style={{ color: '#fbbf24' }}>{noOrg} without a workspace</span></> : null}</>}
        right={<Link href="/admin/access" className="adm-link">Manage who can sign in →</Link>}
      />

      <Card>
        {rows.length === 0 ? <Empty>No accounts found.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Person</th><th>Workspace</th><th>Role</th><th>Setup</th><th>Joined</th><th>Last sign-in</th><th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="adm-row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {r.avatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={r.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
                          : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', flex: 'none' }}>{(r.name[0] || r.email[0] || '?').toUpperCase()}</div>}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: '#f1f5f9', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.name}
                            {r.platformAdmin && <Pill tone="bad">Platform admin</Pill>}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 11.5 }}>{r.email}{r.title ? ` · ${r.title}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.orgs.length === 0
                        ? <Pill tone={r.allowlisted ? 'warn' : 'neutral'}>{r.allowlisted ? 'Allowlisted, not yet joined' : 'No workspace'}</Pill>
                        : r.orgs.map(o => <span key={o.org_code} title={o.org_name} style={{ marginRight: 4 }}><Pill tone="accent">{o.org_code}</Pill></span>)}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{r.orgs[0]?.role ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5 }}>
                        <span style={{ color: r.onboarded ? '#34d399' : '#64748b' }}>{r.onboarded ? '● Onboarded' : '○ Onboarding pending'}</span>
                        <span style={{ color: r.calendar ? '#34d399' : '#64748b' }}>{r.calendar ? '● Calendar connected' : '○ No calendar'}</span>
                      </div>
                    </td>
                    <td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      <div>{fmtDate(r.joined)}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>via {r.provider === 'azure' ? 'Microsoft' : r.provider === 'google' ? 'Google' : 'email'}</div>
                    </td>
                    <td style={{ ...MONO, color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(r.lastSignIn)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.id === meId
                        ? <span style={{ fontSize: 11, color: '#475569' }}>You</span>
                        : <ViewAsButton userId={r.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p style={{ color: '#475569', fontSize: 11.5, margin: 0 }}>
        &ldquo;View as&rdquo; opens the app exactly as that person sees it, read-only, with a banner pinned while you look. Every session is recorded in the <Link href="/admin/impersonation" className="adm-link">View-as Log</Link>.
      </p>
    </div>
  );
}
