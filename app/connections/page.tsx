import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ComingSoon } from '@/components/coming-soon';

export default async function ConnectionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ComingSoon title="Connections" blurb="Board and relationship network mapping — warm paths from your organization to the funders you want to reach. Designing this now." />
    </AppShell>
  );
}
