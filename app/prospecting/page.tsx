import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ComingSoon } from '@/components/coming-soon';

export default async function ProspectingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} userName={ctx.displayName} userAvatar={ctx.avatarUrl} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ComingSoon title="Prospecting" blurb="Automated funder discovery from IRS filings — ranked matches screened against your organization. Designing this now." />
    </AppShell>
  );
}
