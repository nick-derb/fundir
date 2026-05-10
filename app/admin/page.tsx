export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Building2, Users, Zap, TrendingUp, Activity, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatJoined(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface OrgRow {
  id: string;
  org_code: string;
  name: string;
  city: string | null;
  state: string | null;
  created_at: string;
  userCount: number;
  matchCount: number;
  activeCount: number;
  awardedCount: number;
}

async function getAdminData() {
  try {
    const db = createServerClient();

    const [orgsRes, membersRes, matchesRes, runsRes, invitesRes] = await Promise.all([
      db.from('organizations')
        .select('id, org_code, name, city, state, created_at')
        .order('created_at', { ascending: false }),
      db.from('user_organizations')
        .select('org_id, user_id, role'),
      db.from('match_results')
        .select('org_id, pipeline_stage'),
      db.from('pipeline_runs')
        .select('id, started_at, grants_discovered, grants_new, high_matches, duration_seconds')
        .order('started_at', { ascending: false })
        .limit(6),
      db.from('invite_codes')
        .select('id, active, uses_count')
        .eq('active', true),
    ]);

    const rawOrgs   = orgsRes.data   ?? [];
    const members   = membersRes.data ?? [];
    const matches   = matchesRes.data ?? [];
    const runs      = runsRes.data    ?? [];
    const invites   = invitesRes.data ?? [];

    // Build per-org stats
    const orgs: OrgRow[] = rawOrgs.map(o => {
      const orgMembers = members.filter(m => m.org_id === o.id);
      const orgMatches = matches.filter(m => m.org_id === o.id);
      return {
        ...o,
        userCount:   orgMembers.length,
        matchCount:  orgMatches.length,
        activeCount: orgMatches.filter(m =>
          ['reviewing','preparing','drafting','submitted'].includes(m.pipeline_stage)
        ).length,
        awardedCount: orgMatches.filter(m => m.pipeline_stage === 'awarded').length,
      };
    });

    const totalUsers   = new Set(members.map(m => m.user_id)).size;
    const totalMatches = matches.length;
    const totalActive  = matches.filter(m => ['reviewing','preparing','drafting','submitted'].includes(m.pipeline_stage)).length;
    const totalAwarded = matches.filter(m => m.pipeline_stage === 'awarded').length;

    return { orgs, totalUsers, totalMatches, totalActive, totalAwarded, runs, invites };
  } catch (err) {
    console.error('[admin] getAdminData error:', err);
    throw err; // let error boundary show meaningful feedback
  }
}

const S = {
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
  } as React.CSSProperties,
  label: {
    fontSize: '10px', fontWeight: 700, color: '#475569',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    margin: 0,
  },
  val: {
    fontSize: '26px', fontWeight: 800, color: '#f1f5f9',
    margin: '6px 0 2px', lineHeight: 1,
  },
  sub: { fontSize: '11px', color: '#475569', margin: 0 },
};

export default async function AdminOverviewPage() {
  const { orgs, totalUsers, totalMatches, totalActive, totalAwarded, runs, invites } = await getAdminData();

  const kpis = [
    {
      label: 'Organizations',
      value: orgs.length,
      sub: `${orgs.filter(o => Date.now() - new Date(o.created_at).getTime() < 30 * 86400_000).length} joined this month`,
      icon: Building2, color: '#0d9488', bg: 'rgba(13,148,136,0.12)',
      href: '/admin/organizations',
    },
    {
      label: 'Users',
      value: totalUsers,
      sub: `across all organizations`,
      icon: Users, color: '#818cf8', bg: 'rgba(129,140,248,0.12)',
      href: '/admin/users',
    },
    {
      label: 'Grants Tracked',
      value: totalMatches,
      sub: `${totalActive} in active pipeline`,
      icon: TrendingUp, color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',
      href: '/admin/organizations',
    },
    {
      label: 'Awards Secured',
      value: totalAwarded,
      sub: `platform-wide`,
      icon: Zap, color: '#22c55e', bg: 'rgba(34,197,94,0.12)',
      href: '/admin/organizations',
    },
    {
      label: 'Active Invite Codes',
      value: invites.length,
      sub: `${invites.reduce((s, i) => s + i.uses_count, 0)} total uses`,
      icon: Activity, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',
      href: '/admin/invites',
    },
  ];

  const stageColor: Record<string, string> = {
    discovered: '#64748b',
    reviewing:  '#818cf8',
    preparing:  '#38bdf8',
    drafting:   '#f97316',
    submitted:  '#fbbf24',
    awarded:    '#22c55e',
    rejected:   '#f87171',
  };

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1300px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ ...S.label, marginBottom: '6px' }}>Admin Console</p>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Overview
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
          Platform-wide metrics · {orgs.length} organization{orgs.length !== 1 ? 's' : ''} · {totalUsers} users
        </p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {kpis.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
          <Link key={label} href={href} style={{ textDecoration: 'none' }}>
            <div style={{ ...S.card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <p style={S.label}>{label}</p>
                <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={13} color={color} />
                </div>
              </div>
              <p style={S.val}>{value}</p>
              <p style={S.sub}>{sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Organizations table */}
      <div style={{ ...S.card, marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 2px' }}>
              Organizations
            </h2>
            <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>
              Per-org users, grants tracked, and pipeline activity
            </p>
          </div>
          <Link href="/admin/organizations" style={{ fontSize: '11px', color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>
            Manage →
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Organization', 'Org Code', 'Users', 'Grants Tracked', 'Active Pipeline', 'Awarded', 'Joined'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    fontSize: '10px', fontWeight: 700, color: '#334155',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#475569' }}>
                    No organizations registered yet.
                  </td>
                </tr>
              ) : orgs.map((org, i) => (
                <tr key={org.id} style={{
                  borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  background: 'transparent',
                }}>
                  {/* Org name */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', flexShrink: 0,
                        background: 'rgba(13,148,136,0.1)',
                        border: '1px solid rgba(13,148,136,0.2)',
                        borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488' }}>
                          {(org.org_code ?? org.name ?? '?').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0, whiteSpace: 'nowrap' }}>
                          {org.name}
                        </p>
                        {(org.city || org.state) && (
                          <p style={{ fontSize: '11px', color: '#475569', margin: '1px 0 0', whiteSpace: 'nowrap' }}>
                            {[org.city, org.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Org code */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: '11px', fontWeight: 600,
                      color: '#94a3b8',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '5px',
                      padding: '2px 7px',
                    }}>
                      {org.org_code}
                    </span>
                  </td>

                  {/* Users */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Users size={12} color="#64748b" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: org.userCount > 0 ? '#e2e8f0' : '#334155' }}>
                        {org.userCount}
                      </span>
                    </div>
                  </td>

                  {/* Grants tracked */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: org.matchCount > 0 ? '#e2e8f0' : '#334155' }}>
                      {org.matchCount}
                    </span>
                  </td>

                  {/* Active pipeline */}
                  <td style={{ padding: '14px 16px' }}>
                    {org.activeCount > 0 ? (
                      <span style={{
                        fontSize: '11px', fontWeight: 700,
                        color: '#818cf8',
                        background: 'rgba(129,140,248,0.1)',
                        border: '1px solid rgba(129,140,248,0.2)',
                        borderRadius: '5px', padding: '2px 8px',
                      }}>
                        {org.activeCount} active
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#334155' }}>—</span>
                    )}
                  </td>

                  {/* Awarded */}
                  <td style={{ padding: '14px 16px' }}>
                    {org.awardedCount > 0 ? (
                      <span style={{
                        fontSize: '11px', fontWeight: 700,
                        color: '#22c55e',
                        background: 'rgba(34,197,94,0.1)',
                        border: '1px solid rgba(34,197,94,0.2)',
                        borderRadius: '5px', padding: '2px 8px',
                      }}>
                        {org.awardedCount} won
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#334155' }}>—</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap' }}>
                      {org.created_at ? formatJoined(org.created_at) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom row: pipeline runs */}
      <div style={{ ...S.card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 2px' }}>
              Recent Pipeline Runs
            </h2>
            <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>
              Grant discovery execution history
            </p>
          </div>
          <Link href="/admin/system" style={{ fontSize: '11px', color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>
            System →
          </Link>
        </div>

        {runs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#475569' }}>
            No pipeline runs yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Run Time', 'Grants Scanned', 'New Stored', 'High Match', 'Duration'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    fontSize: '10px', fontWeight: 700, color: '#334155',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {timeAgo(run.started_at)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                    {run.grants_discovered ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#0d9488' }}>
                    {run.grants_new ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>
                    {run.high_matches ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#475569' }}>
                    {run.duration_seconds != null ? `${run.duration_seconds}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
