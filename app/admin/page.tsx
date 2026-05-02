export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Building2, Users, Zap, TrendingUp, Activity, Clock } from 'lucide-react';
import Link from 'next/link';

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function getAdminStats() {
  const db = createServerClient();

  const [orgsRes, matchesRes, runsRes, invitesRes] = await Promise.all([
    db.from('organizations').select('id, org_code, name, ein, city, state, created_at').order('created_at', { ascending: false }),
    db.from('match_results').select('id, composite_score, pipeline_stage'),
    db.from('pipeline_runs').select('id, started_at, grants_discovered, grants_new, high_matches, duration_seconds').order('started_at', { ascending: false }).limit(8),
    db.from('invite_codes').select('id, code, label, uses_count, max_uses, active').order('created_at', { ascending: false }),
  ]);

  const orgs    = orgsRes.data ?? [];
  const matches = matchesRes.data ?? [];
  const runs    = runsRes.data ?? [];
  const invites = invitesRes.data ?? [];

  const activeMatches = matches.filter(m =>
    ['reviewing','preparing','drafting','submitted'].includes(m.pipeline_stage)
  );
  const awarded = matches.filter(m => m.pipeline_stage === 'awarded');

  return { orgs, matches, runs, invites, activeMatches, awarded };
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
  padding: '20px 24px',
};

export default async function AdminOverviewPage() {
  const { orgs, matches, runs, invites, activeMatches, awarded } = await getAdminStats();

  const kpis = [
    {
      label: 'Organizations',
      value: orgs.length,
      sub: `${orgs.filter(o => {
        const d = new Date(o.created_at);
        return Date.now() - d.getTime() < 7 * 86400_000;
      }).length} joined this week`,
      icon: Building2,
      color: '#0d9488',
      bg: 'rgba(13,148,136,0.12)',
      href: '/admin/organizations',
    },
    {
      label: 'Grants Tracked',
      value: matches.length,
      sub: `${activeMatches.length} in active pipeline`,
      icon: TrendingUp,
      color: '#818cf8',
      bg: 'rgba(129,140,248,0.12)',
      href: '/admin/organizations',
    },
    {
      label: 'Awards Secured',
      value: awarded.length,
      sub: `across all organizations`,
      icon: Zap,
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      href: '/admin/organizations',
    },
    {
      label: 'Pipeline Runs',
      value: runs.length,
      sub: runs[0] ? `Last: ${timeAgo(runs[0].started_at)}` : 'No runs yet',
      icon: Activity,
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.12)',
      href: '/admin/system',
    },
    {
      label: 'Invite Codes',
      value: invites.filter(i => i.active).length,
      sub: `${invites.reduce((s, i) => s + i.uses_count, 0)} total uses`,
      icon: Users,
      color: '#f87171',
      bg: 'rgba(248,113,113,0.12)',
      href: '/admin/invites',
    },
  ];

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1200px' }}>

      {/* Page header */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Admin Console
        </p>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
          Overview
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
          Platform-wide metrics across all registered organizations.
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '32px' }}>
        {kpis.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
          <Link key={label} href={href} style={{ textDecoration: 'none' }}>
            <div style={{ ...CARD, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {label}
                </span>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} color={color} />
                </div>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px', lineHeight: 1 }}>
                {value}
              </p>
              <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>{sub}</p>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Recent Organizations */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
              Recent Organizations
            </h2>
            <Link href="/admin/organizations" style={{ fontSize: '11px', color: '#0d9488', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {orgs.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#475569', textAlign: 'center', padding: '20px 0' }}>
              No organizations yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {orgs.slice(0, 6).map(org => (
                <div key={org.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                      width: '30px', height: '30px',
                      background: 'rgba(13,148,136,0.1)',
                      border: '1px solid rgba(13,148,136,0.2)',
                      borderRadius: '7px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488' }}>
                        {org.org_code?.slice(0, 2)}
                      </span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {org.name}
                      </p>
                      <p style={{ fontSize: '11px', color: '#475569', margin: '1px 0 0' }}>
                        {org.city && org.state ? `${org.city}, ${org.state}` : org.org_code}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: '#334155', flexShrink: 0, marginLeft: '8px' }}>
                    {org.created_at ? timeAgo(org.created_at) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Pipeline Runs */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
              Recent Pipeline Runs
            </h2>
            <Link href="/admin/system" style={{ fontSize: '11px', color: '#0d9488', textDecoration: 'none' }}>
              System →
            </Link>
          </div>
          {runs.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#475569', textAlign: 'center', padding: '20px 0' }}>
              No pipeline runs yet.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Time', 'Found', 'New', 'High'].map(h => (
                      <th key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px 10px 0', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr key={run.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 8px 8px 0', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {timeAgo(run.started_at)}
                      </td>
                      <td style={{ padding: '8px 8px 8px 0', fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                        {run.grants_discovered}
                      </td>
                      <td style={{ padding: '8px 8px 8px 0', fontSize: '13px', fontWeight: 700, color: '#0d9488' }}>
                        {run.grants_new}
                      </td>
                      <td style={{ padding: '8px 0', fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>
                        {run.high_matches}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
