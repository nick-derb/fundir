import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ComingSoon } from '@/components/coming-soon';

export default async function CultivationPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <ComingSoon title="Cultivation List" blurb="Your warm funder pipeline — invitation-only funders and board paths kept in one shared, living list. Designing this now." />
    </AppShell>
  );
}
