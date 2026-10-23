export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { AdminHeader, Card, Pill, Empty, Stat, MONO, timeAgo, fmtDate } from '@/components/admin/ui';

const ACTIVE_STAGES = ['reviewing', 'preparing', 'drafting', 'submitted'];

interface OrgRow {
  id: string; org_code: string; name: string; city: string | null; state: string | null; created_at: string;
  userCount: number; matchCount: number; activeCount: number; awardedCount: number;
}

async function getAdminData() {
  const db = createServerClient();
  const [orgsRes, membersRes, matchesRes, runsRes, invitesRes, pendingRes] = await Promise.all([
    db.from('organizations').select('id, org_code, name, city, state, created_at').order('created_at', { ascending: false }),
    db.from('user_organizations').select('org_id, user_id, role'),
    db.from('match_results').select('org_id, pipeline_stage'),
    db.from('pipeline_runs').select('id, started_at, grants_discovered, grants_new, high_matches, duration_seconds, error_message').order('started_at', { ascending: false }).limit(6),
    db.from('invite_codes').select('id, active, uses_count').eq('active', true),
    db.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const members = membersRes.data ?? [];
  const matches = matchesRes.data ?? [];
  const orgs: OrgRow[] = (orgsRes.data ?? []).map(o => {
    const om = matches.filter(m => m.org_id === o.id);
    return {
      ...o,
      userCount: members.filter(m => m.org_id === o.id).length,
      matchCount: om.length,
      activeCount: om.filter(m => ACTIVE_STAGES.includes(m.pipeline_stage)).length,
      awardedCount: om.filter(m => m.pipeline_stage === 'awarded').length,
    };
  });
  const now = Date.now();
  return {
    orgs,
    newThisMonth: orgs.filter(o => now - new Date(o.created_at).getTime() < 30 * 86_400_000).length,
    totalUsers: new Set(members.map(m => m.user_id)).size,
    totalMatches: matches.length,
    totalActive: matches.filter(m => ACTIVE_STAGES.includes(m.pipeline_stage)).length,
    totalAwarded: matches.filter(m => m.pipeline_stage === 'awarded').length,
    runs: runsRes.data ?? [],
    invites: invitesRes.data ?? [],
    pendingRequests: pendingRes.count ?? 0,
  };
}

export default async function AdminOverviewPage() {
  const { orgs, newThisMonth, totalUsers, totalMatches, totalActive, totalAwarded, runs, invites, pendingRequests } = await getAdminData();

  return (
    <div className="adm-page">
      <AdminHeader
        title="Overview"
        summary={<>Platform-wide · {orgs.length} organization{orgs.length !== 1 ? 's' : ''} · {totalUsers} user{totalUsers !== 1 ? 's' : ''}{pendingRequests ? <> · <Link href="/admin/access" style={{ color: '#fbbf24' }}>{pendingRequests} access request{pendingRequests === 1 ? '' : 's'} waiting</Link></> : null}</>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/organizations" style={{ textDecoration: 'none' }}><Stat label="Organizations" value={orgs.length} sub={`${newThisMonth} joined this month`} /></Link>
        <Link href="/admin/people" style={{ textDecoration: 'none' }}><Stat label="Users" value={totalUsers} sub="with a workspace" /></Link>
        <Stat label="Grants tracked" value={totalMatches} sub={`${totalActive} in active pipeline`} />
        <Stat label="Awards secured" value={totalAwarded} sub="platform-wide" tone="#4ade80" />
        <Link href="/admin/invites" style={{ textDecoration: 'none' }}><Stat label="Active invite codes" value={invites.length} sub={`${invites.reduce((s, i) => s + (i.uses_count ?? 0), 0)} total uses`} /></Link>
      </div>

      <Card title="Organizations" subtitle="Per-workspace users, grants tracked, and pipeline activity" action={<Link href="/admin/organizations" className="adm-link">Manage →</Link>}>
        {orgs.length === 0 ? <Empty>No organizations registered yet.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead><tr><th>Organization</th><th>Code</th><th>Users</th><th>Grants</th><th>Active</th><th>Awarded</th><th>Joined</th></tr></thead>
              <tbody>
                {orgs.map(org => (
                  <tr key={org.id} className="adm-row">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, flexShrink: 0, background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0d9488' }}>
                          {(org.org_code ?? org.name ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>{org.name}</div>
                          {(org.city || org.state) && <div style={{ fontSize: 11, color: '#64748b' }}>{[org.city, org.state].filter(Boolean).join(', ')}</div>}
                        </div>
                      </div>
                    </td>
                    <td><Pill tone="neutral">{org.org_code}</Pill></td>
                    <td style={{ color: org.userCount ? '#e2e8f0' : '#475569', fontWeight: 600 }}>{org.userCount}</td>
                    <td style={{ color: org.matchCount ? '#e2e8f0' : '#475569', fontWeight: 600 }}>{org.matchCount}</td>
                    <td>{org.activeCount ? <Pill tone="info">{org.activeCount} active</Pill> : <span style={{ color: '#475569' }}>—</span>}</td>
                    <td>{org.awardedCount ? <Pill tone="good">{org.awardedCount} won</Pill> : <span style={{ color: '#475569' }}>—</span>}</td>
                    <td style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(org.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Recent pipeline runs" subtitle="Grant discovery execution history" action={<Link href="/admin/system" className="adm-link">System →</Link>}>
        {runs.length === 0 ? <Empty>No pipeline runs yet.</Empty> : (
          <table className="adm-table">
            <thead><tr><th>Run</th><th>Scanned</th><th>New</th><th>High match</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} className="adm-row">
                  <td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{timeAgo(run.started_at)}</td>
                  <td style={{ fontWeight: 600 }}>{run.grants_discovered ?? '—'}</td>
                  <td style={{ fontWeight: 700, color: '#2dd4bf' }}>{run.grants_new ?? '—'}</td>
                  <td style={{ fontWeight: 700, color: '#4ade80' }}>{run.high_matches ?? '—'}</td>
                  <td style={{ ...MONO, color: '#64748b', fontSize: 12 }}>{run.duration_seconds != null ? `${run.duration_seconds}s` : '—'}</td>
                  <td>{run.error_message ? <Pill tone="bad">Error</Pill> : <Pill tone="good">OK</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
