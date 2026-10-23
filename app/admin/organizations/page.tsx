export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { OrgTableRow } from './org-table-row';
import { AdminHeader, Card, Empty, timeAgo } from '@/components/admin/ui';

async function getOrgs() {
  const db = createServerClient();
  const [{ data: orgs }, { data: members }] = await Promise.all([
    db.from('organizations').select('id, org_code, name, ein, city, state, fiscal_year_start, fiscal_year_end, created_at').order('created_at', { ascending: false }),
    db.from('user_organizations').select('org_id'),
  ]);
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.org_id, (counts.get(m.org_id) ?? 0) + 1);
  return (orgs ?? []).map(o => ({ ...o, userCount: counts.get(o.id) ?? 0 }));
}

function fiscalLabel(start: string | null): string {
  if (!start) return 'Jan – Dec';
  return ({ '01-01': 'Jan – Dec', '07-01': 'Jul – Jun', '10-01': 'Oct – Sep', '04-01': 'Apr – Mar' } as Record<string, string>)[start] ?? start;
}

export default async function AdminOrganizationsPage() {
  const orgs = await getOrgs();

  return (
    <div className="adm-page">
      <AdminHeader
        title="Organizations"
        summary={`${orgs.length} organization${orgs.length !== 1 ? 's' : ''} on the platform. Deleting one removes its workspace and every row that belongs to it.`}
        right={<Link href="/admin/invites" className="adm-link">Invite a new organization →</Link>}
      />
      <Card>
        {orgs.length === 0 ? (
          <Empty>No organizations yet. <Link href="/admin/invites" className="adm-link">Create an invite code to get started →</Link></Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead><tr><th>Organization</th><th>EIN</th><th>Location</th><th>Code</th><th>Users</th><th>Fiscal year</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {orgs.map(org => (
                  <OrgTableRow key={org.id} org={org} fiscalLabel={fiscalLabel(org.fiscal_year_start)} timeAgo={timeAgo(org.created_at)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
