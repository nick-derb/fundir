import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ConnectionsView } from '@/components/connections/connections-view';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ConnectionsView />
    </AppShell>
  );
}
