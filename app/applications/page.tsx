import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ComingSoon } from '@/components/coming-soon';

export default async function ApplicationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ComingSoon title="Applications" blurb="Write, track, and submit grant applications — requirements read against what your organization can show. Designing this now." />
    </AppShell>
  );
}
