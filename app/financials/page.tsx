export const dynamic = 'force-dynamic';

import { getAuthContext } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { FinancialsShell } from '@/components/financials-shell';
import { getAllIntegrations } from '@/lib/oauth-tokens';
import { redirect } from 'next/navigation';

export default async function FinancialsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const integrations       = await getAllIntegrations(ctx.orgCode);
  const googleConnected    = integrations.some(i => i.provider === 'google');
  const microsoftConnected = integrations.some(i => i.provider === 'microsoft');

  const shellProps = {
    orgCode:            ctx.orgCode,
    orgId:              ctx.orgId,
    orgName:            ctx.orgName,
    googleConnected,
    microsoftConnected,
  };

  // CYC gets its own shell with proprietary financial data — never loaded for other orgs
  if (ctx.orgCode === 'CYC2025') {
    const { CYCFinancialsShell } = await import('@/components/cyc-financials-shell');
    return (
      <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
        <CYCFinancialsShell key={ctx.orgCode} {...shellProps} />
      </AppShell>
    );
  }

  return (
    <AppShell orgName={ctx.orgName} orgId={ctx.orgId} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <FinancialsShell key={ctx.orgCode} {...shellProps} />
    </AppShell>
  );
}
