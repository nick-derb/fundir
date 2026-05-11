export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { OrgTableRow } from './org-table-row';

async function getOrgs() {
  const db = createServerClient();
  const { data } = await db
    .from('organizations')
    .select('id, org_code, name, ein, city, state, fiscal_year_start, fiscal_year_end, created_at')
    .order('created_at', { ascending: false });
  return data ?? [];
}

function fiscalLabel(start: string | null): string {
  if (!start) return 'Jan – Dec';
  const map: Record<string, string> = {
    '01-01': 'Jan – Dec',
    '07-01': 'Jul – Jun',
    '10-01': 'Oct – Sep',
    '04-01': 'Apr – Mar',
  };
  return map[start] ?? start;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default async function AdminOrganizationsPage() {
  const orgs = await getOrgs();

  return (
    <div style={{ padding: '36px 40px', maxWidth: '1200px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Admin Console
          </p>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: '-0.02em' }}>
            Organizations
          </h1>
          <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>
            {orgs.length} organization{orgs.length !== 1 ? 's' : ''} registered on the platform.
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px',
          background: 'rgba(13,148,136,0.08)',
          border: '1px solid rgba(13,148,136,0.2)',
          borderRadius: '8px',
          fontSize: '12px', fontWeight: 600, color: '#0d9488',
        }}>
          <Building2 size={13} />
          {orgs.length} total
        </div>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {orgs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Building2 size={32} color="#1e293b" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', color: '#475569' }}>No organizations registered yet.</p>
            <Link href="/admin/invites" style={{ fontSize: '13px', color: '#0d9488' }}>
              Create an invite code to get started →
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Organization', 'EIN', 'Location', 'Org Code', 'Fiscal Year', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px',
                    fontSize: '10px', fontWeight: 700,
                    color: '#334155',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    textAlign: 'left',
                    background: 'rgba(0,0,0,0.2)',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map((org, i) => (
                <OrgTableRow
                  key={org.id}
                  org={org}
                  isFirst={i === 0}
                  fiscalLabel={fiscalLabel(org.fiscal_year_start)}
                  timeAgo={org.created_at ? timeAgo(org.created_at) : '—'}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
