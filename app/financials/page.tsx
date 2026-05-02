export const dynamic = 'force-dynamic';

import { AppShell } from '@/components/app-shell';
import { FinancialsShell } from '@/components/financials-shell';
import { getAllIntegrations } from '@/lib/oauth-tokens';

export default async function FinancialsPage() {
  const integrations       = await getAllIntegrations('CYC2025');
  const googleConnected    = integrations.some(i => i.provider === 'google');
  const microsoftConnected = integrations.some(i => i.provider === 'microsoft');

  return (
    <AppShell>
      <FinancialsShell
        orgCode="CYC2025"
        googleConnected={googleConnected}
        microsoftConnected={microsoftConnected}
      />
    </AppShell>
  );
}
