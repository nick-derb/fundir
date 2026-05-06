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

  return (
    <AppShell orgName={ctx.orgName} userEmail={ctx.email} isAdmin={ctx.isAdmin} availableOrgs={ctx.availableOrgs} currentOrgCode={ctx.orgCode}>
      <FinancialsShell
        orgCode={ctx.orgCode}
        googleConnected={googleConnected}
        microsoftConnected={microsoftConnected}
      />
    </AppShell>
  );
}
